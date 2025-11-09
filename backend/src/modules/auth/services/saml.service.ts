import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { parseStringPromise } from 'xml2js';
import { create } from 'xmlbuilder2';
import { SamlConfig } from '../entities/saml-config.entity';
import { User } from '../entities/user.entity';

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
export class SamlService implements OnModuleDestroy {
  // TODO: In-memory cache for processed assertion IDs (use Redis in production)
  private readonly processedAssertions = new Map<string, Date>();
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(SamlConfig)
    private readonly samlConfigRepository: Repository<SamlConfig>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {
    // Clean up expired assertions every 5 minutes
    this.cleanupIntervalId = setInterval(
      () => this.cleanupExpiredAssertions(),
      5 * 60 * 1000,
    );
  }

  /**
   * Clean up interval on module destruction to prevent memory leaks
   */
  onModuleDestroy() {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
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
  async generateSpMetadata(): Promise<string> {
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

    return doc.end({ prettyPrint: true });
  }

  /**
   * Validate SAML assertion
   * Note: Signature validation is handled by passport-saml strategy
   * This method validates additional assertion properties
   * @param assertion SAML assertion object from passport-saml
   * @returns Validation result with errors if invalid
   */
  async validateSamlAssertion(assertion: any): Promise<ValidationResult> {
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
      const notBefore = new Date(assertion.notBefore);
      if (now.getTime() < notBefore.getTime() - clockSkewMs) {
        errors.push('Assertion not yet valid (NotBefore)');
      }
    }

    if (assertion.notOnOrAfter) {
      const notOnOrAfter = new Date(assertion.notOnOrAfter);
      if (now.getTime() >= notOnOrAfter.getTime() + clockSkewMs) {
        errors.push('Assertion expired (NotOnOrAfter)');
      }
    }

    // Validate SessionNotOnOrAfter if present
    if (assertion.sessionNotOnOrAfter) {
      const sessionNotOnOrAfter = new Date(assertion.sessionNotOnOrAfter);
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
   * @param assertionId Unique assertion ID
   * @returns True if assertion was already processed
   */
  async checkAssertionReplay(assertionId: string): Promise<boolean> {
    if (!assertionId) {
      return false;
    }

    return this.processedAssertions.has(assertionId);
  }

  /**
   * Mark assertion as processed to prevent replay attacks
   * In production, use Redis with TTL for distributed systems
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

    this.processedAssertions.set(assertionId, expiresAt);
  }

  /**
   * Clean up expired assertion IDs from cache
   * Called periodically to prevent memory leaks
   */
  private cleanupExpiredAssertions(): void {
    const now = new Date();
    for (const [assertionId, expiresAt] of this.processedAssertions.entries()) {
      if (now >= expiresAt) {
        this.processedAssertions.delete(assertionId);
      }
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

    // Check for replay attack
    const assertionId = profile['ID'] || profile['id'];
    if (assertionId) {
      const isReplay = await this.checkAssertionReplay(assertionId);
      if (isReplay) {
        throw new UnauthorizedException(
          'SAML authentication failed: Assertion has already been processed. Please try again.',
        );
      }

      // Mark assertion as processed
      const notOnOrAfter =
        profile['sessionNotOnOrAfter'] || profile['notOnOrAfter'];
      const expiresAt = notOnOrAfter
        ? new Date(notOnOrAfter)
        : new Date(Date.now() + 24 * 60 * 60 * 1000); // Default 24 hours

      await this.markAssertionProcessed(assertionId, expiresAt);
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
}
