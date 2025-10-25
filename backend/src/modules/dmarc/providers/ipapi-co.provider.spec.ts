import { Test, TestingModule } from '@nestjs/testing';
import { IpApiCoProvider } from './ipapi-co.provider';
import { RateLimitError } from '../interfaces/ip-lookup-provider.interface';

// Mock fetch globally
global.fetch = jest.fn();

describe('IpApiCoProvider', () => {
  let provider: IpApiCoProvider;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: IpApiCoProvider,
          useFactory: () => new IpApiCoProvider(),
        },
      ],
    }).compile();

    provider = module.get<IpApiCoProvider>(IpApiCoProvider);
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('getName', () => {
    it('should return provider name', () => {
      expect(provider.getName()).toBe('ipapi-co');
    });
  });

  describe('setApiKey', () => {
    it('should set API key', () => {
      provider.setApiKey('test-key');
      // No direct way to verify, but it should not throw
      expect(provider).toBeDefined();
    });
  });

  describe('lookup', () => {
    it('should return geolocation data for successful API response', async () => {
      const mockResponse = {
        ip: '8.8.8.8',
        city: 'Mountain View',
        region: 'California',
        region_code: 'CA',
        country_code: 'US',
        country_name: 'United States',
        latitude: 37.386,
        longitude: -122.0838,
        timezone: 'America/Los_Angeles',
        asn: 'AS15169',
        org: 'Google LLC',
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
        org: 'Google LLC',
        asn: 'AS15169',
      });
    }, 10000); // Increase timeout to account for 2s delay

    it('should return null when API returns error', async () => {
      const mockResponse = {
        error: true,
        reason: 'Invalid IP address',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await provider.lookup('invalid-ip');

      expect(result).toBeNull();
    }, 10000);

    it('should throw RateLimitError when rate limit is reached', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
      } as Response);

      await expect(provider.lookup('8.8.8.8')).rejects.toThrow(RateLimitError);
    });

    it('should use API key in URL when provided', async () => {
      provider.setApiKey('test-api-key');

      const mockResponse = {
        ip: '8.8.8.8',
        country_code: 'US',
        country_name: 'United States',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      await provider.lookup('8.8.8.8');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://ipapi.co/8.8.8.8/json/?key=test-api-key',
      );
    }, 10000);

    it('should not use API key in URL when not provided', async () => {
      const mockResponse = {
        ip: '8.8.8.8',
        country_code: 'US',
        country_name: 'United States',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      await provider.lookup('8.8.8.8');

      expect(mockFetch).toHaveBeenCalledWith('https://ipapi.co/8.8.8.8/json/');
    }, 10000);
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
    it('should return daily limit when no API key', () => {
      const info = provider.getRateLimitInfo();
      expect(info).toEqual({
        requestsPerDay: 1000,
      });
    });

    it('should return empty object when API key is set', () => {
      provider.setApiKey('test-key');
      const info = provider.getRateLimitInfo();
      expect(info).toEqual({});
    });
  });

  describe('getUsageStats', () => {
    it('should return usage statistics', () => {
      const stats = provider.getUsageStats();
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('minuteRequests');
      expect(stats).toHaveProperty('dailyRequests');
      expect(stats).toHaveProperty('dailyLimit');
    });
  });
});
