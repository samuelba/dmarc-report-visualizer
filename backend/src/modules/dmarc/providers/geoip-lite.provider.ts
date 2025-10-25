// Service: https://www.maxmind.com/en/geolite-free-ip-geolocation-data
import { Injectable, Logger } from '@nestjs/common';
import * as geoip from 'geoip-lite';
import {
  GeoLocationData,
  IpLookupProvider,
} from '../interfaces/ip-lookup-provider.interface';
import { supportsIp } from '../utils/ip-utils';

@Injectable()
export class GeoipLiteProvider implements IpLookupProvider {
  private readonly logger = new Logger(GeoipLiteProvider.name);
  private readonly regionNames = new Intl.DisplayNames(['en'], {
    type: 'region',
  });

  getName(): string {
    return 'geoip-lite';
  }

  async lookup(ip: string): Promise<GeoLocationData | null> {
    try {
      const geo = geoip.lookup(ip);
      if (!geo) {
        return null;
      }

      return {
        country: geo.country,
        countryName: this.getCountryName(geo.country),
        region: geo.region,
        city: geo.city,
        latitude: geo.ll?.[0],
        longitude: geo.ll?.[1],
        timezone: geo.timezone,
        // geoip-lite doesn't provide ISP or org information
        isp: undefined,
        org: undefined,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to lookup IP ${ip}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  supportsIp(ip: string): boolean {
    return supportsIp(ip);
  }

  getRateLimitInfo(): {
    requestsPerMinute?: number;
    requestsPerDay?: number;
  } {
    // geoip-lite is local, no rate limits
    return {};
  }

  private getCountryName(countryCode: string): string {
    try {
      return this.regionNames.of(countryCode) || countryCode;
    } catch (_error) {
      return countryCode;
    }
  }
}
