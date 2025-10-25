import { Test, TestingModule } from '@nestjs/testing';
import { IpApiProvider } from './ip-api.provider';
import { RateLimitError } from '../interfaces/ip-lookup-provider.interface';

// Mock fetch globally
global.fetch = jest.fn();

describe('IpApiProvider', () => {
  let provider: IpApiProvider;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IpApiProvider],
    }).compile();

    provider = module.get<IpApiProvider>(IpApiProvider);
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('getName', () => {
    it('should return provider name', () => {
      expect(provider.getName()).toBe('ip-api');
    });
  });

  describe('lookup', () => {
    it('should return geolocation data for successful API response', async () => {
      const mockResponse = {
        status: 'success',
        query: '8.8.8.8',
        country: 'United States',
        countryCode: 'US',
        region: 'CA',
        regionName: 'California',
        city: 'Mountain View',
        lat: 37.386,
        lon: -122.0838,
        timezone: 'America/Los_Angeles',
        isp: 'Google LLC',
        org: 'Google Public DNS',
        as: 'AS15169 Google LLC',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await provider.lookup('8.8.8.8');

      expect(result).toEqual({
        country: 'US',
        countryName: 'United States',
        region: 'CA',
        regionName: 'California',
        city: 'Mountain View',
        latitude: 37.386,
        longitude: -122.0838,
        timezone: 'America/Los_Angeles',
        isp: 'Google LLC',
        org: 'Google Public DNS',
        asn: 'AS15169 Google LLC',
      });
    });

    it('should return null when API returns fail status', async () => {
      const mockResponse = {
        status: 'fail',
        message: 'private range',
        query: '192.168.1.1',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await provider.lookup('192.168.1.1');

      expect(result).toBeNull();
    });

    it('should throw RateLimitError when rate limit is reached', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
      } as Response);

      await expect(provider.lookup('8.8.8.8')).rejects.toThrow(RateLimitError);
    });

    it('should throw error for non-ok HTTP response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await expect(provider.lookup('8.8.8.8')).rejects.toThrow(
        'HTTP error! status: 500',
      );
    });

    it('should use country name from API or fallback to regionNames', async () => {
      const mockResponse = {
        status: 'success',
        query: '8.8.8.8',
        countryCode: 'US',
        // No country field provided
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await provider.lookup('8.8.8.8');

      expect(result?.countryName).toBe('United States');
    });
  });

  describe('supportsIp', () => {
    it('should return true for public IPv4 addresses', () => {
      expect(provider.supportsIp('8.8.8.8')).toBe(true);
      expect(provider.supportsIp('1.2.3.4')).toBe(true);
    });

    it('should return false for private IPv4 addresses', () => {
      expect(provider.supportsIp('192.168.1.1')).toBe(false);
      expect(provider.supportsIp('10.0.0.1')).toBe(false);
      expect(provider.supportsIp('172.16.0.1')).toBe(false);
    });

    it('should return false for localhost', () => {
      expect(provider.supportsIp('127.0.0.1')).toBe(false);
      expect(provider.supportsIp('::1')).toBe(false);
    });
  });

  describe('getRateLimitInfo', () => {
    it('should return rate limit info', () => {
      const info = provider.getRateLimitInfo();
      expect(info).toEqual({
        requestsPerMinute: 45,
      });
    });
  });

  describe('getRateLimiterStats', () => {
    it('should return rate limiter statistics', () => {
      const stats = provider.getRateLimiterStats();
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('minuteRequests');
      expect(stats).toHaveProperty('dailyRequests');
    });
  });
});
