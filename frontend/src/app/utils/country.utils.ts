/**
 * Utility functions for country code conversions
 */

// Create a singleton instance of Intl.DisplayNames for country name lookups
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

/**
 * Convert ISO 3166-1 alpha-2 country code to country name
 * @param countryCode - Two-letter ISO country code (e.g., 'US', 'NL', 'GB')
 * @returns Full country name (e.g., 'United States', 'Netherlands', 'United Kingdom')
 */
export function getCountryName(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) {
    return countryCode;
  }

  try {
    return countryNames.of(countryCode.toUpperCase()) || countryCode;
  } catch (_error) {
    // Invalid country code
    return countryCode;
  }
}
