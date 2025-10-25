import { Test, TestingModule } from '@nestjs/testing';
import { IpLocateProvider } from './iplocate.provider';
import { RateLimitError } from '../interfaces/ip-lookup-provider.interface';

// Mock fetch globally
global.fetch = jest.fn();

describe('IpLocateProvider', () => {
  let provider: IpLocateProvider;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: IpLocateProvider,
          useFactory: () => new IpLocateProvider('test-api-key'),
        },
      ],
    }).compile();

    provider = module.get<IpLocateProvider>(IpLocateProvider);
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('getName', () => {
    it('should return provider name', () => {
      expect(provider.getName()).toBe('iplocate');
    });
  });

  describe('setApiKey', () => {
    it('should set API key', () => {
      provider.setApiKey('new-test-key');
      expect(provider).toBeDefined();
    });
  });

  describe('lookup', () => {
    it('should throw error when API key is not provided', async () => {
      const providerWithoutKey = new IpLocateProvider();
      await expect(providerWithoutKey.lookup('8.8.8.8')).rejects.toThrow(
        'IPLocate API key is required',
      );
    });

    it('should return geolocation data for successful API response', async () => {
      const mockResponse = {
        ip: '8.8.8.8',
        country: 'United States',
        country_code: 'US',
        city: 'Mountain View',
        subdivision: 'California',
        latitude: 37.386,
        longitude: -122.0838,
        time_zone: 'America/Los_Angeles',
        asn: {
          asn: 'AS15169',
          name: 'Google LLC',
          netname: 'GOOGLE',
        },
        hosting: {
          provider: 'Google Cloud',
        },
        company: {
          name: 'Google LLC',
        },
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
        region: 'California',
        regionName: 'California',
        city: 'Mountain View',
        latitude: 37.386,
        longitude: -122.0838,
        timezone: 'America/Los_Angeles',
        isp: 'Google Cloud',
        org: 'Google LLC',
        asn: 'AS15169',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://iplocate.io/api/lookup/8.8.8.8',
        {
          headers: {
            'X-API-Key': 'test-api-key',
          },
        },
      );
    });

    it('should use ASN name as ISP fallback when hosting provider not available', async () => {
      const mockResponse = {
        ip: '8.8.8.8',
        country_code: 'US',
        asn: {
          name: 'Google LLC',
        },
        company: {
          name: 'Google Inc',
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await provider.lookup('8.8.8.8');

      expect(result?.isp).toBe('Google LLC');
      expect(result?.org).toBe('Google Inc');
    });

    it('should use ASN netname as org fallback when company not available', async () => {
      const mockResponse = {
        ip: '8.8.8.8',
        country_code: 'US',
        asn: {
          netname: 'GOOGLE',
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await provider.lookup('8.8.8.8');

      expect(result?.org).toBe('GOOGLE');
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
        requestsPerDay: 1000,
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
