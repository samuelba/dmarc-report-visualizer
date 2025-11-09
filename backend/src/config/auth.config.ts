import { registerAs } from '@nestjs/config';

/**
 * Helper function to convert string environment variables to boolean
 * @param val Environment variable value
 * @param fallback Default value if undefined
 * @returns Boolean value
 */
function toBool(val: string | undefined, fallback: boolean): boolean {
  if (val === undefined) {
    return fallback;
  }
  const s = val.toLowerCase();
  // Return false if no match.
  return s === 'true' || s === '1' || s === 'yes';
}

/**
 * Authentication configuration
 * Provides centralized configuration for authentication features
 */
export default registerAs('auth', () => ({
  /**
   * Token theft detection configuration
   */
  theftDetection: {
    /**
     * Enable/disable theft detection mechanism
     * When disabled, revoked token reuse returns standard 401 without logging or family invalidation
     * Default: true
     */
    enabled: toBool(process.env.THEFT_DETECTION_ENABLED, true),

    /**
     * Enable/disable automatic token family invalidation when theft is detected
     * When disabled, theft detection only logs the event without invalidating the family
     * Default: true
     */
    invalidateFamily: toBool(
      process.env.THEFT_DETECTION_INVALIDATE_FAMILY,
      true,
    ),
  },

  /**
   * SAML configuration
   */
  saml: {
    /**
     * SAML Entity ID - unique identifier for this Service Provider
     * Used in SAML metadata and authentication requests
     */
    entityId: process.env.SAML_ENTITY_ID || 'dmarc-app',

    /**
     * SAML Assertion Consumer Service URL
     * The endpoint where the Identity Provider sends SAML assertions
     * Must be HTTPS in production
     */
    acsUrl:
      process.env.SAML_ACS_URL ||
      'http://localhost:3000/api/auth/saml/callback',
  },
}));
