export enum IpLookupProviderType {
  GEOIP_LITE = 'geoip-lite',
  IP_API = 'ip-api',
  IPLOCATE = 'iplocate',
  IPAPI_CO = 'ipapi-co',
  IPWHOIS = 'ipwhois',
}

export interface IpLookupConfig {
  /**
   * The primary provider to use for IP lookups
   */
  provider: IpLookupProviderType;

  /**
   * Fallback providers to use if the primary fails
   */
  fallbackProviders?: IpLookupProviderType[];

  /**
   * API keys for providers that require them
   */
  apiKeys?: {
    iplocate?: string;
    ipapico?: string;
    ipwhois?: string;
  };

  /**
   * Whether to use cache for IP lookups
   */
  useCache?: boolean;

  /**
   * Cache expiration time in days
   */
  cacheExpirationDays?: number;

  /**
   * Maximum number of retries for failed lookups
   */
  maxRetries?: number;
}

export const DEFAULT_IP_LOOKUP_CONFIG: IpLookupConfig = {
  provider: IpLookupProviderType.GEOIP_LITE,
  fallbackProviders: [IpLookupProviderType.IP_API],
  useCache: true,
  cacheExpirationDays: 30,
  maxRetries: 2,
};
