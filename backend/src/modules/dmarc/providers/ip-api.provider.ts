// Service: https://ip-api.com/docs/
import { Injectable, Logger } from '@nestjs/common';
import {
  GeoLocationData,
  IpLookupProvider,
  RateLimitError,
} from '../interfaces/ip-lookup-provider.interface';
import { RateLimiter } from '../utils/rate-limiter';
import { supportsIp } from '../utils/ip-utils';

interface IpApiResponse {
  status: string;
  message?: string;
  query: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  as?: string;
}

@Injectable()
export class IpApiProvider implements IpLookupProvider {
  private readonly logger = new Logger(IpApiProvider.name);
  private readonly rateLimiter: RateLimiter;
  private readonly regionNames = new Intl.DisplayNames(['en'], {
    type: 'region',
  });

  constructor() {
    // IP-API free tier: 45 requests per minute
    this.rateLimiter = new RateLimiter('IP-API', {
      requestsPerMinute: 45,
    });
  }

  getName(): string {
    return 'ip-api';
  }

  async lookup(ip: string): Promise<GeoLocationData | null> {
    try {
      // Check rate limit
      if (!this.rateLimiter.canMakeRequest()) {
        const waitTime = this.rateLimiter.getTimeUntilNextSlot();
        this.logger.warn(
          `Rate limit reached. Next available slot in ${Math.ceil(waitTime / 1000)}s`,
        );

        // Throw rate limit error so queue can wait instead of using fallback
        throw new RateLimitError(
          'Rate limit exceeded, should wait before retrying',
          waitTime,
        );
      }

      this.rateLimiter.recordRequest();

      const response = await fetch(`http://ip-api.com/json/${ip}`);

      if (response.status === 429) {
        const waitTime = this.rateLimiter.getTimeUntilNextSlot();
        throw new RateLimitError('Rate limit exceeded (429)', waitTime);
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: IpApiResponse = await response.json();

      if (data.status === 'fail') {
        this.logger.warn(`IP-API lookup failed for ${ip}: ${data.message}`);
        return null;
      }

      return {
        country: data.countryCode,
        countryName:
          data.country || this.getCountryName(data.countryCode || ''),
        region: data.region,
        regionName: data.regionName,
        city: data.city,
        latitude: data.lat,
        longitude: data.lon,
        timezone: data.timezone,
        isp: data.isp,
        org: data.org,
        asn: data.as,
      };
    } catch (error) {
      this.logger.error(
        `Failed to lookup IP ${ip} via IP-API: ${error instanceof Error ? error.message : String(error)}`,
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
    return {
      requestsPerMinute: 45,
    };
  }

  /**
   * Get current rate limiter statistics
   */
  getRateLimiterStats() {
    return this.rateLimiter.getUsageStats();
  }

  private getCountryName(countryCode: string): string {
    try {
      return this.regionNames.of(countryCode) || countryCode;
    } catch (_error) {
      return countryCode;
    }
  }
}
