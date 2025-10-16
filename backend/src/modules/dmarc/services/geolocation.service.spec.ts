import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GeolocationService } from './geolocation.service';
import { IpLocation } from '../entities/ip-location.entity';
import * as geoip from 'geoip-lite';

// Mock geoip-lite
jest.mock('geoip-lite');

describe('GeolocationService', () => {
  let service: GeolocationService;

  const mockRepository = {
    findOne: jest.fn(),
    upsert: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeolocationService,
        {
          provide: getRepositoryToken(IpLocation),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<GeolocationService>(GeolocationService);
    module.get<Repository<IpLocation>>(getRepositoryToken(IpLocation));

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('getLocationForIp', () => {
    it('should return null for localhost IPv4', async () => {
      const result = await service.getLocationForIp('127.0.0.1');
      expect(result).toBeNull();
      expect(mockRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return null for localhost IPv6', async () => {
      const result = await service.getLocationForIp('::1');
      expect(result).toBeNull();
      expect(mockRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return null for private IP 192.168.x.x', async () => {
      const result = await service.getLocationForIp('192.168.1.1');
      expect(result).toBeNull();
      expect(mockRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return null for private IP 10.x.x.x', async () => {
      const result = await service.getLocationForIp('10.0.0.1');
      expect(result).toBeNull();
      expect(mockRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return null for empty IP', async () => {
      const result = await service.getLocationForIp('');
      expect(result).toBeNull();
      expect(mockRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return cached data if less than 30 days old', async () => {
      const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const cachedLocation: Partial<IpLocation> = {
        ip: '8.8.8.8',
        country: 'US',
        countryName: 'United States',
        city: 'Mountain View',
        latitude: 37.4056,
        longitude: -122.0775,
        createdAt: recentDate,
      };

      mockRepository.findOne.mockResolvedValue(cachedLocation);

      const result = await service.getLocationForIp('8.8.8.8');

      expect(result).toEqual({
        country: 'US',
        countryName: 'United States',
        city: 'Mountain View',
        latitude: 37.4056,
        longitude: -122.0775,
        region: undefined,
        regionName: undefined,
        timezone: undefined,
        isp: undefined,
      });
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { ip: '8.8.8.8' },
      });
    });

    it('should skip cache if data is older than 30 days', async () => {
      const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000); // 35 days ago
      const cachedLocation: Partial<IpLocation> = {
        ip: '8.8.8.8',
        country: 'US',
        city: 'Mountain View',
        createdAt: oldDate,
      };

      mockRepository.findOne.mockResolvedValue(cachedLocation);
      (geoip.lookup as jest.Mock).mockReturnValue({
        country: 'US',
        region: 'CA',
        city: 'Mountain View',
        ll: [37.4056, -122.0775],
        timezone: 'America/Los_Angeles',
      });

      mockRepository.upsert.mockResolvedValue({});

      const result = await service.getLocationForIp('8.8.8.8');

      expect(result).toBeDefined();
      expect(result?.country).toBe('US');
      expect(geoip.lookup).toHaveBeenCalledWith('8.8.8.8');
    });

    it('should lookup and cache new IP location', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      (geoip.lookup as jest.Mock).mockReturnValue({
        country: 'DE',
        region: 'BE',
        city: 'Berlin',
        ll: [52.5244, 13.4105],
        timezone: 'Europe/Berlin',
      });

      mockRepository.upsert.mockResolvedValue({});

      const result = await service.getLocationForIp('1.2.3.4');

      expect(result).toEqual({
        country: 'DE',
        countryName: 'Germany',
        region: 'BE',
        city: 'Berlin',
        latitude: 52.5244,
        longitude: 13.4105,
        timezone: 'Europe/Berlin',
      });

      expect(geoip.lookup).toHaveBeenCalledWith('1.2.3.4');
      expect(mockRepository.upsert).toHaveBeenCalled();
    });

    it('should return null and cache negative result when geoip returns null', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      (geoip.lookup as jest.Mock).mockReturnValue(null);

      mockRepository.upsert.mockResolvedValue({});

      const result = await service.getLocationForIp('1.2.3.4');

      expect(result).toBeNull();
      expect(mockRepository.upsert).toHaveBeenCalled();
    });

    it('should handle geoip data without coordinates', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      (geoip.lookup as jest.Mock).mockReturnValue({
        country: 'FR',
        city: 'Paris',
        // No ll (coordinates)
      });

      mockRepository.upsert.mockResolvedValue({});

      const result = await service.getLocationForIp('1.2.3.4');

      expect(result).toEqual({
        country: 'FR',
        countryName: 'France',
        city: 'Paris',
        region: undefined,
        latitude: undefined,
        longitude: undefined,
        timezone: undefined,
      });
    });

    it('should handle errors gracefully', async () => {
      mockRepository.findOne.mockRejectedValue(new Error('Database error'));

      const result = await service.getLocationForIp('1.2.3.4');

      expect(result).toBeNull();
    });

    it('should return numeric latitude/longitude from cache', async () => {
      const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const cachedLocation: Partial<IpLocation> = {
        ip: '8.8.8.8',
        country: 'US',
        latitude: 37.4056,
        longitude: -122.0775,
        createdAt: recentDate,
      };

      mockRepository.findOne.mockResolvedValue(cachedLocation);

      const result = await service.getLocationForIp('8.8.8.8');

      expect(typeof result?.latitude).toBe('number');
      expect(typeof result?.longitude).toBe('number');
      expect(result?.latitude).toBe(37.4056);
      expect(result?.longitude).toBe(-122.0775);
    });

    it('should handle undefined coordinates in cache', async () => {
      const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const cachedLocation: Partial<IpLocation> = {
        ip: '8.8.8.8',
        country: 'US',
        latitude: undefined,
        longitude: undefined,
        createdAt: recentDate,
      };

      mockRepository.findOne.mockResolvedValue(cachedLocation);

      const result = await service.getLocationForIp('8.8.8.8');

      expect(result?.latitude).toBeUndefined();
      expect(result?.longitude).toBeUndefined();
    });

    it('should get country name for valid country code', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      (geoip.lookup as jest.Mock).mockReturnValue({
        country: 'GB',
        city: 'London',
      });

      mockRepository.create.mockImplementation((data) => data);
      mockRepository.save.mockResolvedValue({});

      const result = await service.getLocationForIp('1.2.3.4');

      expect(result?.country).toBe('GB');
      expect(result?.countryName).toBe('United Kingdom');
    });

    it('should cache ISP information if available', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      (geoip.lookup as jest.Mock).mockReturnValue({
        country: 'US',
        city: 'Mountain View',
      });

      mockRepository.upsert.mockResolvedValue({});

      await service.getLocationForIp('8.8.8.8');

      expect(mockRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '8.8.8.8',
          country: 'US',
        }),
        ['ip'],
      );
    });
  });
});
