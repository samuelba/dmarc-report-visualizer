import { Test, TestingModule } from '@nestjs/testing';
import { IpLookupController } from './ip-lookup.controller';
import { GeolocationService } from '../services/geolocation.service';
import { IpLookupQueueService } from '../services/ip-lookup-queue.service';
import { DmarcParserService } from '../services/dmarc-parser.service';
import { IpLookupProviderType } from '../config/ip-lookup.config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

describe('IpLookupController', () => {
  let controller: IpLookupController;
  let geolocationService: jest.Mocked<GeolocationService>;
  let ipLookupQueueService: jest.Mocked<IpLookupQueueService>;
  let dmarcParserService: jest.Mocked<DmarcParserService>;

  const mockConfig = {
    provider: IpLookupProviderType.GEOIP_LITE,
    fallbackProviders: [IpLookupProviderType.IP_API],
    useCache: true,
    cacheExpirationDays: 30,
    maxRetries: 2,
  };

  const mockProviderStats: Record<
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
  > = {
    'geoip-lite': {
      name: 'geoip-lite',
      rateLimits: {},
    },
    'ip-api': {
      name: 'ip-api',
      rateLimits: { requestsPerMinute: 45 },
      usage: {
        minuteRequests: 10,
        dailyRequests: 100,
        minuteLimit: 45,
      },
    },
  };

  const mockQueueStats = {
    queueSize: 5,
    processing: true,
    itemsByPriority: { high: 1, normal: 3, low: 1 },
    uniqueIps: 5,
    totalRecords: 10,
  };

  const mockLocationData = {
    country: 'US',
    countryName: 'United States',
    city: 'Mountain View',
    latitude: 37.4056,
    longitude: -122.0775,
    timezone: 'America/Los_Angeles',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IpLookupController],
      providers: [
        {
          provide: GeolocationService,
          useValue: {
            getConfig: jest.fn(),
            setConfig: jest.fn(),
            getProviderStats: jest.fn(),
            getLocationForIp: jest.fn(),
          },
        },
        {
          provide: IpLookupQueueService,
          useValue: {
            getQueueStats: jest.fn(),
            processPendingLookups: jest.fn(),
            clearQueue: jest.fn(),
          },
        },
        {
          provide: DmarcParserService,
          useValue: {
            setAsyncIpLookup: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<IpLookupController>(IpLookupController);
    geolocationService = module.get(GeolocationService);
    ipLookupQueueService = module.get(IpLookupQueueService);
    dmarcParserService = module.get(DmarcParserService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getConfig', () => {
    it('should return current IP lookup configuration', () => {
      geolocationService.getConfig.mockReturnValue(mockConfig);

      const result = controller.getConfig();

      expect(result).toEqual(mockConfig);

      expect(geolocationService.getConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration and return success message', () => {
      const configDto = {
        provider: IpLookupProviderType.IP_API,
        fallbackProviders: [IpLookupProviderType.GEOIP_LITE],
        useCache: true,
      };

      geolocationService.getConfig.mockReturnValue({
        ...mockConfig,
        ...configDto,
      });

      const result = controller.updateConfig(configDto);

      expect(geolocationService.setConfig).toHaveBeenCalledWith(configDto);

      expect(geolocationService.getConfig).toHaveBeenCalledTimes(1);

      expect(result).toEqual({
        message: 'Configuration updated successfully',
        config: expect.objectContaining({
          provider: IpLookupProviderType.IP_API,
        }),
      });
    });

    it('should update only specified configuration fields', () => {
      const partialConfig = {
        provider: IpLookupProviderType.IPLOCATE,
      };

      geolocationService.getConfig.mockReturnValue({
        ...mockConfig,
        provider: IpLookupProviderType.IPLOCATE,
      });

      const result = controller.updateConfig(partialConfig as any);

      expect(geolocationService.setConfig).toHaveBeenCalledWith(partialConfig);

      expect(result.message).toBe('Configuration updated successfully');
      expect(result.config).toBeDefined();
    });
  });

  describe('getProviders', () => {
    it('should return list of available providers with statistics', () => {
      geolocationService.getProviderStats.mockReturnValue(mockProviderStats);

      const result = controller.getProviders();

      expect(result).toEqual(mockProviderStats);

      expect(geolocationService.getProviderStats).toHaveBeenCalledTimes(1);
    });

    it('should return empty array if no providers configured', () => {
      geolocationService.getProviderStats.mockReturnValue({});

      const result = controller.getProviders();

      expect(result).toEqual({});
    });
  });

  describe('testLookup', () => {
    it('should successfully lookup IP address and return result', async () => {
      const testDto = { ip: '8.8.8.8' };
      geolocationService.getLocationForIp.mockResolvedValue(mockLocationData);
      geolocationService.getConfig.mockReturnValue(mockConfig);

      const result = await controller.testLookup(testDto);

      expect(geolocationService.getLocationForIp).toHaveBeenCalledWith(
        '8.8.8.8',
      );
      expect(result).toEqual({
        ip: '8.8.8.8',
        result: mockLocationData,
        provider: IpLookupProviderType.GEOIP_LITE,
      });
    });

    it('should return null result for IP with no geolocation data', async () => {
      const testDto = { ip: '192.168.1.1' };
      geolocationService.getLocationForIp.mockResolvedValue(null);
      geolocationService.getConfig.mockReturnValue(mockConfig);

      const result = await controller.testLookup(testDto);

      expect(result).toEqual({
        ip: '192.168.1.1',
        result: null,
        provider: IpLookupProviderType.GEOIP_LITE,
      });
    });

    it('should handle lookup for IPv6 addresses', async () => {
      const testDto = { ip: '2001:4860:4860::8888' };
      const ipv6LocationData = {
        country: 'US',
        countryName: 'United States',
        city: 'Mountain View',
      };
      geolocationService.getLocationForIp.mockResolvedValue(ipv6LocationData);
      geolocationService.getConfig.mockReturnValue(mockConfig);

      const result = await controller.testLookup(testDto);

      expect(geolocationService.getLocationForIp).toHaveBeenCalledWith(
        '2001:4860:4860::8888',
      );
      expect(result.result).toEqual(ipv6LocationData);
    });
  });

  describe('getStats', () => {
    it('should return combined provider stats and configuration', () => {
      geolocationService.getProviderStats.mockReturnValue(mockProviderStats);
      geolocationService.getConfig.mockReturnValue(mockConfig);

      const result = controller.getStats();

      expect(result).toEqual({
        providers: mockProviderStats,
        config: mockConfig,
      });

      expect(geolocationService.getProviderStats).toHaveBeenCalledTimes(1);

      expect(geolocationService.getConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe('getQueueStatus', () => {
    it('should return current queue statistics', () => {
      ipLookupQueueService.getQueueStats.mockReturnValue(mockQueueStats);

      const result = controller.getQueueStatus();

      expect(result).toEqual(mockQueueStats);

      expect(ipLookupQueueService.getQueueStats).toHaveBeenCalledTimes(1);
    });

    it('should handle empty queue', () => {
      const emptyQueueStats = {
        queueSize: 0,
        processing: false,
        itemsByPriority: { high: 0, normal: 0, low: 0 },
        uniqueIps: 0,
        totalRecords: 0,
      };
      ipLookupQueueService.getQueueStats.mockReturnValue(emptyQueueStats);

      const result = controller.getQueueStatus();

      expect(result).toEqual(emptyQueueStats);
    });
  });

  describe('processPending', () => {
    it('should queue pending lookups and return count', async () => {
      ipLookupQueueService.processPendingLookups.mockResolvedValue(150);

      const result = await controller.processPending();

      expect(ipLookupQueueService.processPendingLookups).toHaveBeenCalledWith(
        1000,
      );
      expect(result).toEqual({
        message: 'Queued 150 records for IP lookup',
        queued: 150,
      });
    });

    it('should handle zero pending records', async () => {
      ipLookupQueueService.processPendingLookups.mockResolvedValue(0);

      const result = await controller.processPending();

      expect(result).toEqual({
        message: 'Queued 0 records for IP lookup',
        queued: 0,
      });
    });

    it('should pass limit of 1000 to processPendingLookups', async () => {
      ipLookupQueueService.processPendingLookups.mockResolvedValue(1000);

      await controller.processPending();

      expect(ipLookupQueueService.processPendingLookups).toHaveBeenCalledWith(
        1000,
      );
    });
  });

  describe('clearQueue', () => {
    it('should clear the queue and return success message', () => {
      const result = controller.clearQueue();

      expect(ipLookupQueueService.clearQueue).toHaveBeenCalledTimes(1);

      expect(result).toEqual({
        message: 'Queue cleared successfully',
      });
    });
  });

  describe('setMode', () => {
    it('should set IP lookup mode to async', () => {
      const body = { async: true };

      const result = controller.setMode(body);

      expect(dmarcParserService.setAsyncIpLookup).toHaveBeenCalledWith(true);

      expect(result).toEqual({
        message: 'IP lookup mode set to async',
        async: true,
      });
    });

    it('should set IP lookup mode to sync', () => {
      const body = { async: false };

      const result = controller.setMode(body);

      expect(dmarcParserService.setAsyncIpLookup).toHaveBeenCalledWith(false);

      expect(result).toEqual({
        message: 'IP lookup mode set to sync',
        async: false,
      });
    });
  });

  describe('getProcessingStatus', () => {
    it('should return processing status with queue stats', async () => {
      ipLookupQueueService.getQueueStats.mockReturnValue(mockQueueStats);

      const result = await controller.getProcessingStatus();

      expect(result).toEqual({
        queue: mockQueueStats,
        message: 'Use SQL queries to get detailed status breakdown',
      });

      expect(ipLookupQueueService.getQueueStats).toHaveBeenCalledTimes(1);
    });
  });
});
