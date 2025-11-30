import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy,
  Profile,
  SamlConfig as PassportSamlConfig,
} from '@node-saml/passport-saml';
import { SamlConfig as NodeSamlConfig } from '@node-saml/node-saml';
import { ConfigService } from '@nestjs/config';
import { SamlService } from '../services/saml.service';
import { User } from '../entities/user.entity';

/**
 * SAML Test Strategy for Passport authentication
 * Separate strategy for testing SAML configuration without creating sessions
 * Key differences from production SamlStrategy:
 * - Uses SAME callback URL as production (so IdP ACS URL matches)
 * - Bypasses SAML enabled check (allows testing when disabled)
 * - Always loads fresh config from database (no caching)
 * - Returns mock user object (no database lookup)
 * - Does not create sessions or set cookies
 *
 * Note: The callback URL is the same as production (/auth/saml/callback)
 * but the test flow uses a the RelayState parameter (testMode=true) to differentiate
 * test callbacks from production callbacks.
 */
@Injectable()
export class SamlTestStrategy extends PassportStrategy(Strategy, 'saml-test') {
  private readonly logger = new Logger(SamlTestStrategy.name);

  constructor(
    private readonly samlService: SamlService,
    private readonly configService: ConfigService,
  ) {
    super(
      {
        // SP Configuration from environment
        // Use the SAME callback URL as production so IdP ACS URL matches
        callbackUrl: configService.get<string>('SAML_ACS_URL') || '',
        issuer: configService.get<string>('SAML_ENTITY_ID') || '',

        // IdP Configuration - loaded dynamically
        entryPoint: '...placeholder...', // Will be loaded from database
        idpCert: '...placeholder...', // Will be loaded from database

        // Security settings (same as production)
        acceptedClockSkewMs: 5000, // 5 seconds clock skew tolerance

        // InResponseTo validation - disabled (same as production)
        validateInResponseTo: 'never',

        // Signature validation (same as production)
        wantAssertionsSigned: false,
        wantAuthnResponseSigned:
          configService.get<string>('SAML_DISABLE_SIGNATURE_VALIDATION') !==
          'true',

        // Request configuration callback
        passReqToCallback: false,
      } as PassportSamlConfig,
      // Verify callback - required by passport-saml
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
   * Override authenticate method to load fresh config from database
   * This ensures test mode always uses the latest configuration
   * Key differences from production:
   * - Always loads fresh config (no caching)
   * - Does NOT check config.enabled flag
   * - Generates a secure nonce to prevent test mode bypass attacks
   */
  authenticate(req: any, options?: any): void {
    this.logger.log(
      'SAML Test Mode: Loading fresh configuration from database',
    );

    // Always load fresh config from database (bypass cache)
    // Also generate a secure nonce to prevent test mode bypass attacks
    Promise.all([
      this.samlService.getConfigFresh(),
      this.samlService.generateTestNonce(),
    ])
      .then(([config, nonce]) => {
        if (!config) {
          throw new UnauthorizedException('SAML is not configured');
        }

        // Note: We don't check config.enabled for test mode
        // This allows testing even when SAML is disabled for regular users

        // Create fresh SAML options with the latest config from database
        const freshOptions = this.samlService.createFreshSamlOptions(
          (this as any)._saml.options as NodeSamlConfig,
          config,
        );

        // IMPORTANT: Recreate the internal SAML instance to ensure fresh certificate is used
        // The passport-saml library caches the certificate internally, so we need to
        // create a new SAML instance with the fresh config
        // Note: createFreshSamlInstance handles certificate validation and throws
        // UnauthorizedException for invalid certificates
        (this as any)._saml = this.samlService.createFreshSamlInstance(
          freshOptions,
          'SAML test',
        );

        this.logger.debug(
          'SAML Test Mode: Configuration loaded (fresh SAML instance created)',
          {
            entryPoint: config.idpSsoUrl,
            issuer: config.spEntityId,
            callbackUrl: config.spAcsUrl,
            certificateLength: config.idpCertificate?.length,
            certificateStart: config.idpCertificate?.substring(0, 50),
          },
        );

        // Call parent authenticate method with RelayState containing test mode flag AND secure nonce
        // The nonce prevents attackers from crafting RelayState=testMode=true to bypass session creation
        // The nonce is validated and consumed in the callback (single-use)
        const testOptions = {
          ...options,
          additionalParams: {
            RelayState: `testMode=true&nonce=${nonce}`,
          },
        };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        super.authenticate(req, testOptions);
      })
      .catch((error) => {
        // All errors (including certificate validation errors from createFreshSamlInstance)
        // are handled here uniformly
        this.logger.error('SAML Test Mode: Configuration load failed', error);
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new UnauthorizedException(`SAML test failed: ${error.message}`);
      });
  }

  /**
   * Validates the SAML profile for test mode
   * Key differences from production:
   * - Returns mock user object (no database lookup)
   * - Only extracts email for display
   * - Does not create or modify user records
   *
   * @param profile SAML profile from IdP containing user information
   * @returns Mock user object with email only
   */
  async validate(profile: Profile): Promise<User> {
    this.logger.log('SAML Test Mode: Validating assertion');

    try {
      // Validate assertion (bypass cache for test mode to use fresh config)
      const validationResult = await this.samlService.validateSamlAssertion(
        profile,
        true,
      );

      if (!validationResult.valid) {
        const errors =
          validationResult.errors?.join(', ') || 'Unknown validation error';
        this.logger.error('SAML Test Mode: Validation failed', errors);
        throw new UnauthorizedException(`SAML test failed: ${errors}`);
      }

      // Extract email for display (don't create/modify user)
      const email = profile.nameID || profile.email;
      if (!email) {
        throw new UnauthorizedException(
          'SAML test failed: No email in assertion',
        );
      }

      this.logger.log(`SAML Test Mode: Validation successful for ${email}`);

      // Return a mock user object with just the email
      // This won't be used to create a session, just for display
      return { email } as User;
    } catch (error) {
      this.logger.error(
        'SAML Test Mode: Validation error',
        error.stack || error.message,
      );
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(`SAML test failed: ${error.message}`);
    }
  }
}
