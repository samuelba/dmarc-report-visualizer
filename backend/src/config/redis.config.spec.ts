import { isRedisConfigured } from './redis.config';

describe('isRedisConfigured', () => {
  it('returns false when host is undefined', () => {
    expect(isRedisConfigured(undefined)).toBe(false);
  });

  it('returns false when host is empty or whitespace', () => {
    expect(isRedisConfigured('')).toBe(false);
    expect(isRedisConfigured('   ')).toBe(false);
  });

  it('returns true when a host is set', () => {
    expect(isRedisConfigured('redis')).toBe(true);
    expect(isRedisConfigured('127.0.0.1')).toBe(true);
  });
});
