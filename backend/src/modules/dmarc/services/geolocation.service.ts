import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IpLocation } from '../entities/ip-location.entity';
import { GeoipLiteProvider } from '../providers/geoip-lite.provider';
import { IpApiProvider } from '../providers/ip-api.provider';
import { IpLocateProvider } from '../providers/iplocate.provider';
import { IpApiCoProvider } from '../providers/ipapi-co.provider';
import { IpWhoisProvider } from '../providers/ipwhois.provider';
import {
  IpLookupConfig,
  IpLookupProviderType,
  DEFAULT_IP_LOOKUP_CONFIG,
} from '../config/ip-lookup.config';
import {
  GeoLocationData,
  IpLookupProvider,
  RateLimitError,
} from '../interfaces/ip-lookup-provider.interface';

@Injectable()
export class GeolocationService {
  private readonly logger = new Logger(GeolocationService.name);
  private readonly providers: Map<IpLookupProviderType, IpLookupProvider> =
    new Map();
  private config: IpLookupConfig = DEFAULT_IP_LOOKUP_CONFIG;

  constructor(
    @InjectRepository(IpLocation)
    private ipLocationRepository: Repository<IpLocation>,
  ) {
    // Initialize providers
    this.providers.set(
      IpLookupProviderType.GEOIP_LITE,
      new GeoipLiteProvider(),
    );
    this.providers.set(IpLookupProviderType.IP_API, new IpApiProvider());
    // IPLocate, IPApiCo, and IPWhois require/support API key, will be set via configuration
  }

  /**
   * Configure the IP lookup service
   */
  setConfig(config: Partial<IpLookupConfig>): void {
    this.config = { ...DEFAULT_IP_LOOKUP_CONFIG, ...config };

    // Initialize IPLocate provider if API key is provided
    if (this.config.apiKeys?.iplocate) {
      const iplocateProvider = new IpLocateProvider(
        this.config.apiKeys.iplocate,
      );
      this.providers.set(IpLookupProviderType.IPLOCATE, iplocateProvider);
      this.logger.log('IPLocate provider initialized with API key');
    }

    // Initialize IPApiCo provider if API key is provided
    if (this.config.apiKeys?.ipapico) {
      const ipapicoProvider = new IpApiCoProvider(this.config.apiKeys.ipapico);
      this.providers.set(IpLookupProviderType.IPAPI_CO, ipapicoProvider);
      this.logger.log('IPApiCo provider initialized with API key');
    } else {
      // Initialize without API key (free tier with rate limits)
      const ipapicoProvider = new IpApiCoProvider();
      this.providers.set(IpLookupProviderType.IPAPI_CO, ipapicoProvider);
    }

    // Initialize IPWhois provider if API key is provided
    if (this.config.apiKeys?.ipwhois) {
      const ipwhoisProvider = new IpWhoisProvider(this.config.apiKeys.ipwhois);
      this.providers.set(IpLookupProviderType.IPWHOIS, ipwhoisProvider);
      this.logger.log('IPWhois provider initialized with API key');
    } else {
      // Initialize without API key (free tier with rate limits)
      const ipwhoisProvider = new IpWhoisProvider();
      this.providers.set(IpLookupProviderType.IPWHOIS, ipwhoisProvider);
    }

    this.logger.log(
      `IP lookup configured: primary=${this.config.provider}, fallbacks=${this.config.fallbackProviders?.join(', ') || 'none'}`,
    );
  }

  /**
   * Get the current configuration
   */
  getConfig(): IpLookupConfig {
    return { ...this.config };
  }

  async getLocationForIp(ip: string): Promise<GeoLocationData | null> {
    if (!ip) {
      return null;
    }

    try {
      // Check cache first if enabled
      if (this.config.useCache) {
        const cached = await this.getCachedLocation(ip);
        if (cached) {
          return cached;
        }
      }

      // Try primary provider first
      let locationData: GeoLocationData | null = null;
      let isRateLimited = false;

      try {
        locationData = await this.lookupWithProvider(ip, this.config.provider);
      } catch (error) {
        if (error instanceof RateLimitError) {
          isRateLimited = true;
          this.logger.warn(
            `Primary provider ${this.config.provider} rate limited for ${ip}`,
          );
        } else {
          this.logger.warn(
            `Primary provider ${this.config.provider} failed for ${ip}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // Try fallback providers if primary fails
      if (
        !locationData &&
        this.config.fallbackProviders &&
        this.config.fallbackProviders.length > 0
      ) {
        // Filter out geoip-lite if we hit rate limit (should wait instead)
        const fallbacksToTry = isRateLimited
          ? this.config.fallbackProviders.filter(
              (provider) => provider !== IpLookupProviderType.GEOIP_LITE,
            )
          : this.config.fallbackProviders;

        for (const fallbackProvider of fallbacksToTry) {
          try {
            locationData = await this.lookupWithProvider(ip, fallbackProvider);
            if (locationData) {
              this.logger.log(
                `Successfully looked up ${ip} using fallback provider: ${fallbackProvider}`,
              );
              break;
            }
          } catch (error) {
            if (error instanceof RateLimitError) {
              this.logger.debug(
                `Fallback provider ${fallbackProvider} rate limited, skipping`,
              );
              // Don't try more fallbacks if we hit another rate limit
              // Let the queue handle the retry
              break;
            }
            this.logger.warn(
              `Fallback provider ${fallbackProvider} failed for ${ip}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      // If we got rate limited and still no data, throw the rate limit error
      // so the queue knows to wait
      if (!locationData && isRateLimited) {
        throw new RateLimitError('All providers rate limited');
      }

      // Cache the result (even if null to avoid repeated lookups)
      if (this.config.useCache) {
        await this.cacheLocation(ip, locationData || {});
      }

      return locationData;
    } catch (error) {
      // Re-throw rate limit errors so queue can handle them
      if (error instanceof RateLimitError) {
        throw error;
      }

      this.logger.error(
        `Failed to get location for IP ${ip}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async lookupWithProvider(
    ip: string,
    providerType: IpLookupProviderType,
  ): Promise<GeoLocationData | null> {
    const provider = this.providers.get(providerType);

    if (!provider) {
      throw new Error(`Provider ${providerType} not available`);
    }

    if (!provider.supportsIp(ip)) {
      this.logger.debug(`Provider ${providerType} does not support IP: ${ip}`);
      return null;
    }

    try {
      const result = await provider.lookup(ip);
      if (result) {
        this.logger.debug(`Successfully looked up ${ip} using ${providerType}`);
      }
      return result;
    } catch (error) {
      this.logger.warn(
        `Provider ${providerType} failed for ${ip}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async getCachedLocation(ip: string): Promise<GeoLocationData | null> {
    try {
      const cached = await this.ipLocationRepository.findOne({ where: { ip } });
      if (!cached) {
        return null;
      }

      // Check if cache is still valid
      const expirationDays = this.config.cacheExpirationDays || 30;
      const expirationDate = new Date(
        Date.now() - expirationDays * 24 * 60 * 60 * 1000,
      );

      if (cached.createdAt > expirationDate) {
        this.logger.debug(`Cache hit for IP: ${ip}`);
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
          org: cached.org,
        };
      }

      this.logger.debug(`Cache expired for IP: ${ip}`);
      return null;
    } catch (error) {
      this.logger.warn(
        `Failed to get cached location for ${ip}: ${error instanceof Error ? error.message : String(error)}`,
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
          org: data.org || undefined,
        },
        ['ip'],
      );
    } catch (error) {
      this.logger.warn(
        `Failed to cache location for IP ${ip}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get statistics for all providers
   */
  getProviderStats(): Record<
    string,
    {
      name: string;
      rateLimits: {
        requestsPerMinute?: number;
        requestsPerDay?: number;
      };
      usage?: {
        minuteRequests: number;
        dailyRequests: number;
        minuteLimit?: number;
        dailyLimit?: number;
      };
    }
  > {
    const stats: Record<string, any> = {};

    for (const [type, provider] of this.providers.entries()) {
      stats[type] = {
        name: provider.getName(),
        rateLimits: provider.getRateLimitInfo(),
      };

      // Get usage stats for providers that have rate limiters
      if (provider instanceof IpApiProvider) {
        stats[type].usage = provider.getRateLimiterStats();
      } else if (provider instanceof IpLocateProvider) {
        stats[type].usage = provider.getRateLimiterStats();
      } else if (provider instanceof IpApiCoProvider) {
        stats[type].usage = provider.getUsageStats();
      } else if (provider instanceof IpWhoisProvider) {
        stats[type].usage = provider.getUsageStats();
      }
    }

    return stats;
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
    const {
      domain: _domain,
      from: _from,
      to: _to,
      limit: _limit = 10,
    } = params;

    // This would be implemented with a proper query builder
    // For now, return a placeholder
    return [];
  }

  async getGeoHeatmapData(_params: {
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
