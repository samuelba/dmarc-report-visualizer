import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { parseStringPromise } from 'xml2js';
import { create } from 'xmlbuilder2';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { SamlConfig } from '../entities/saml-config.entity';
import { User } from '../entities/user.entity';
import { UserRole } from '../enums/user-role.enum';

export interface SamlConfigDto {
  idpMetadataXml?: string;
  idpEntityId?: string;
  idpSsoUrl?: string;
  idpCertificate?: string;
}

export interface ParsedIdpMetadata {
  entityId: string;
  ssoUrl: string;
  certificate: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface SamlProfile {
  nameID?: string;
  email?: string;
  issuer?: string;
  sessionIndex?: string;
  nameIDFormat?: string;
  [key: string]: any;
}

@Injectable()
export class SamlService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SamlService.name);
  private redis: Redis | null = null;
  private readonly REDIS_KEY_PREFIX = 'saml:assertion:';
  private readonly REDIS_TTL_SECONDS = 24 * 60 * 60; // 24 hours

  constructor(
    @InjectRepository(SamlConfig)
    private readonly samlConfigRepository: Repository<SamlConfig>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Initialize Redis connection on module initialization
   */
  async onModuleInit() {
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');

    try {
      this.redis = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        retryStrategy: (times) => {
          if (times > 50) {
            // Stop after 50 attempts
            this.logger.error('Max Redis retry attempts reached, giving up');
            return null; // Returning null stops retrying
          }
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
      });

      this.redis.on('error', (error) => {
        this.logger.error(`Redis connection error: ${error.message}`);
      });

      this.redis.on('connect', () => {
        this.logger.log(`Connected to Redis at ${redisHost}:${redisPort}`);
      });

      // Test connection
      await this.redis.ping();
      this.logger.log('Redis connection successful');
    } catch (error) {
      this.logger.error(
        `Failed to connect to Redis: ${error.message}. SAML replay protection will be disabled.`,
      );
      this.redis = null;
    }

    // Check if password login is force-enabled via environment variable
    const forceEnablePasswordLogin = this.configService.get<string>(
      'FORCE_ENABLE_PASSWORD_LOGIN',
      'false',
    );
    if (forceEnablePasswordLogin === 'true') {
      this.logger.warn(
        'Password login is force-enabled via environment variable. This overrides database configuration.',
      );
    }
  }

  /**
   * Clean up Redis connection on module destruction
   */
  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.logger.log('Redis connection closed');
    }
  }

  /**
   * Retrieve current SAML configuration
   * @returns SamlConfig or null if not configured
   */
  async getConfig(): Promise<SamlConfig | null> {
    const configs = await this.samlConfigRepository.find();
    return configs.length > 0 ? configs[0] : null;
  }

  /**
   * Normalize certificate format by removing BEGIN/END lines and whitespace
   * @param certificate Raw certificate string
   * @returns Normalized certificate (just the base64 content)
   */
  private normalizeCertificate(certificate: string): string {
    return certificate
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  /**
   * Create or update SAML configuration with validation
   * @param dto SAML configuration data
   * @param userId User ID performing the update
   * @returns Saved SAML configuration
   */
  async createOrUpdateConfig(
    dto: SamlConfigDto,
    userId: string,
  ): Promise<SamlConfig> {
    let idpEntityId: string;
    let idpSsoUrl: string;
    let idpCertificate: string;
    let idpMetadataXml: string | undefined;

    // Parse metadata XML if provided, otherwise use manual fields
    if (dto.idpMetadataXml) {
      const parsed = await this.parseIdpMetadata(dto.idpMetadataXml);
      idpEntityId = parsed.entityId;
      idpSsoUrl = parsed.ssoUrl;
      idpCertificate = this.normalizeCertificate(parsed.certificate);
      idpMetadataXml = dto.idpMetadataXml;
    } else {
      // Manual configuration
      if (!dto.idpEntityId || !dto.idpSsoUrl || !dto.idpCertificate) {
        throw new BadRequestException(
          'Either idpMetadataXml or all manual fields (idpEntityId, idpSsoUrl, idpCertificate) must be provided',
        );
      }
      idpEntityId = dto.idpEntityId;
      idpSsoUrl = dto.idpSsoUrl;
      idpCertificate = this.normalizeCertificate(dto.idpCertificate);
    }

    // Get SP configuration from environment
    const spEntityId = this.configService.get<string>('SAML_ENTITY_ID');
    const spAcsUrl = this.configService.get<string>('SAML_ACS_URL');

    if (!spEntityId || !spAcsUrl) {
      throw new BadRequestException(
        'SAML_ENTITY_ID and SAML_ACS_URL must be configured in environment variables',
      );
    }

    // Get existing config or create new one
    const existingConfig = await this.getConfig();

    if (existingConfig) {
      // Update existing configuration
      existingConfig.idpEntityId = idpEntityId;
      existingConfig.idpSsoUrl = idpSsoUrl;
      existingConfig.idpCertificate = idpCertificate;
      existingConfig.idpMetadataXml = idpMetadataXml || null;
      existingConfig.spEntityId = spEntityId;
      existingConfig.spAcsUrl = spAcsUrl;
      existingConfig.updatedBy = userId;

      return await this.samlConfigRepository.save(existingConfig);
    } else {
      // Create new configuration
      const newConfig = this.samlConfigRepository.create({
        idpEntityId,
        idpSsoUrl,
        idpCertificate,
        idpMetadataXml: idpMetadataXml || null,
        spEntityId,
        spAcsUrl,
        enabled: false, // Start disabled by default
        updatedBy: userId,
      });

      return await this.samlConfigRepository.save(newConfig);
    }
  }

  /**
   * Enable SAML authentication
   */
  async enableSaml(): Promise<void> {
    const config = await this.getConfig();
    if (!config) {
      throw new NotFoundException('SAML configuration not found');
    }

    // Validate that required fields are present
    if (!config.idpEntityId || !config.idpSsoUrl || !config.idpCertificate) {
      throw new BadRequestException(
        'SAML configuration is incomplete. Please configure IdP settings first.',
      );
    }

    config.enabled = true;
    await this.samlConfigRepository.save(config);
  }

  /**
   * Disable SAML authentication
   */
  async disableSaml(): Promise<void> {
    const config = await this.getConfig();
    if (!config) {
      throw new NotFoundException('SAML configuration not found');
    }

    config.enabled = false;
    await this.samlConfigRepository.save(config);
  }

  /**
   * Parse IdP metadata XML to extract configuration
   * @param xml IdP metadata XML string
   * @returns Parsed IdP metadata
   */
  async parseIdpMetadata(xml: string): Promise<ParsedIdpMetadata> {
    try {
      const result = await parseStringPromise(xml, {
        explicitArray: false,
        tagNameProcessors: [
          (name) => name.replace(/^.*:/, ''), // Remove namespace prefixes
        ],
      });

      // Navigate the parsed XML structure
      const entityDescriptor = result.EntityDescriptor;
      if (!entityDescriptor) {
        throw new BadRequestException(
          'Invalid IdP metadata: Missing EntityDescriptor',
        );
      }

      const entityId = entityDescriptor.$.entityID;
      if (!entityId) {
        throw new BadRequestException('Invalid IdP metadata: Missing entityID');
      }

      const idpSsoDescriptor = entityDescriptor.IDPSSODescriptor;
      if (!idpSsoDescriptor) {
        throw new BadRequestException(
          'Invalid IdP metadata: Missing IDPSSODescriptor',
        );
      }

      // Extract SSO URL
      let singleSignOnService = idpSsoDescriptor.SingleSignOnService;
      if (!singleSignOnService) {
        throw new BadRequestException(
          'Invalid IdP metadata: Missing SingleSignOnService',
        );
      }

      // Handle both array and single object
      if (Array.isArray(singleSignOnService)) {
        // Find HTTP-Redirect or HTTP-POST binding
        const redirectService = singleSignOnService.find(
          (s) =>
            s.$.Binding ===
              'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect' ||
            s.$.Binding === 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
        );
        singleSignOnService = redirectService || singleSignOnService[0];
      }

      const ssoUrl = singleSignOnService.$.Location;
      if (!ssoUrl) {
        throw new BadRequestException('Invalid IdP metadata: Missing SSO URL');
      }

      // Extract X.509 certificate
      let keyDescriptor = idpSsoDescriptor.KeyDescriptor;
      if (!keyDescriptor) {
        throw new BadRequestException(
          'Invalid IdP metadata: Missing KeyDescriptor',
        );
      }

      // Handle both array and single object
      if (Array.isArray(keyDescriptor)) {
        // Find signing key or use first one
        const signingKey = keyDescriptor.find(
          (k) => !k.$.use || k.$.use === 'signing',
        );
        keyDescriptor = signingKey || keyDescriptor[0];
      }

      const keyInfo = keyDescriptor.KeyInfo;
      if (!keyInfo || !keyInfo.X509Data || !keyInfo.X509Data.X509Certificate) {
        throw new BadRequestException(
          'Invalid IdP metadata: Missing X509Certificate',
        );
      }

      const certificate = keyInfo.X509Data.X509Certificate;

      return {
        entityId,
        ssoUrl,
        certificate: certificate.trim(),
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to parse IdP metadata: ${error.message}`,
      );
    }
  }

  /**
   * Generate SP metadata XML
   * @returns SAML 2.0 SP metadata XML string
   */
  generateSpMetadata(): Promise<string> {
    const spEntityId = this.configService.get<string>('SAML_ENTITY_ID');
    const spAcsUrl = this.configService.get<string>('SAML_ACS_URL');

    if (!spEntityId || !spAcsUrl) {
      throw new BadRequestException(
        'SAML_ENTITY_ID and SAML_ACS_URL must be configured in environment variables',
      );
    }

    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('md:EntityDescriptor', {
        'xmlns:md': 'urn:oasis:names:tc:SAML:2.0:metadata',
        entityID: spEntityId,
      })
      .ele('md:SPSSODescriptor', {
        protocolSupportEnumeration: 'urn:oasis:names:tc:SAML:2.0:protocol',
      })
      .ele('md:NameIDFormat')
      .txt('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress')
      .up()
      .ele('md:AssertionConsumerService', {
        Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
        Location: spAcsUrl,
        index: '1',
      })
      .up()
      .up()
      .up();

    return Promise.resolve(doc.end({ prettyPrint: true }));
  }

  /**
   * Validate SAML assertion
   * Note: Signature validation is handled by passport-saml strategy
   * This method validates additional assertion properties
   * @param assertion SAML assertion object from passport-saml
   * @returns Validation result with errors if invalid
   */
  async validateSamlAssertion(
    assertion: SamlProfile,
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const config = await this.getConfig();

    if (!config) {
      errors.push('SAML configuration not found');
      return { valid: false, errors };
    }

    const spEntityId = this.configService.get<string>('SAML_ENTITY_ID');
    const spAcsUrl = this.configService.get<string>('SAML_ACS_URL');

    // Validate Audience (if present in assertion)
    if (assertion.audience) {
      const audiences = Array.isArray(assertion.audience)
        ? assertion.audience
        : [assertion.audience];

      if (!audiences.includes(spEntityId)) {
        errors.push(`Invalid audience: expected ${spEntityId}`);
      }
    }

    // Validate Recipient (if present in SubjectConfirmationData)
    if (assertion.recipient && assertion.recipient !== spAcsUrl) {
      errors.push(`Invalid recipient: expected ${spAcsUrl}`);
    }

    // Validate timestamps
    const now = new Date();
    const clockSkewMs = 5000; // 5 seconds clock skew tolerance

    if (assertion.notBefore) {
      const notBefore = new Date(assertion.notBefore as string);
      if (now.getTime() < notBefore.getTime() - clockSkewMs) {
        errors.push('Assertion not yet valid (NotBefore)');
      }
    }

    if (assertion.notOnOrAfter) {
      const notOnOrAfter = new Date(assertion.notOnOrAfter as string);
      if (now.getTime() >= notOnOrAfter.getTime() + clockSkewMs) {
        errors.push('Assertion expired (NotOnOrAfter)');
      }
    }

    // Validate SessionNotOnOrAfter if present
    if (assertion.sessionNotOnOrAfter) {
      const sessionNotOnOrAfter = new Date(
        assertion.sessionNotOnOrAfter as string,
      );
      if (now.getTime() >= sessionNotOnOrAfter.getTime() + clockSkewMs) {
        errors.push('Session expired (SessionNotOnOrAfter)');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Check if assertion ID has been processed before (replay attack prevention)
   * Includes grace period to handle Passport's multiple validate() calls during single auth flow
   * @param assertionId Unique assertion ID
   * @returns True if assertion was already processed (outside grace period)
   */
  async checkAssertionReplay(assertionId: string): Promise<boolean> {
    if (!assertionId) {
      return false;
    }

    // If Redis is not available, skip replay detection
    if (!this.redis) {
      this.logger.warn(
        'Redis not available - SAML replay attack protection disabled',
      );
      return false;
    }

    try {
      const key = `${this.REDIS_KEY_PREFIX}${assertionId}`;
      const value = await this.redis.get(key);

      if (!value) {
        this.logger.debug(
          `Checking Redis key ${key}: NOT FOUND (new assertion)`,
        );
        return false;
      }

      // Parse the stored timestamp
      const storedTimestamp = parseInt(value, 10);
      const now = Date.now();
      const ageMs = now - storedTimestamp;

      // Grace period of 5 seconds for in-flight authentications
      // This allows Passport to call validate() multiple times for the same SAML response
      const GRACE_PERIOD_MS = 5000;

      if (ageMs < GRACE_PERIOD_MS) {
        this.logger.debug(
          `Checking Redis key ${key}: EXISTS but within grace period (${ageMs}ms old) - allowing`,
        );
        return false; // Not a replay, just concurrent validation
      }

      this.logger.debug(
        `Checking Redis key ${key}: EXISTS (${ageMs}ms old) - REPLAY DETECTED`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Redis error checking assertion replay: ${error.message}`,
      );
      // On error, allow the request to proceed (fail open)
      return false;
    }
  }

  /**
   * Mark assertion as processed to prevent replay attacks
   * Stores assertion ID with current timestamp in Redis
   * @param assertionId Unique assertion ID
   * @param expiresAt Expiration time (NotOnOrAfter from assertion)
   */
  async markAssertionProcessed(
    assertionId: string,
    expiresAt: Date,
  ): Promise<void> {
    if (!assertionId) {
      return;
    }

    // If Redis is not available, skip marking
    if (!this.redis) {
      return;
    }

    try {
      const key = `${this.REDIS_KEY_PREFIX}${assertionId}`;
      const now = Date.now();
      const expiresAtMs = expiresAt.getTime();

      // Calculate TTL in seconds, use default if expiration is in the past
      let ttlSeconds = Math.ceil((expiresAtMs - now) / 1000);
      if (ttlSeconds <= 0) {
        ttlSeconds = this.REDIS_TTL_SECONDS;
      }

      // Store current timestamp (for grace period checking)
      // Use SETNX to only set if not already set (idempotent)
      const wasSet = await this.redis.set(
        key,
        now.toString(),
        'EX',
        ttlSeconds,
        'NX',
      );

      this.logger.debug(
        `Marked assertion ${assertionId} as processed (TTL: ${ttlSeconds}s, wasSet: ${wasSet ? 'true' : 'false - already set'})`,
      );
    } catch (error) {
      this.logger.error(
        `Redis error marking assertion as processed: ${error.message}`,
      );
      // Continue even if Redis fails
    }
  }

  /**
   * Handle SAML login - find or create user from SAML profile
   * @param profile SAML profile from passport-saml
   * @returns User entity for token generation
   */
  async handleSamlLogin(profile: SamlProfile): Promise<User> {
    // Extract email from NameID or email attribute
    const email = profile.nameID || profile.email;

    if (!email) {
      throw new UnauthorizedException(
        'SAML authentication failed: No email address provided in assertion',
      );
    }

    // Check for replay attack using assertion ID or composite identifier
    // Many IdPs (like Google) don't expose the assertion ID in the profile,
    // so we create a composite identifier from available unique fields
    let assertionId = profile['ID'] || profile['id'];

    if (!assertionId) {
      // Create composite identifier from inResponseTo + sessionIndex + issuer
      // This combination should be unique for each authentication attempt
      const inResponseTo = profile['inResponseTo'];
      const sessionIndex = profile['sessionIndex'];
      const issuer = profile['issuer'];

      if (inResponseTo && sessionIndex) {
        // Use SHA-256 hash to prevent key collisions from delimiter ambiguity
        // Using || as separator to avoid conflicts with field values
        const compositeValue = `${inResponseTo}||${sessionIndex}||${issuer || 'unknown'}`;
        const hash = createHash('sha256').update(compositeValue).digest('hex');
        assertionId = `composite:${hash}`;

        this.logger.debug(
          `Using composite assertion ID hash: ${hash.substring(0, 16)}... (from inResponseTo, sessionIndex, issuer)`,
        );
      } else {
        this.logger.warn(
          `No assertion ID or sufficient fields for composite ID - replay attack protection is disabled for this login. Profile fields: inResponseTo=${inResponseTo}, sessionIndex=${sessionIndex}`,
        );
      }
    } else {
      this.logger.debug(`Using assertion ID from profile: ${assertionId}`);
    }

    if (assertionId) {
      const isReplay = await this.checkAssertionReplay(assertionId as string);
      if (isReplay) {
        this.logger.warn(
          `SAML replay attack detected for assertion ${assertionId}`,
        );
        throw new UnauthorizedException(
          'SAML authentication failed: Assertion has already been processed. Please try again.',
        );
      }

      // Mark assertion as processed
      const notOnOrAfter =
        profile['sessionNotOnOrAfter'] || profile['notOnOrAfter'];
      const expiresAt = notOnOrAfter
        ? new Date(notOnOrAfter as string)
        : new Date(Date.now() + 24 * 60 * 60 * 1000); // Default 24 hours

      await this.markAssertionProcessed(assertionId as string, expiresAt);
    }

    // Find existing user by email
    const existingUser = await this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      // Check auth provider
      if (existingUser.authProvider === 'local') {
        throw new ConflictException(
          'An account with this email already exists using password authentication. Please sign in with your password or contact your administrator to migrate to SSO.',
        );
      }

      // Authenticate existing SAML user
      if (existingUser.authProvider === 'saml') {
        return existingUser;
      }

      // Unknown auth provider
      throw new UnauthorizedException(
        `SAML authentication failed: User account has unsupported auth provider: ${existingUser.authProvider}`,
      );
    }

    // Create new SAML user
    const newUser = this.userRepository.create({
      email: email.toLowerCase(),
      passwordHash: '', // No password for SAML users
      authProvider: 'saml',
      organizationId: null,
    });

    return await this.userRepository.save(newUser);
  }

  /**
   * Enable or disable password-based login
   * @param disabled True to disable password login, false to enable
   */
  async setPasswordLoginDisabled(disabled: boolean): Promise<void> {
    const config = await this.getConfig();
    if (!config) {
      throw new NotFoundException('SAML configuration not found');
    }

    // If disabling password login, ensure there is at least one SAML admin
    if (disabled) {
      const samlAdminCount = await this.userRepository.count({
        where: {
          role: UserRole.ADMINISTRATOR,
          authProvider: 'saml',
        },
      });

      if (samlAdminCount === 0) {
        throw new ConflictException(
          'Cannot disable password login: No SAML administrators found. Please create a SAML administrator first to prevent lockout.',
        );
      }
    }

    config.disablePasswordLogin = disabled;
    await this.samlConfigRepository.save(config);
  }

  /**
   * Check if password-based login is allowed
   * Returns true if password login is allowed, false if disabled
   * Respects FORCE_ENABLE_PASSWORD_LOGIN environment variable override
   * @returns True if password login is allowed
   */
  async isPasswordLoginAllowed(): Promise<boolean> {
    // Check environment variable override first
    const forceEnablePasswordLogin = this.configService.get<string>(
      'FORCE_ENABLE_PASSWORD_LOGIN',
      'false',
    );

    if (forceEnablePasswordLogin === 'true') {
      // Force-enable overrides database configuration
      return true;
    }

    // Check database configuration
    const config = await this.getConfig();

    // If no SAML config exists, password login is allowed
    if (!config) {
      return true;
    }

    // Return opposite of disablePasswordLogin flag
    return !config.disablePasswordLogin;
  }
}
