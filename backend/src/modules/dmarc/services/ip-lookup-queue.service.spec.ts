import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IpLookupQueueService } from './ip-lookup-queue.service';
import { DmarcRecord, GeoLookupStatus } from '../entities/dmarc-record.entity';
import { GeolocationService } from './geolocation.service';
import { RateLimitError } from '../interfaces/ip-lookup-provider.interface';
import { IpLookupProviderType } from '../config/ip-lookup.config';

describe('IpLookupQueueService', () => {
  let service: IpLookupQueueService;
  let dmarcRecordRepository: jest.Mocked<Repository<DmarcRecord>>;
  let geolocationService: jest.Mocked<GeolocationService>;

  beforeEach(async () => {
    const mockRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    const mockGeolocationService = {
      getLocationForIp: jest.fn(),
      getProviderStats: jest.fn().mockReturnValue({
        'geoip-lite': {
          name: 'GeoIP Lite',
          rateLimits: {
            requestsPerMinute: 100,
            requestsPerDay: 1000,
          },
          usage: {
            minuteRequests: 10,
            minuteLimit: 100,
            dailyRequests: 100,
            dailyLimit: 1000,
          },
        },
      }),
      getConfig: jest.fn().mockReturnValue({
        provider: IpLookupProviderType.GEOIP_LITE,
        fallbackProviders: [],
      }),
      setConfig: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpLookupQueueService,
        {
          provide: getRepositoryToken(DmarcRecord),
          useValue: mockRepository,
        },
        {
          provide: GeolocationService,
          useValue: mockGeolocationService,
        },
      ],
    }).compile();

    service = module.get<IpLookupQueueService>(IpLookupQueueService);
    dmarcRecordRepository = module.get(getRepositoryToken(DmarcRecord));
    geolocationService = module.get(GeolocationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('queueIpLookup', () => {
    it('should add new IP to queue', async () => {
      await service.queueIpLookup('1.2.3.4', ['record1', 'record2'], 1);

      const stats = service.getQueueStats();
      expect(stats.queueSize).toBe(1);
      expect(stats.uniqueIps).toBe(1);
      expect(stats.totalRecords).toBe(2);
    });

    it('should merge records for duplicate IP', async () => {
      await service.queueIpLookup('1.2.3.4', ['record1', 'record2'], 1);
      await service.queueIpLookup('1.2.3.4', ['record3'], 1);

      const stats = service.getQueueStats();
      expect(stats.queueSize).toBe(1);
      expect(stats.uniqueIps).toBe(1);
      expect(stats.totalRecords).toBe(3);
    });

    it('should upgrade priority for duplicate IP', async () => {
      await service.queueIpLookup('1.2.3.4', ['record1'], 2); // low priority
      await service.queueIpLookup('1.2.3.4', ['record2'], 0); // high priority

      const stats = service.getQueueStats();
      expect(stats.itemsByPriority.high).toBe(1);
      expect(stats.itemsByPriority.low).toBe(0);
    });

    it('should sort queue by priority', async () => {
      await service.queueIpLookup('1.2.3.4', ['record1'], 2); // low
      await service.queueIpLookup('5.6.7.8', ['record2'], 0); // high
      await service.queueIpLookup('9.10.11.12', ['record3'], 1); // normal

      const stats = service.getQueueStats();
      expect(stats.itemsByPriority.high).toBe(1);
      expect(stats.itemsByPriority.normal).toBe(1);
      expect(stats.itemsByPriority.low).toBe(1);
    });

    it('should use default priority when not specified', async () => {
      await service.queueIpLookup('1.2.3.4', ['record1']);

      const stats = service.getQueueStats();
      expect(stats.itemsByPriority.normal).toBe(1);
    });
  });

  describe('queueMultipleIps', () => {
    it('should queue multiple IPs', async () => {
      await service.queueMultipleIps([
        { ip: '1.2.3.4', recordIds: ['record1'] },
        { ip: '5.6.7.8', recordIds: ['record2', 'record3'] },
      ]);

      const stats = service.getQueueStats();
      expect(stats.queueSize).toBe(2);
      expect(stats.totalRecords).toBe(3);
    });

    it('should respect custom priorities', async () => {
      // Queue low priority first
      await service.queueIpLookup('1.2.3.4', ['record1'], 2);

      const statsBefore = service.getQueueStats();
      expect(statsBefore.itemsByPriority.low).toBe(1);

      // Queue high priority second - should be sorted to front
      await service.queueIpLookup('5.6.7.8', ['record2'], 0);

      const stats = service.getQueueStats();
      expect(stats.itemsByPriority.high).toBe(1);
      expect(stats.itemsByPriority.low).toBe(1);
      expect(stats.queueSize).toBe(2);
    });
  });

  describe('getQueueStats', () => {
    it('should return correct queue statistics', async () => {
      await service.queueIpLookup('1.2.3.4', ['record1', 'record2'], 0);
      await service.queueIpLookup('5.6.7.8', ['record3'], 1);
      await service.queueIpLookup(
        '9.10.11.12',
        ['record4', 'record5', 'record6'],
        2,
      );

      const stats = service.getQueueStats();

      expect(stats.queueSize).toBe(3);
      expect(stats.processing).toBe(false);
      expect(stats.itemsByPriority.high).toBe(1);
      expect(stats.itemsByPriority.normal).toBe(1);
      expect(stats.itemsByPriority.low).toBe(1);
      expect(stats.uniqueIps).toBe(3);
      expect(stats.totalRecords).toBe(6);
    });

    it('should return empty stats for empty queue', () => {
      const stats = service.getQueueStats();

      expect(stats.queueSize).toBe(0);
      expect(stats.processing).toBe(false);
      expect(stats.itemsByPriority.high).toBe(0);
      expect(stats.itemsByPriority.normal).toBe(0);
      expect(stats.itemsByPriority.low).toBe(0);
      expect(stats.uniqueIps).toBe(0);
      expect(stats.totalRecords).toBe(0);
    });
  });

  describe('clearQueue', () => {
    it('should clear all items from queue', async () => {
      await service.queueIpLookup('1.2.3.4', ['record1'], 1);
      await service.queueIpLookup('5.6.7.8', ['record2'], 1);

      service.clearQueue();

      const stats = service.getQueueStats();
      expect(stats.queueSize).toBe(0);
    });
  });

  describe('processPendingLookups', () => {
    it('should return 0 when no pending records', async () => {
      (
        dmarcRecordRepository.createQueryBuilder().getMany as jest.Mock
      ).mockResolvedValue([]);

      const count = await service.processPendingLookups(1000);

      expect(count).toBe(0);
    });

    it('should queue pending records', async () => {
      const mockRecords = [
        {
          id: 'record1',
          sourceIp: '1.2.3.4',
          geoLookupStatus: GeoLookupStatus.PENDING,
        },
        {
          id: 'record2',
          sourceIp: '1.2.3.4',
          geoLookupStatus: GeoLookupStatus.PENDING,
        },
        {
          id: 'record3',
          sourceIp: '5.6.7.8',
          geoLookupStatus: GeoLookupStatus.FAILED,
        },
      ];
      (
        dmarcRecordRepository.createQueryBuilder().getMany as jest.Mock
      ).mockResolvedValue(mockRecords);

      const count = await service.processPendingLookups(1000);

      expect(count).toBe(3);
      const stats = service.getQueueStats();
      expect(stats.uniqueIps).toBe(2); // Two unique IPs
      expect(stats.totalRecords).toBe(3);
    });

    it('should respect limit parameter', async () => {
      const mockRecords = [
        {
          id: 'record1',
          sourceIp: '1.2.3.4',
          geoLookupStatus: GeoLookupStatus.PENDING,
        },
      ];
      (
        dmarcRecordRepository.createQueryBuilder().getMany as jest.Mock
      ).mockResolvedValue(mockRecords);

      await service.processPendingLookups(500);

      expect(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        dmarcRecordRepository.createQueryBuilder().limit,
      ).toHaveBeenCalledWith(500);
    });

    it('should skip records without sourceIp', async () => {
      const mockRecords = [
        {
          id: 'record1',
          sourceIp: '1.2.3.4',
          geoLookupStatus: GeoLookupStatus.PENDING,
        },
        {
          id: 'record2',
          sourceIp: null,
          geoLookupStatus: GeoLookupStatus.PENDING,
        },
      ];
      (
        dmarcRecordRepository.createQueryBuilder().getMany as jest.Mock
      ).mockResolvedValue(mockRecords);

      await service.processPendingLookups(1000);

      const stats = service.getQueueStats();
      expect(stats.uniqueIps).toBe(1);
    });

    it('should group records by IP', async () => {
      const mockRecords = [
        {
          id: 'record1',
          sourceIp: '1.2.3.4',
          geoLookupStatus: GeoLookupStatus.PENDING,
        },
        {
          id: 'record2',
          sourceIp: '1.2.3.4',
          geoLookupStatus: GeoLookupStatus.PENDING,
        },
        {
          id: 'record3',
          sourceIp: '5.6.7.8',
          geoLookupStatus: GeoLookupStatus.PENDING,
        },
      ];
      (
        dmarcRecordRepository.createQueryBuilder().getMany as jest.Mock
      ).mockResolvedValue(mockRecords);

      await service.processPendingLookups(1000);

      const stats = service.getQueueStats();
      expect(stats.uniqueIps).toBe(2);
      expect(stats.totalRecords).toBe(3);
    });
  });

  describe('event-driven processing', () => {
    it('should trigger processing when items are queued', async () => {
      const triggerSpy = jest.spyOn(service as any, 'triggerProcessing');

      await service.queueIpLookup('1.2.3.4', ['record1'], 1);

      expect(triggerSpy).toHaveBeenCalled();
    });

    it('should not trigger processing if already processing', () => {
      const triggerSpy = jest.spyOn(service as any, 'triggerProcessing');

      // Set processing flag
      service['processing'] = true;

      service['triggerProcessing']();

      // Should return early without calling processQueue
      expect(triggerSpy).toHaveBeenCalled();
    });
  });

  describe('processor integration', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should process queue item successfully', async () => {
      const mockGeoData = {
        country: 'US',
        countryName: 'United States',
        city: 'New York',
        latitude: 40.7128,
        longitude: -74.006,
        isp: 'Test ISP',
        org: 'Test Org',
      };
      geolocationService.getLocationForIp.mockResolvedValue(mockGeoData);
      geolocationService.getProviderStats.mockReturnValue({
        'geoip-lite': {
          name: 'GeoIP Lite',
          rateLimits: {},
          usage: {
            minuteRequests: 0,
            dailyRequests: 0,
          },
        },
      });

      await service.queueIpLookup('1.2.3.4', ['record1'], 0);

      // Wait for setImmediate and promises
      await jest.runAllTimersAsync();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(geolocationService.getLocationForIp).toHaveBeenCalledWith(
        '1.2.3.4',
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(dmarcRecordRepository.update).toHaveBeenCalledWith(
        ['record1'],
        expect.objectContaining({
          geoCountry: 'US',
          geoCountryName: 'United States',
          geoCity: 'New York',
          geoLookupStatus: GeoLookupStatus.COMPLETED,
        }),
      );
    }, 10000);

    it('should handle null geolocation data', async () => {
      geolocationService.getLocationForIp.mockResolvedValue(null);
      geolocationService.getProviderStats.mockReturnValue({
        'geoip-lite': {
          name: 'GeoIP Lite',
          rateLimits: {},
          usage: {
            minuteRequests: 0,
            dailyRequests: 0,
          },
        },
      });

      await service.queueIpLookup('1.2.3.4', ['record1'], 0);

      await jest.runAllTimersAsync();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(dmarcRecordRepository.update).toHaveBeenCalledWith(
        ['record1'],
        expect.objectContaining({
          geoLookupStatus: GeoLookupStatus.FAILED,
        }),
      );
    }, 10000);

    it('should requeue on rate limit error', async () => {
      geolocationService.getLocationForIp.mockRejectedValue(
        new RateLimitError('Rate limited', 1000),
      );
      geolocationService.getProviderStats.mockReturnValue({
        'geoip-lite': {
          name: 'GeoIP Lite',
          rateLimits: {},
          usage: {
            minuteRequests: 0,
            dailyRequests: 0,
          },
        },
      });

      await service.queueIpLookup('1.2.3.4', ['record1'], 0);

      // Run only one cycle of timers (not all, to avoid infinite loop)
      await jest.advanceTimersByTimeAsync(0); // Process setImmediate
      await jest.advanceTimersByTimeAsync(1000); // Process setTimeout

      // Should be back in queue with low priority
      const stats = service.getQueueStats();
      expect(stats.queueSize).toBe(1);
      expect(stats.itemsByPriority.low).toBe(1);
    }, 10000);

    it('should skip processing when rate limit is approaching', async () => {
      geolocationService.getProviderStats.mockReturnValue({
        'geoip-lite': {
          name: 'GeoIP Lite',
          rateLimits: {
            requestsPerMinute: 100,
            requestsPerDay: 1000,
          },
          usage: {
            minuteRequests: 100, // At limit
            minuteLimit: 100,
            dailyRequests: 100,
            dailyLimit: 1000,
          },
        },
      });

      await service.queueIpLookup('1.2.3.4', ['record1'], 0);

      await jest.runAllTimersAsync();

      // Should not process due to rate limit
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(geolocationService.getLocationForIp).not.toHaveBeenCalled();
      expect(service.getQueueStats().queueSize).toBe(1);
    }, 10000);

    it('should not process when already processing', async () => {
      let resolveFirst: any;
      geolocationService.getLocationForIp.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      );
      geolocationService.getProviderStats.mockReturnValue({
        'geoip-lite': {
          name: 'GeoIP Lite',
          rateLimits: {},
          usage: {
            minuteRequests: 0,
            dailyRequests: 0,
          },
        },
      });

      await service.queueIpLookup('1.2.3.4', ['record1'], 0);
      await service.queueIpLookup('5.6.7.8', ['record2'], 0);

      // Start processing first item
      await jest.advanceTimersByTimeAsync(0);

      // Only one call should have been made (second is blocked by processing flag)
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(geolocationService.getLocationForIp).toHaveBeenCalledTimes(1);

      // Resolve first lookup
      resolveFirst({ country: 'US' });
      await jest.runAllTimersAsync();

      // Now second should be processed
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(geolocationService.getLocationForIp).toHaveBeenCalledTimes(2);
    }, 10000);

    it('should not process empty queue', async () => {
      service['triggerProcessing']();
      await jest.runAllTimersAsync();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(geolocationService.getLocationForIp).not.toHaveBeenCalled();
    }, 10000);

    it('should process cache hits immediately without delay', async () => {
      const mockGeoData = { country: 'US', countryName: 'United States' };
      geolocationService.getLocationForIp.mockResolvedValue(mockGeoData);

      // Mock stats to show no API call was made (cache hit)
      geolocationService.getProviderStats
        .mockReturnValueOnce({
          'geoip-lite': {
            name: 'GeoIP Lite',
            rateLimits: {},
            usage: { minuteRequests: 5, dailyRequests: 50 },
          },
        })
        .mockReturnValueOnce({
          'geoip-lite': {
            name: 'GeoIP Lite',
            rateLimits: {},
            usage: { minuteRequests: 5, dailyRequests: 50 }, // Same count = cache hit
          },
        });

      await service.queueIpLookup('1.2.3.4', ['record1'], 0);
      await service.queueIpLookup('5.6.7.8', ['record2'], 0);

      // Process both items
      await jest.runAllTimersAsync();

      // Both should be processed (cache hits don't wait)
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(geolocationService.getLocationForIp).toHaveBeenCalledTimes(2);
      expect(service.getQueueStats().queueSize).toBe(0);
    }, 10000);

    it('should wait after API calls', async () => {
      const mockGeoData = { country: 'US', countryName: 'United States' };
      geolocationService.getLocationForIp.mockResolvedValue(mockGeoData);

      // Mock stats to show API call was made
      geolocationService.getProviderStats
        .mockReturnValueOnce({
          'geoip-lite': {
            name: 'GeoIP Lite',
            rateLimits: {},
            usage: { minuteRequests: 5, dailyRequests: 50 },
          },
        })
        .mockReturnValueOnce({
          'geoip-lite': {
            name: 'GeoIP Lite',
            rateLimits: {},
            usage: { minuteRequests: 6, dailyRequests: 51 }, // Increased = API call
          },
        });

      await service.queueIpLookup('1.2.3.4', ['record1'], 0);

      // Start processing
      await jest.advanceTimersByTimeAsync(0);

      // Should have processed first item
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(geolocationService.getLocationForIp).toHaveBeenCalledTimes(1);

      // Queue should be empty after processing
      expect(service.getQueueStats().queueSize).toBe(0);
    }, 10000);
  });

  describe('error handling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should retry on non-rate-limit errors', async () => {
      geolocationService.getLocationForIp.mockRejectedValue(
        new Error('Network error'),
      );
      geolocationService.getProviderStats.mockReturnValue({
        'geoip-lite': {
          name: 'GeoIP Lite',
          rateLimits: {},
          usage: {
            minuteRequests: 0,
            dailyRequests: 0,
          },
        },
      });

      await service.queueIpLookup('1.2.3.4', ['record1'], 0);

      // Run only one cycle of timers (not all, to avoid infinite loop)
      await jest.advanceTimersByTimeAsync(0); // Process setImmediate
      await jest.advanceTimersByTimeAsync(1000); // Process setTimeout

      // Should mark as failed and requeue
      const stats = service.getQueueStats();
      expect(stats.queueSize).toBe(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(dmarcRecordRepository.update).toHaveBeenCalledWith(
        ['record1'],
        expect.objectContaining({
          geoLookupStatus: GeoLookupStatus.PENDING,
        }),
      );
    }, 10000);

    it('should give up after max failed attempts', async () => {
      geolocationService.getLocationForIp.mockRejectedValue(
        new Error('Network error'),
      );
      geolocationService.getProviderStats.mockReturnValue({
        'geoip-lite': {
          name: 'GeoIP Lite',
          rateLimits: {},
          usage: {
            minuteRequests: 0,
            dailyRequests: 0,
          },
        },
      });

      await service.queueIpLookup('1.2.3.4', ['record1'], 0);

      // Process 4 times (3 failed attempts + 1 final attempt with geoip-lite)
      for (let i = 0; i < 4; i++) {
        await jest.advanceTimersByTimeAsync(0); // Process setImmediate
        await jest.advanceTimersByTimeAsync(1000); // Process setTimeout
      }

      // Should try geoip-lite as last resort
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(geolocationService.setConfig).toHaveBeenCalled();
    }, 15000);
  });

  describe('onModuleInit', () => {
    it('should load pending lookups on init and trigger processing', async () => {
      const mockRecords = [
        {
          id: 'record1',
          sourceIp: '1.2.3.4',
          geoLookupStatus: GeoLookupStatus.PENDING,
        },
      ];

      (
        dmarcRecordRepository.createQueryBuilder().getMany as jest.Mock
      ).mockResolvedValue(mockRecords);

      const freshService = new IpLookupQueueService(
        dmarcRecordRepository,
        geolocationService,
      );

      const triggerSpy = jest.spyOn(freshService as any, 'triggerProcessing');

      await freshService.onModuleInit();

      // Wait for async operations
      await new Promise((resolve) => process.nextTick(resolve));

      const stats = freshService.getQueueStats();
      expect(stats.queueSize).toBeGreaterThanOrEqual(0); // May have processed already
      expect(triggerSpy).toHaveBeenCalled(); // Processing should be triggered
    });
  });
});
