import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeolocationService } from './geolocation.service';
import { IpLookupProviderType } from '../config/ip-lookup.config';

/**
 * Service to initialize the IP lookup configuration on application startup
 * based on environment variables.
 */
@Injectable()
export class IpLookupInitService implements OnModuleInit {
  private readonly logger = new Logger(IpLookupInitService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly geolocationService: GeolocationService,
  ) {}

  onModuleInit() {
    this.initializeIpLookupConfig();
  }

  private initializeIpLookupConfig() {
    try {
      const provider = this.configService.get<string>(
        'IP_LOOKUP_PROVIDER',
        'geoip-lite',
      );

      const fallbackProviders = this.configService
        .get<string>('IP_LOOKUP_FALLBACK_PROVIDERS', '')
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => p as IpLookupProviderType);

      const iplocateApiKey = this.configService.get<string>('IPLOCATE_API_KEY');
      const ipapicoApiKey = this.configService.get<string>('IPAPICO_API_KEY');
      const ipwhoisApiKey = this.configService.get<string>('IPWHOIS_API_KEY');

      const cacheExpirationDays = parseInt(
        this.configService.get<string>('IP_LOOKUP_CACHE_DAYS', '30'),
        10,
      );

      const useCache = this.configService.get<boolean>(
        'IP_LOOKUP_USE_CACHE',
        true,
      );

      const apiKeys: any = {};
      if (iplocateApiKey) {
        apiKeys.iplocate = iplocateApiKey;
      }
      if (ipapicoApiKey) {
        apiKeys.ipapico = ipapicoApiKey;
      }
      if (ipwhoisApiKey) {
        apiKeys.ipwhois = ipwhoisApiKey;
      }

      const config = {
        provider: provider as IpLookupProviderType,
        fallbackProviders:
          fallbackProviders.length > 0 ? fallbackProviders : undefined,
        apiKeys: Object.keys(apiKeys).length > 0 ? apiKeys : undefined,
        useCache,
        cacheExpirationDays,
        maxRetries: 2,
      };

      this.geolocationService.setConfig(config);

      this.logger.log(
        `IP lookup service initialized with provider: ${provider}`,
      );
      if (fallbackProviders.length > 0) {
        this.logger.log(
          `Fallback providers configured: ${fallbackProviders.join(', ')}`,
        );
      }
      if (iplocateApiKey) {
        this.logger.log('IPLocate API key configured');
      }
      if (ipapicoApiKey) {
        this.logger.log('IPApiCo API key configured');
      }
      if (ipwhoisApiKey) {
        this.logger.log('IPWhois API key configured');
      }
    } catch (error) {
      this.logger.error(
        `Failed to initialize IP lookup config: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Fall back to defaults
      this.logger.log('Using default IP lookup configuration');
    }
  }
}
