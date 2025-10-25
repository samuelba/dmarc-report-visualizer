// Service: https://www.iplocate.io/docs/quick-start
import { Injectable, Logger } from '@nestjs/common';
import {
  GeoLocationData,
  IpLookupProvider,
  RateLimitError,
} from '../interfaces/ip-lookup-provider.interface';
import { RateLimiter } from '../utils/rate-limiter';
import { supportsIp } from '../utils/ip-utils';

interface IpLocateResponse {
  ip: string;
  country?: string;
  country_code?: string;
  is_eu?: boolean;
  city?: string;
  continent?: string;
  latitude?: number;
  longitude?: number;
  time_zone?: string;
  postal_code?: string;
  subdivision?: string;
  currency_code?: string;
  calling_code?: string;
  is_anycast?: boolean;
  is_satellite?: boolean;
  asn?: {
    asn?: string;
    route?: string;
    netname?: string;
    name?: string;
    country_code?: string;
    domain?: string;
    type?: string;
    rir?: string;
  };
  privacy?: {
    is_abuser?: boolean;
    is_anonymous?: boolean;
    is_bogon?: boolean;
    is_hosting?: boolean;
    is_icloud_relay?: boolean;
    is_proxy?: boolean;
    is_tor?: boolean;
    is_vpn?: boolean;
  };
  hosting?: {
    provider?: string;
    domain?: string;
    network?: string;
  };
  company?: {
    name?: string;
    domain?: string;
    country_code?: string;
    type?: string;
  };
  abuse?: {
    address?: string;
    country_code?: string;
    email?: string;
    name?: string;
    network?: string;
    phone?: string;
  };
}

@Injectable()
export class IpLocateProvider implements IpLookupProvider {
  private readonly logger = new Logger(IpLocateProvider.name);
  private readonly rateLimiter: RateLimiter;
  private readonly regionNames = new Intl.DisplayNames(['en'], {
    type: 'region',
  });
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
    // IPLocate free tier: 1000 requests per day
    this.rateLimiter = new RateLimiter('IPLocate', {
      requestsPerDay: 1000,
    });
  }

  getName(): string {
    return 'iplocate';
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  async lookup(ip: string): Promise<GeoLocationData | null> {
    if (!this.apiKey) {
      throw new Error('IPLocate API key is required');
    }

    try {
      // Check rate limit
      if (!this.rateLimiter.canMakeRequest()) {
        const waitTime = this.rateLimiter.getTimeUntilNextSlot();
        this.logger.warn(
          `Rate limit reached. Next available slot in ${Math.ceil(waitTime / 1000)}s`,
        );
        throw new RateLimitError('Daily rate limit exceeded', waitTime);
      }

      this.rateLimiter.recordRequest();

      const response = await fetch(`https://iplocate.io/api/lookup/${ip}`, {
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      if (response.status === 429) {
        const waitTime = this.rateLimiter.getTimeUntilNextSlot();
        throw new RateLimitError('Rate limit exceeded (429)', waitTime);
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: IpLocateResponse = await response.json();

      // Extract ISP from hosting provider or ASN name
      const isp = data.hosting?.provider || data.asn?.name;

      // Extract organization from company name or ASN netname
      const org = data.company?.name || data.asn?.netname;

      return {
        country: data.country_code,
        countryName:
          data.country || this.getCountryName(data.country_code || ''),
        region: data.subdivision,
        regionName: data.subdivision,
        city: data.city,
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.time_zone,
        isp,
        org,
        asn: data.asn?.asn,
      };
    } catch (error) {
      this.logger.error(
        `Failed to lookup IP ${ip} via IPLocate: ${error instanceof Error ? error.message : String(error)}`,
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
      requestsPerDay: 1000,
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
