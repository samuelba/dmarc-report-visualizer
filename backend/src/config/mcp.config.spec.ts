import {
  getApiTokenMaxTtlDays,
  getMcpRateLimitPerMinute,
  isMcpEnabled,
} from './mcp.config';

describe('mcp.config', () => {
  describe('isMcpEnabled', () => {
    it.each([undefined, '', 'false', '0', 'yes', '1', 'on', 'enabled'])(
      'is off for %p',
      (value) => {
        expect(isMcpEnabled({ MCP_ENABLED: value })).toBe(false);
      },
    );

    it.each(['true', 'TRUE', ' true '])('is on for %p', (value) => {
      expect(isMcpEnabled({ MCP_ENABLED: value })).toBe(true);
    });
  });

  describe('getApiTokenMaxTtlDays', () => {
    it('defaults to 365', () => {
      expect(getApiTokenMaxTtlDays({})).toBe(365);
    });

    it('reads a valid value', () => {
      expect(getApiTokenMaxTtlDays({ API_TOKEN_MAX_TTL_DAYS: '30' })).toBe(30);
    });

    it.each(['0', '-1', 'abc', '3651', '1.5'])('rejects %p', (value) => {
      expect(() =>
        getApiTokenMaxTtlDays({ API_TOKEN_MAX_TTL_DAYS: value }),
      ).toThrow(/API_TOKEN_MAX_TTL_DAYS/);
    });
  });

  describe('getMcpRateLimitPerMinute', () => {
    it('defaults to 60', () => {
      expect(getMcpRateLimitPerMinute({})).toBe(60);
    });

    it('reads a valid value', () => {
      expect(getMcpRateLimitPerMinute({ MCP_RATE_LIMIT_PER_MIN: '10' })).toBe(
        10,
      );
    });

    it.each(['0', 'x', '100001'])('rejects %p', (value) => {
      expect(() =>
        getMcpRateLimitPerMinute({ MCP_RATE_LIMIT_PER_MIN: value }),
      ).toThrow(/MCP_RATE_LIMIT_PER_MIN/);
    });
  });
});
