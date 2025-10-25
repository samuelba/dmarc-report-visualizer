// Service: https://ipapi.co/api
import { Injectable, Logger } from '@nestjs/common';
import {
  GeoLocationData,
  IpLookupProvider,
  RateLimitError,
} from '../interfaces/ip-lookup-provider.interface';
import { RateLimiter } from '../utils/rate-limiter';
import { supportsIp } from '../utils/ip-utils';

interface IpApiCoResponse {
  ip: string;
  version?: string;
  city?: string;
  region?: string;
  region_code?: string;
  country_code?: string;
  country_code_iso3?: string;
  country_name?: string;
  country_capital?: string;
  country_tld?: string;
  continent_code?: string;
  in_eu?: boolean;
  postal?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  utc_offset?: string;
  country_calling_code?: string;
  currency?: string;
  currency_name?: string;
  languages?: string;
  country_area?: number;
  country_population?: number;
  asn?: string;
  org?: string;
  hostname?: string;
  error?: boolean;
  reason?: string;
}

@Injectable()
export class IpApiCoProvider implements IpLookupProvider {
  private readonly logger = new Logger(IpApiCoProvider.name);
  private readonly rateLimiter: RateLimiter;
  private readonly regionNames = new Intl.DisplayNames(['en'], {
    type: 'region',
  });
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
    // ipapi.co free tier: 1000 requests per day
    // With API key: unlimited (or much higher limit)
    this.rateLimiter = new RateLimiter('IPApiCo', {
      requestsPerDay: apiKey ? undefined : 1000,
    });
  }

  getName(): string {
    return 'ipapi-co';
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    // Reset rate limiter when API key is added (no limits with key)
    this.rateLimiter['dailyRequests'] = [];
  }

  async lookup(ip: string): Promise<GeoLocationData | null> {
    try {
      // Check rate limit only if no API key
      if (!this.apiKey && !this.rateLimiter.canMakeRequest()) {
        const waitTime = this.rateLimiter.getTimeUntilNextSlot();
        this.logger.warn(
          `Rate limit reached. Next available slot in ${Math.ceil(waitTime / 1000)}s`,
        );

        // Throw rate limit error so queue can wait instead of using fallback
        throw new RateLimitError('Daily rate limit exceeded', waitTime);
      }

      if (!this.apiKey) {
        this.rateLimiter.recordRequest();
      }

      // Build URL with optional API key
      const url = this.apiKey
        ? `https://ipapi.co/${ip}/json/?key=${this.apiKey}`
        : `https://ipapi.co/${ip}/json/`;

      const response = await fetch(url);

      if (response.status === 429) {
        const waitTime = this.rateLimiter.getTimeUntilNextSlot();
        throw new RateLimitError('Rate limit exceeded (429)', waitTime);
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: IpApiCoResponse = await response.json();

      // Wait a bit to avoid hitting rate limits too quickly
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check for API error response
      if (data.error) {
        this.logger.warn(`ipapi.co lookup failed for ${ip}: ${data.reason}`);
        return null;
      }

      // Extract ISP from org field (ipapi.co provides it directly)
      // ASN format is "AS15169", extract just the organization name from org
      const isp = data.org;

      return {
        country: data.country_code,
        countryName:
          data.country_name || this.getCountryName(data.country_code || ''),
        region: data.region_code,
        regionName: data.region,
        city: data.city,
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone,
        isp,
        org: data.org,
        asn: data.asn,
      };
    } catch (error) {
      this.logger.error(
        `Failed to lookup IP ${ip} via ipapi.co: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  supportsIp(ip: string): boolean {
    return supportsIp(ip);
  }

  getRateLimitInfo(): {
    requestsPerMinute?: number;
    requestsPerDay?: number;
  } {
    if (this.apiKey) {
      return {}; // No limits with API key
    }
    return {
      requestsPerDay: 1000,
    };
  }

  /**
   * Get usage statistics for this provider
   */
  getUsageStats(): {
    minuteRequests: number;
    dailyRequests: number;
    minuteLimit?: number;
    dailyLimit?: number;
  } {
    const minuteRequests = this.rateLimiter['minuteRequests']?.length || 0;
    const dailyRequests = this.rateLimiter['dailyRequests']?.length || 0;

    return {
      minuteRequests,
      dailyRequests,
      dailyLimit: this.apiKey ? undefined : 1000,
    };
  }

  /**
   * Get country name from country code
   */
  private getCountryName(countryCode: string): string | undefined {
    if (!countryCode) {
      return undefined;
    }
    try {
      return this.regionNames.of(countryCode);
    } catch {
      return undefined;
    }
  }
}
