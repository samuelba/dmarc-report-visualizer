export interface GeoLocationData {
  country?: string;
  countryName?: string;
  region?: string;
  regionName?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  asn?: string;
}

/**
 * Custom error for rate limit exceeded
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export interface IpLookupProvider {
  /**
   * Get the name of the provider
   */
  getName(): string;

  /**
   * Lookup geolocation data for an IP address
   * @param ip - The IP address to lookup
   * @returns GeoLocationData or null if not found
   * @throws Error if lookup fails due to rate limiting or other errors
   */
  lookup(ip: string): Promise<GeoLocationData | null>;

  /**
   * Check if the provider supports the given IP address type
   * @param ip - The IP address to check
   * @returns true if supported, false otherwise
   */
  supportsIp(ip: string): boolean;

  /**
   * Get the rate limit information for this provider
   */
  getRateLimitInfo(): {
    requestsPerMinute?: number;
    requestsPerDay?: number;
  };
}
