// Service: https://ipwhois.io/documentation#endpoint
import { Injectable, Logger } from '@nestjs/common';
import {
  GeoLocationData,
  IpLookupProvider,
  RateLimitError,
} from '../interfaces/ip-lookup-provider.interface';
import { RateLimiter } from '../utils/rate-limiter';
import { supportsIp } from '../utils/ip-utils';

interface IpWhoisResponse {
  ip: string;
  success: boolean;
  type?: string;
  message?: string;
  continent?: string;
  continent_code?: string;
  country?: string;
  country_code?: string;
  region?: string;
  region_code?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  is_eu?: boolean;
  postal?: string;
  calling_code?: string;
  capital?: string;
  borders?: string;
  flag?: {
    img?: string;
    emoji?: string;
    emoji_unicode?: string;
  };
  connection?: {
    asn?: number;
    org?: string;
    isp?: string;
    domain?: string;
  };
  timezone?: {
    id?: string;
    abbr?: string;
    is_dst?: boolean;
    offset?: number;
    utc?: string;
    current_time?: string;
  };
}

@Injectable()
export class IpWhoisProvider implements IpLookupProvider {
  private readonly logger = new Logger(IpWhoisProvider.name);
  private readonly rateLimiter: RateLimiter;
  private readonly regionNames = new Intl.DisplayNames(['en'], {
    type: 'region',
  });
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
    // ipwhois.io free tier: 10,000 requests per month
    // With API key: unlimited (or much higher limit)
    this.rateLimiter = new RateLimiter('IPWhois', {
      requestsPerMonth: apiKey ? undefined : 10000,
    });
  }

  getName(): string {
    return 'ipwhois';
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    // Reset rate limiter when API key is added (no limits with key)
    this.rateLimiter['monthlyRequests'] = [];
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
        throw new RateLimitError('Monthly rate limit exceeded', waitTime);
      }

      if (!this.apiKey) {
        this.rateLimiter.recordRequest();
      }

      // Build URL with optional API key
      const url = this.apiKey
        ? `http://ipwho.is/${ip}?key=${this.apiKey}`
        : `http://ipwho.is/${ip}`;

      const response = await fetch(url);

      if (response.status === 429) {
        const waitTime = this.rateLimiter.getTimeUntilNextSlot();
        throw new RateLimitError('Rate limit exceeded (429)', waitTime);
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: IpWhoisResponse = await response.json();

      // Check for API error response
      if (!data.success) {
        this.logger.warn(
          `ipwhois lookup failed for ${ip}: ${data.message || 'Unknown error'}`,
        );
        return null;
      }

      // Extract ISP and org from connection object
      const isp = data.connection?.isp;
      const org = data.connection?.org;

      return {
        country: data.country_code,
        countryName:
          data.country || this.getCountryName(data.country_code || ''),
        region: data.region_code,
        regionName: data.region,
        city: data.city,
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone?.id,
        isp,
        org,
        asn: data.connection?.asn ? `AS${data.connection.asn}` : undefined,
      };
    } catch (error) {
      this.logger.error(
        `Failed to lookup IP ${ip} via ipwhois: ${error instanceof Error ? error.message : String(error)}`,
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
    requestsPerMonth?: number;
  } {
    if (this.apiKey) {
      return {}; // No limits with API key
    }
    return {
      requestsPerMonth: 10000,
    };
  }

  /**
   * Get usage statistics for this provider
   */
  getUsageStats(): {
    minuteRequests: number;
    dailyRequests: number;
    monthlyRequests: number;
    minuteLimit?: number;
    dailyLimit?: number;
    monthlyLimit?: number;
  } {
    const minuteRequests = this.rateLimiter['minuteRequests']?.length || 0;
    const dailyRequests = this.rateLimiter['dailyRequests']?.length || 0;
    const monthlyRequests = this.rateLimiter['monthlyRequests']?.length || 0;

    return {
      minuteRequests,
      dailyRequests,
      monthlyRequests,
      monthlyLimit: this.apiKey ? undefined : 10000,
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
