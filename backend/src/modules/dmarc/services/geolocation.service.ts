import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IpLocation } from '../entities/ip-location.entity';
import * as geoip from 'geoip-lite';

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
}

@Injectable()
export class GeolocationService {
  private readonly logger = new Logger(GeolocationService.name);

  constructor(
    @InjectRepository(IpLocation)
    private ipLocationRepository: Repository<IpLocation>,
  ) {}

  async getLocationForIp(ip: string): Promise<GeoLocationData | null> {
    if (
      !ip ||
      ip === '::1' ||
      ip === '127.0.0.1' ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.')
    ) {
      return null; // Skip local/private IPs
    }

    try {
      // Check cache first
      const cached = await this.ipLocationRepository.findOne({ where: { ip } });
      if (cached) {
        // Return cached data if less than 30 days old
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        if (cached.createdAt > thirtyDaysAgo) {
          return {
            country: cached.country,
            countryName: cached.countryName,
            region: cached.region,
            regionName: cached.regionName,
            city: cached.city,
            latitude: cached.latitude ? Number(cached.latitude) : undefined,
            longitude: cached.longitude ? Number(cached.longitude) : undefined,
            timezone: cached.timezone,
            isp: cached.isp,
          };
        }
      }

      // Lookup using geoip-lite
      const geo = geoip.lookup(ip);
      if (!geo) {
        // Cache negative result to avoid repeated lookups
        await this.cacheLocation(ip, {});
        return null;
      }

      const locationData: GeoLocationData = {
        country: geo.country,
        countryName: this.getCountryName(geo.country),
        region: geo.region,
        city: geo.city,
        latitude: geo.ll?.[0],
        longitude: geo.ll?.[1],
        timezone: geo.timezone,
      };

      // Cache the result
      await this.cacheLocation(ip, locationData);
      return locationData;
    } catch (error) {
      this.logger.warn(
        `Failed to get location for IP ${ip}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async cacheLocation(
    ip: string,
    data: GeoLocationData,
  ): Promise<void> {
    try {
      await this.ipLocationRepository.upsert(
        {
          ip,
          country: data.country || undefined,
          countryName: data.countryName || undefined,
          region: data.region || undefined,
          regionName: data.regionName || undefined,
          city: data.city || undefined,
          latitude: data.latitude || undefined,
          longitude: data.longitude || undefined,
          timezone: data.timezone || undefined,
          isp: data.isp || undefined,
        },
        ['ip'],
      );
    } catch (error) {
      this.logger.warn(
        `Failed to cache location for IP ${ip}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private getCountryName(countryCode: string): string {
    const countries: Record<string, string> = {
      US: 'United States',
      GB: 'United Kingdom',
      DE: 'Germany',
      FR: 'France',
      JP: 'Japan',
      CN: 'China',
      IN: 'India',
      CA: 'Canada',
      AU: 'Australia',
      BR: 'Brazil',
      RU: 'Russia',
      IT: 'Italy',
      ES: 'Spain',
      NL: 'Netherlands',
      SE: 'Sweden',
      CH: 'Switzerland',
      NO: 'Norway',
      DK: 'Denmark',
      FI: 'Finland',
      BE: 'Belgium',
      AT: 'Austria',
      IE: 'Ireland',
      PL: 'Poland',
      CZ: 'Czech Republic',
      HU: 'Hungary',
      PT: 'Portugal',
      GR: 'Greece',
      TR: 'Turkey',
      IL: 'Israel',
      SG: 'Singapore',
      HK: 'Hong Kong',
      KR: 'South Korea',
      TW: 'Taiwan',
      TH: 'Thailand',
      MY: 'Malaysia',
      ID: 'Indonesia',
      PH: 'Philippines',
      VN: 'Vietnam',
      ZA: 'South Africa',
      EG: 'Egypt',
      NG: 'Nigeria',
      KE: 'Kenya',
      MX: 'Mexico',
      AR: 'Argentina',
      CL: 'Chile',
      CO: 'Colombia',
      PE: 'Peru',
      VE: 'Venezuela',
      UY: 'Uruguay',
      EC: 'Ecuador',
      BO: 'Bolivia',
      PY: 'Paraguay',
    };
    return countries[countryCode] || countryCode;
  }

  async getTopCountries(params: {
    domain?: string;
    from?: Date;
    to?: Date;
    limit?: number;
  }): Promise<
    Array<{
      country: string;
      countryName: string;
      count: number;
      passCount: number;
      failCount: number;
    }>
  > {
    const { domain, from, to, limit = 10 } = params;

    // This would be implemented with a proper query builder
    // For now, return a placeholder
    return [];
  }

  async getGeoHeatmapData(params: {
    domain?: string;
    from?: Date;
    to?: Date;
  }): Promise<
    Array<{
      latitude: number;
      longitude: number;
      count: number;
      passCount: number;
      failCount: number;
    }>
  > {
    // This would be implemented with a proper query builder
    // For now, return a placeholder
    return [];
  }
}
