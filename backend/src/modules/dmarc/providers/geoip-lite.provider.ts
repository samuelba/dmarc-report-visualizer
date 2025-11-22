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

  lookup(ip: string): Promise<GeoLocationData | null> {
    try {
      const geo = geoip.lookup(ip);
      if (!geo) {
        return Promise.resolve(null);
      }

      const countryCode: string =
        typeof geo.country === 'string' ? geo.country : '';
      const region = typeof geo.region === 'string' ? geo.region : undefined;
      const city = typeof geo.city === 'string' ? geo.city : undefined;
      const rawTimezone = (geo as Record<string, unknown>).timezone;
      const timezone: string | undefined =
        typeof rawTimezone === 'string' ? rawTimezone : undefined;

      const countryName: string = this.getCountryName(countryCode);
      const result: GeoLocationData = {
        country: countryCode,
        countryName,
        region,
        city,
        latitude: geo.ll?.[0],
        longitude: geo.ll?.[1],
        timezone,
        // geoip-lite doesn't provide ISP or org information
        isp: undefined,
        org: undefined,
      };
      return Promise.resolve(result);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : String(err);
      this.logger.warn(`Failed to lookup IP ${ip}: ${message}`);
      return Promise.resolve(null);
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
