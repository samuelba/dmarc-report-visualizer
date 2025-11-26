import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy,
  Profile,
  SamlConfig as PassportSamlConfig,
} from '@node-saml/passport-saml';
import { ConfigService } from '@nestjs/config';
import { SamlService } from '../services/saml.service';
import { User } from '../entities/user.entity';

/**
 * SAML Strategy for Passport authentication
 * Handles SAML 2.0 authentication with dynamic IdP configuration
 * Supports both SP-initiated and IdP-initiated flows
 */
@Injectable()
export class SamlStrategy extends PassportStrategy(Strategy, 'saml') {
  private readonly logger = new Logger(SamlStrategy.name);

  constructor(
    private readonly samlService: SamlService,
    private readonly configService: ConfigService,
  ) {
    super(
      {
        // SP Configuration from environment
        callbackUrl: configService.get<string>('SAML_ACS_URL') || '',
        issuer: configService.get<string>('SAML_ENTITY_ID') || '',

        // IdP Configuration - loaded dynamically
        entryPoint: '...placeholder...', // Will be loaded from database
        // Placeholder certificate - will be replaced with actual IdP certificate from database
        idpCert: '...placeholder...',

        // Security settings
        acceptedClockSkewMs: 5000, // 5 seconds clock skew tolerance

        // InResponseTo validation
        // Set to 'never' to disable (valid values: 'always', 'ifPresent', 'never')
        // Disabled because:
        // 1. Requires a cache provider to store request IDs, which we haven't configured
        // 2. We have robust custom replay protection using Redis with composite assertion IDs
        //    (inResponseTo + sessionIndex + issuer) in saml.service.ts
        // 3. Without a cache provider, validateInResponseTo causes intermittent errors
        // See: handleSamlLogin() in saml.service.ts for our replay protection implementation
        validateInResponseTo: 'never',

        // Signature validation
        // Google Workspace signs the Response, not individual Assertions
        // Can be disabled for testing with SAML_DISABLE_SIGNATURE_VALIDATION=true
        wantAssertionsSigned: false, // Google doesn't sign assertions individually
        wantAuthnResponseSigned:
          configService.get<string>('SAML_DISABLE_SIGNATURE_VALIDATION') !==
          'true',

        // Request configuration callback - loads IdP config dynamically
        passReqToCallback: false,
      } as PassportSamlConfig,
      // Verify callback - this is required by passport-saml
      async (profile: Profile, done: (err: any, user?: any) => void) => {
        try {
          const user = await this.validate(profile);
          done(null, user);
        } catch (error) {
          done(error, false);
        }
      },
    );
  }

  /**
   * Override the authenticate method to load IdP configuration dynamically
   * This is called before the SAML flow begins
   */
  authenticate(req: any, options?: any): void {
    // Load configuration asynchronously and then call parent authenticate
    this.samlService
      .getConfig()
      .then((config) => {
        if (!config) {
          throw new UnauthorizedException(
            'SAML authentication is not configured',
          );
        }

        if (!config.enabled) {
          throw new UnauthorizedException('SAML authentication is not enabled');
        }

        // Update strategy configuration with IdP details
        (this as any)._saml.options.entryPoint = config.idpSsoUrl;
        (this as any)._saml.options.idpCert = config.idpCertificate;
        (this as any)._saml.options.cert = config.idpCertificate; // Some versions use 'cert'
        (this as any)._saml.options.issuer = config.spEntityId;
        (this as any)._saml.options.callbackUrl = config.spAcsUrl;

        // Log configuration for debugging
        this.logger.debug('SAML configuration loaded', {
          entryPoint: config.idpSsoUrl,
          issuer: config.spEntityId,
          callbackUrl: config.spAcsUrl,
          certificateLength: config.idpCertificate?.length,
          certificateStart: config.idpCertificate?.substring(0, 50),
          wantAssertionsSigned: (this as any)._saml.options
            .wantAssertionsSigned,
          wantAuthnResponseSigned: (this as any)._saml.options
            .wantAuthnResponseSigned,
        });

        // Call parent authenticate method
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        super.authenticate(req, options);
      })
      .catch((error) => {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new UnauthorizedException(
          `SAML authentication failed: ${error.message}`,
        );
      });
  }

  /**
   * Validates the SAML profile and returns authenticated user
   * This method is called automatically by Passport after SAML assertion validation
   *
   * @param profile SAML profile from IdP containing user information
   * @returns User entity for token generation
   */
  async validate(profile: Profile): Promise<User> {
    try {
      this.logger.debug('Validating SAML profile', {
        nameID: profile.nameID,
        issuer: profile.issuer,
        sessionIndex: profile.sessionIndex,
      });

      // Additional assertion validation (timestamps, audience, etc.)
      const validationResult =
        await this.samlService.validateSamlAssertion(profile);

      if (!validationResult.valid) {
        const errors =
          validationResult.errors?.join(', ') || 'Unknown validation error';
        this.logger.error('SAML validation failed', errors);
        throw new UnauthorizedException(
          `SAML authentication failed: ${errors}`,
        );
      }

      // Handle user login (find or create user)
      const user = await this.samlService.handleSamlLogin(profile);

      this.logger.log(`SAML authentication successful for user: ${user.email}`);
      return user;
    } catch (error) {
      this.logger.error(
        'SAML authentication error',
        error.stack || error.message,
      );
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(
        `SAML authentication failed: ${error.message}`,
      );
    }
  }
}
