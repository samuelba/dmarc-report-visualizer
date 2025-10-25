import { Test, TestingModule } from '@nestjs/testing';
import { IpWhoisProvider } from './ipwhois.provider';
import { RateLimitError } from '../interfaces/ip-lookup-provider.interface';

// Mock fetch globally
global.fetch = jest.fn();

describe('IpWhoisProvider', () => {
  let provider: IpWhoisProvider;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: IpWhoisProvider,
          useFactory: () => new IpWhoisProvider(),
        },
      ],
    }).compile();

    provider = module.get<IpWhoisProvider>(IpWhoisProvider);
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('getName', () => {
    it('should return provider name', () => {
      expect(provider.getName()).toBe('ipwhois');
    });
  });

  describe('setApiKey', () => {
    it('should set API key', () => {
      provider.setApiKey('test-key');
      expect(provider).toBeDefined();
    });
  });

  describe('lookup', () => {
    it('should return geolocation data for successful API response', async () => {
      const mockResponse = {
        ip: '8.8.8.8',
        success: true,
        country: 'United States',
        country_code: 'US',
        region: 'California',
        region_code: 'CA',
        city: 'Mountain View',
        latitude: 37.386,
        longitude: -122.0838,
        timezone: {
          id: 'America/Los_Angeles',
        },
        connection: {
          asn: 15169,
          org: 'Google LLC',
          isp: 'Google Cloud',
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
        region: 'CA',
        regionName: 'California',
        city: 'Mountain View',
        latitude: 37.386,
        longitude: -122.0838,
        timezone: 'America/Los_Angeles',
        isp: 'Google Cloud',
        org: 'Google LLC',
        asn: 'AS15169',
      });
    });

    it('should return null when API returns success: false', async () => {
      const mockResponse = {
        ip: '192.168.1.1',
        success: false,
        message: 'Invalid IP address',
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

    it('should use API key in URL when provided', async () => {
      provider.setApiKey('test-api-key');

      const mockResponse = {
        ip: '8.8.8.8',
        success: true,
        country_code: 'US',
        country: 'United States',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      await provider.lookup('8.8.8.8');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://ipwho.is/8.8.8.8?key=test-api-key',
      );
    });

    it('should not use API key in URL when not provided', async () => {
      const mockResponse = {
        ip: '8.8.8.8',
        success: true,
        country_code: 'US',
        country: 'United States',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      await provider.lookup('8.8.8.8');

      expect(mockFetch).toHaveBeenCalledWith('http://ipwho.is/8.8.8.8');
    });

    it('should format ASN with AS prefix', async () => {
      const mockResponse = {
        ip: '8.8.8.8',
        success: true,
        country_code: 'US',
        connection: {
          asn: 15169,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await provider.lookup('8.8.8.8');

      expect(result?.asn).toBe('AS15169');
    });

    it('should handle missing connection data', async () => {
      const mockResponse = {
        ip: '8.8.8.8',
        success: true,
        country_code: 'US',
        country: 'United States',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await provider.lookup('8.8.8.8');

      expect(result?.isp).toBeUndefined();
      expect(result?.org).toBeUndefined();
      expect(result?.asn).toBeUndefined();
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
    it('should return monthly limit when no API key', () => {
      const info = provider.getRateLimitInfo();
      expect(info).toEqual({
        requestsPerMonth: 10000,
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
      expect(stats).toHaveProperty('monthlyRequests');
      expect(stats).toHaveProperty('monthlyLimit');
    });
  });
});
