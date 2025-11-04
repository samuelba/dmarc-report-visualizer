import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IpLookupInitService } from './ip-lookup-init.service';
import { GeolocationService } from './geolocation.service';
import { IpLookupProviderType } from '../config/ip-lookup.config';

describe('IpLookupInitService', () => {
  let service: IpLookupInitService;
  let configService: jest.Mocked<ConfigService>;
  let geolocationService: jest.Mocked<GeolocationService>;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn(),
    };

    const mockGeolocationService = {
      setConfig: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpLookupInitService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: GeolocationService,
          useValue: mockGeolocationService,
        },
      ],
    }).compile();

    service = module.get<IpLookupInitService>(IpLookupInitService);
    configService = module.get(ConfigService);
    geolocationService = module.get(GeolocationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize with default provider and no API keys', () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          const values: Record<string, any> = {
            IP_LOOKUP_PROVIDER: 'geoip-lite',
            IP_LOOKUP_FALLBACK_PROVIDERS: '',
            IP_LOOKUP_CACHE_DAYS: 30,
            IP_LOOKUP_USE_CACHE: true,
          };
          return values[key] !== undefined ? values[key] : defaultValue;
        },
      );

      service.onModuleInit();

      expect(geolocationService.setConfig).toHaveBeenCalledWith({
        provider: IpLookupProviderType.GEOIP_LITE,
        fallbackProviders: undefined,
        apiKeys: undefined,
        useCache: true,
        cacheExpirationDays: 30,
        maxRetries: 2,
      });
    });

    it('should initialize with ip-api provider', () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          const values: Record<string, any> = {
            IP_LOOKUP_PROVIDER: 'ip-api',
            IP_LOOKUP_FALLBACK_PROVIDERS: '',
            IP_LOOKUP_CACHE_DAYS: 30,
            IP_LOOKUP_USE_CACHE: true,
          };
          return values[key] !== undefined ? values[key] : defaultValue;
        },
      );

      service.onModuleInit();

      expect(geolocationService.setConfig).toHaveBeenCalledWith({
        provider: IpLookupProviderType.IP_API,
        fallbackProviders: undefined,
        apiKeys: undefined,
        useCache: true,
        cacheExpirationDays: 30,
        maxRetries: 2,
      });
    });

    it('should initialize with fallback providers', () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          const values: Record<string, any> = {
            IP_LOOKUP_PROVIDER: 'ip-api',
            IP_LOOKUP_FALLBACK_PROVIDERS: 'iplocate, ipwhois, geoip-lite',
            IP_LOOKUP_CACHE_DAYS: 30,
            IP_LOOKUP_USE_CACHE: true,
          };
          return values[key] !== undefined ? values[key] : defaultValue;
        },
      );

      service.onModuleInit();

      expect(geolocationService.setConfig).toHaveBeenCalledWith({
        provider: IpLookupProviderType.IP_API,
        fallbackProviders: [
          IpLookupProviderType.IPLOCATE,
          IpLookupProviderType.IPWHOIS,
          IpLookupProviderType.GEOIP_LITE,
        ],
        apiKeys: undefined,
        useCache: true,
        cacheExpirationDays: 30,
        maxRetries: 2,
      });
    });

    it('should initialize with IPLocate API key', () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          const values: Record<string, any> = {
            IP_LOOKUP_PROVIDER: 'iplocate',
            IP_LOOKUP_FALLBACK_PROVIDERS: '',
            IPLOCATE_API_KEY: 'test-iplocate-key',
            IP_LOOKUP_CACHE_DAYS: 30,
            IP_LOOKUP_USE_CACHE: true,
          };
          return values[key] !== undefined ? values[key] : defaultValue;
        },
      );

      service.onModuleInit();

      expect(geolocationService.setConfig).toHaveBeenCalledWith({
        provider: IpLookupProviderType.IPLOCATE,
        fallbackProviders: undefined,
        apiKeys: { iplocate: 'test-iplocate-key' },
        useCache: true,
        cacheExpirationDays: 30,
        maxRetries: 2,
      });
    });

    it('should initialize with IPApiCo API key', () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          const values: Record<string, any> = {
            IP_LOOKUP_PROVIDER: 'ipapi-co',
            IP_LOOKUP_FALLBACK_PROVIDERS: '',
            IPAPICO_API_KEY: 'test-ipapico-key',
            IP_LOOKUP_CACHE_DAYS: 30,
            IP_LOOKUP_USE_CACHE: true,
          };
          return values[key] !== undefined ? values[key] : defaultValue;
        },
      );

      service.onModuleInit();

      expect(geolocationService.setConfig).toHaveBeenCalledWith({
        provider: IpLookupProviderType.IPAPI_CO,
        fallbackProviders: undefined,
        apiKeys: { ipapico: 'test-ipapico-key' },
        useCache: true,
        cacheExpirationDays: 30,
        maxRetries: 2,
      });
    });

    it('should initialize with IPWhois API key', () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          const values: Record<string, any> = {
            IP_LOOKUP_PROVIDER: 'ipwhois',
            IP_LOOKUP_FALLBACK_PROVIDERS: '',
            IPWHOIS_API_KEY: 'test-ipwhois-key',
            IP_LOOKUP_CACHE_DAYS: 30,
            IP_LOOKUP_USE_CACHE: true,
          };
          return values[key] !== undefined ? values[key] : defaultValue;
        },
      );

      service.onModuleInit();

      expect(geolocationService.setConfig).toHaveBeenCalledWith({
        provider: IpLookupProviderType.IPWHOIS,
        fallbackProviders: undefined,
        apiKeys: { ipwhois: 'test-ipwhois-key' },
        useCache: true,
        cacheExpirationDays: 30,
        maxRetries: 2,
      });
    });

    it('should initialize with multiple API keys', () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          const values: Record<string, any> = {
            IP_LOOKUP_PROVIDER: 'ip-api',
            IP_LOOKUP_FALLBACK_PROVIDERS: 'iplocate,ipwhois',
            IPLOCATE_API_KEY: 'test-iplocate-key',
            IPAPICO_API_KEY: 'test-ipapico-key',
            IPWHOIS_API_KEY: 'test-ipwhois-key',
            IP_LOOKUP_CACHE_DAYS: 30,
            IP_LOOKUP_USE_CACHE: true,
          };
          return values[key] !== undefined ? values[key] : defaultValue;
        },
      );

      service.onModuleInit();

      expect(geolocationService.setConfig).toHaveBeenCalledWith({
        provider: IpLookupProviderType.IP_API,
        fallbackProviders: [
          IpLookupProviderType.IPLOCATE,
          IpLookupProviderType.IPWHOIS,
        ],
        apiKeys: {
          iplocate: 'test-iplocate-key',
          ipapico: 'test-ipapico-key',
          ipwhois: 'test-ipwhois-key',
        },
        useCache: true,
        cacheExpirationDays: 30,
        maxRetries: 2,
      });
    });

    it('should initialize with custom cache settings', () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          const values: Record<string, any> = {
            IP_LOOKUP_PROVIDER: 'geoip-lite',
            IP_LOOKUP_FALLBACK_PROVIDERS: '',
            IP_LOOKUP_CACHE_DAYS: 60,
            IP_LOOKUP_USE_CACHE: false,
          };
          return values[key] !== undefined ? values[key] : defaultValue;
        },
      );

      service.onModuleInit();

      expect(geolocationService.setConfig).toHaveBeenCalledWith({
        provider: IpLookupProviderType.GEOIP_LITE,
        fallbackProviders: undefined,
        apiKeys: undefined,
        useCache: false,
        cacheExpirationDays: 60,
        maxRetries: 2,
      });
    });

    it('should handle empty fallback providers string', () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          const values: Record<string, any> = {
            IP_LOOKUP_PROVIDER: 'ip-api',
            IP_LOOKUP_FALLBACK_PROVIDERS: '   ',
            IP_LOOKUP_CACHE_DAYS: 30,
            IP_LOOKUP_USE_CACHE: true,
          };
          return values[key] !== undefined ? values[key] : defaultValue;
        },
      );

      service.onModuleInit();

      // Whitespace-only string should be filtered out

      expect(geolocationService.setConfig).toHaveBeenCalledWith({
        provider: IpLookupProviderType.IP_API,
        fallbackProviders: undefined,
        apiKeys: undefined,
        useCache: true,
        cacheExpirationDays: 30,
        maxRetries: 2,
      });
    });

    it('should trim fallback provider names', () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          const values: Record<string, any> = {
            IP_LOOKUP_PROVIDER: 'ip-api',
            IP_LOOKUP_FALLBACK_PROVIDERS: '  iplocate  , ipwhois  ',
            IP_LOOKUP_CACHE_DAYS: 30,
            IP_LOOKUP_USE_CACHE: true,
          };
          return values[key] !== undefined ? values[key] : defaultValue;
        },
      );

      service.onModuleInit();

      expect(geolocationService.setConfig).toHaveBeenCalledWith({
        provider: IpLookupProviderType.IP_API,
        fallbackProviders: [
          IpLookupProviderType.IPLOCATE,
          IpLookupProviderType.IPWHOIS,
        ],
        apiKeys: undefined,
        useCache: true,
        cacheExpirationDays: 30,
        maxRetries: 2,
      });
    });

    it('should handle initialization errors gracefully', () => {
      configService.get.mockImplementation(() => {
        throw new Error('Config error');
      });

      // Should not throw
      expect(() => service.onModuleInit()).not.toThrow();

      // Should not have called setConfig

      expect(geolocationService.setConfig).not.toHaveBeenCalled();
    });

    it('should use default values when environment variables are not set', () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          // Return default values for all keys
          return defaultValue;
        },
      );

      service.onModuleInit();

      expect(geolocationService.setConfig).toHaveBeenCalledWith({
        provider: IpLookupProviderType.GEOIP_LITE,
        fallbackProviders: undefined,
        apiKeys: undefined,
        useCache: true,
        cacheExpirationDays: 30,
        maxRetries: 2,
      });
    });
  });
});
