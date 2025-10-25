import { Test, TestingModule } from '@nestjs/testing';
import { GeoipLiteProvider } from './geoip-lite.provider';
import * as geoip from 'geoip-lite';

// Mock the geoip-lite module
jest.mock('geoip-lite');

describe('GeoipLiteProvider', () => {
  let provider: GeoipLiteProvider;
  let mockGeoipLookup: jest.MockedFunction<typeof geoip.lookup>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GeoipLiteProvider],
    }).compile();

    provider = module.get<GeoipLiteProvider>(GeoipLiteProvider);
    mockGeoipLookup = geoip.lookup;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('getName', () => {
    it('should return provider name', () => {
      expect(provider.getName()).toBe('geoip-lite');
    });
  });

  describe('lookup', () => {
    it('should return geolocation data for valid public IP', async () => {
      const mockGeoData = {
        country: 'US',
        region: 'CA',
        city: 'Mountain View',
        ll: [37.386, -122.0838],
        timezone: 'America/Los_Angeles',
      };

      mockGeoipLookup.mockReturnValue(mockGeoData);

      const result = await provider.lookup('8.8.8.8');

      expect(result).toEqual({
        country: 'US',
        countryName: 'United States',
        region: 'CA',
        city: 'Mountain View',
        latitude: 37.386,
        longitude: -122.0838,
        timezone: 'America/Los_Angeles',
        isp: undefined,
        org: undefined,
      });
      expect(mockGeoipLookup).toHaveBeenCalledWith('8.8.8.8');
    });

    it('should return null when geoip-lite returns null', async () => {
      mockGeoipLookup.mockReturnValue(null);

      const result = await provider.lookup('1.2.3.4');

      expect(result).toBeNull();
      expect(mockGeoipLookup).toHaveBeenCalledWith('1.2.3.4');
    });

    it('should handle missing coordinates gracefully', async () => {
      const mockGeoData = {
        country: 'US',
        region: 'CA',
        city: 'Mountain View',
        timezone: 'America/Los_Angeles',
      };

      mockGeoipLookup.mockReturnValue(mockGeoData);

      const result = await provider.lookup('8.8.8.8');

      expect(result).toEqual({
        country: 'US',
        countryName: 'United States',
        region: 'CA',
        city: 'Mountain View',
        latitude: undefined,
        longitude: undefined,
        timezone: 'America/Los_Angeles',
        isp: undefined,
        org: undefined,
      });
    });

    it('should handle errors gracefully', async () => {
      mockGeoipLookup.mockImplementation(() => {
        throw new Error('Lookup failed');
      });

      const result = await provider.lookup('8.8.8.8');

      expect(result).toBeNull();
    });

    it('should handle country code without name', async () => {
      const mockGeoData = {
        country: 'ZZ',
        region: 'XX',
        city: 'Unknown',
        ll: [0, 0],
        timezone: 'UTC',
      };

      mockGeoipLookup.mockReturnValue(mockGeoData);

      const result = await provider.lookup('1.2.3.4');

      // regionNames.of() for invalid code returns 'Unknown Region'
      expect(result?.countryName).toBe('Unknown Region');
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

    it('should return false for empty IPs', () => {
      expect(provider.supportsIp('')).toBe(false);
    });
  });

  describe('getRateLimitInfo', () => {
    it('should return empty object (no rate limits for local provider)', () => {
      const info = provider.getRateLimitInfo();
      expect(info).toEqual({});
    });
  });
});
