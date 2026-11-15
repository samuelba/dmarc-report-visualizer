import {
  AUTH_FAILURE_LIMIT,
  AUTH_LOCK_MS,
  ApiTokenRateLimiterService,
} from './api-token-rate-limiter.service';

describe('ApiTokenRateLimiterService', () => {
  const T0 = 1_000_000;

  beforeEach(() => {
    process.env.MCP_RATE_LIMIT_PER_MIN = '3';
  });

  afterEach(() => {
    delete process.env.MCP_RATE_LIMIT_PER_MIN;
  });

  describe('failed authentication', () => {
    it('locks an IP after too many failures', () => {
      const limiter = new ApiTokenRateLimiterService();

      for (let i = 0; i < AUTH_FAILURE_LIMIT - 1; i++) {
        limiter.recordAuthFailure('1.2.3.4', T0);
      }
      expect(limiter.checkAuthAllowed('1.2.3.4', T0).allowed).toBe(true);

      limiter.recordAuthFailure('1.2.3.4', T0);
      expect(limiter.checkAuthAllowed('1.2.3.4', T0)).toEqual({
        allowed: false,
        retryAfter: AUTH_LOCK_MS / 1000,
      });
      expect(limiter.checkAuthAllowed('5.6.7.8', T0).allowed).toBe(true);
    });

    it('unlocks after the lock duration', () => {
      const limiter = new ApiTokenRateLimiterService();
      for (let i = 0; i < AUTH_FAILURE_LIMIT; i++) {
        limiter.recordAuthFailure('1.2.3.4', T0);
      }

      expect(
        limiter.checkAuthAllowed('1.2.3.4', T0 + AUTH_LOCK_MS).allowed,
      ).toBe(true);
    });
  });

  describe('request quota', () => {
    it('allows the configured number of requests per minute per token', () => {
      const limiter = new ApiTokenRateLimiterService();

      expect(limiter.consumeRequest('t1', T0).allowed).toBe(true);
      expect(limiter.consumeRequest('t1', T0).allowed).toBe(true);
      expect(limiter.consumeRequest('t1', T0).allowed).toBe(true);
      expect(limiter.consumeRequest('t1', T0 + 20_000)).toEqual({
        allowed: false,
        retryAfter: 40,
      });
      expect(limiter.consumeRequest('t2', T0).allowed).toBe(true);
    });

    it('resets after the window', () => {
      const limiter = new ApiTokenRateLimiterService();
      for (let i = 0; i < 3; i++) {
        limiter.consumeRequest('t1', T0);
      }

      expect(limiter.consumeRequest('t1', T0 + 60_000).allowed).toBe(true);
    });
  });
});
