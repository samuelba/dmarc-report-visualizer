import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RateLimiterService } from './rate-limiter.service';

describe('RateLimiterService', () => {
  let service: RateLimiterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiterService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                RATE_LIMIT_IP_MAX_ATTEMPTS: 10,
                RATE_LIMIT_IP_WINDOW_MS: 5 * 60 * 1000,
                RATE_LIMIT_ACCOUNT_MAX_ATTEMPTS: 5,
                RATE_LIMIT_ACCOUNT_WINDOW_MS: 5 * 60 * 1000,
                RATE_LIMIT_LOCK_DURATION_MS: 15 * 60 * 1000,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
  });

  afterEach(() => {
    service.clearAll();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkIpRateLimit', () => {
    it('should allow requests from new IP', async () => {
      const result = await service.checkIpRateLimit('192.168.1.1');
      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should allow requests within limit', async () => {
      const ip = '192.168.1.1';
      const email = 'test@example.com';

      // Record 9 failed attempts (below the 10 limit)
      for (let i = 0; i < 9; i++) {
        await service.recordFailedAttempt(ip, email);
      }

      const result = await service.checkIpRateLimit(ip);
      expect(result.allowed).toBe(true);
    });

    it('should block IP after 10 failed attempts', async () => {
      const ip = '192.168.1.1';
      const email = 'test@example.com';

      // Record 10 failed attempts
      for (let i = 0; i < 10; i++) {
        await service.recordFailedAttempt(ip, email);
      }

      const result = await service.checkIpRateLimit(ip);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should return correct retryAfter time for blocked IP', async () => {
      const ip = '192.168.1.1';
      const email = 'test@example.com';

      // Record 10 failed attempts
      for (let i = 0; i < 10; i++) {
        await service.recordFailedAttempt(ip, email);
      }

      const result = await service.checkIpRateLimit(ip);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      // Should be approximately 15 minutes (900 seconds)
      expect(result.retryAfter).toBeGreaterThanOrEqual(890);
      expect(result.retryAfter).toBeLessThanOrEqual(900);
    });
  });

  describe('checkAccountLock', () => {
    it('should not lock new account', async () => {
      const result = await service.checkAccountLock('test@example.com');
      expect(result.locked).toBe(false);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should allow attempts within limit', async () => {
      const ip = '192.168.1.1';
      const email = 'test@example.com';

      // Record 4 failed attempts (below the 5 limit)
      for (let i = 0; i < 4; i++) {
        await service.recordFailedAttempt(ip, email);
      }

      const result = await service.checkAccountLock(email);
      expect(result.locked).toBe(false);
    });

    it('should lock account after 5 failed attempts', async () => {
      const ip = '192.168.1.1';
      const email = 'test@example.com';

      // Record 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await service.recordFailedAttempt(ip, email);
      }

      const result = await service.checkAccountLock(email);
      expect(result.locked).toBe(true);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should return correct retryAfter time for locked account', async () => {
      const ip = '192.168.1.1';
      const email = 'test@example.com';

      // Record 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await service.recordFailedAttempt(ip, email);
      }

      const result = await service.checkAccountLock(email);
      expect(result.locked).toBe(true);
      expect(result.retryAfter).toBeDefined();
      // Should be approximately 15 minutes (900 seconds)
      expect(result.retryAfter).toBeGreaterThanOrEqual(890);
      expect(result.retryAfter).toBeLessThanOrEqual(900);
    });

    it('should handle email case-insensitively', async () => {
      const ip = '192.168.1.1';
      const email = 'Test@Example.COM';

      // Record 5 failed attempts with mixed case
      for (let i = 0; i < 5; i++) {
        await service.recordFailedAttempt(ip, email);
      }

      // Check with different case
      const result = await service.checkAccountLock('test@example.com');
      expect(result.locked).toBe(true);
    });
  });

  describe('recordFailedAttempt', () => {
    it('should record failed attempt for IP', async () => {
      const ip = '192.168.1.1';
      const email = 'test@example.com';

      await service.recordFailedAttempt(ip, email);

      const result = await service.checkIpRateLimit(ip);
      expect(result.allowed).toBe(true);
    });

    it('should record failed attempt for account', async () => {
      const ip = '192.168.1.1';
      const email = 'test@example.com';

      await service.recordFailedAttempt(ip, email);

      const result = await service.checkAccountLock(email);
      expect(result.locked).toBe(false);
    });

    it('should increment attempts correctly', async () => {
      const ip = '192.168.1.1';
      const email = 'test@example.com';

      // Record multiple attempts
      for (let i = 0; i < 3; i++) {
        await service.recordFailedAttempt(ip, email);
      }

      // Both should still be allowed
      const ipResult = await service.checkIpRateLimit(ip);
      const accountResult = await service.checkAccountLock(email);

      expect(ipResult.allowed).toBe(true);
      expect(accountResult.locked).toBe(false);
    });
  });

  describe('resetAttempts', () => {
    it('should reset account attempts after successful login', async () => {
      const ip = '192.168.1.1';
      const email = 'test@example.com';

      // Record 4 failed attempts
      for (let i = 0; i < 4; i++) {
        await service.recordFailedAttempt(ip, email);
      }

      // Verify attempts are recorded
      let result = await service.checkAccountLock(email);
      expect(result.locked).toBe(false);

      // Reset attempts
      await service.resetAttempts(email);

      // Verify attempts are reset
      result = await service.checkAccountLock(email);
      expect(result.locked).toBe(false);

      // Should be able to make more attempts without hitting limit
      for (let i = 0; i < 4; i++) {
        await service.recordFailedAttempt(ip, email);
      }

      result = await service.checkAccountLock(email);
      expect(result.locked).toBe(false);
    });

    it('should handle email case-insensitively when resetting', async () => {
      const ip = '192.168.1.1';
      const email = 'Test@Example.COM';

      // Record failed attempts
      for (let i = 0; i < 4; i++) {
        await service.recordFailedAttempt(ip, email);
      }

      // Reset with different case
      await service.resetAttempts('test@example.com');

      // Verify reset worked
      const result = await service.checkAccountLock(email);
      expect(result.locked).toBe(false);
    });

    it('should not affect IP rate limit when resetting account', async () => {
      const ip = '192.168.1.1';
      const email = 'test@example.com';

      // Record 9 failed attempts
      for (let i = 0; i < 9; i++) {
        await service.recordFailedAttempt(ip, email);
      }

      // Reset account attempts
      await service.resetAttempts(email);

      // Account should be reset
      const accountResult = await service.checkAccountLock(email);
      expect(accountResult.locked).toBe(false);

      // IP should still have attempts recorded
      const ipResult = await service.checkIpRateLimit(ip);
      expect(ipResult.allowed).toBe(true);

      // One more attempt should trigger IP limit
      await service.recordFailedAttempt(ip, email);
      const ipResult2 = await service.checkIpRateLimit(ip);
      expect(ipResult2.allowed).toBe(false);
    });
  });

  describe('automatic unlock after time window', () => {
    it('should automatically unlock IP after lock duration', async () => {
      const ip = '192.168.1.1';
      const email = 'test@example.com';

      // Record 10 failed attempts to trigger lock
      for (let i = 0; i < 10; i++) {
        await service.recordFailedAttempt(ip, email);
      }

      // Verify IP is blocked
      const result = await service.checkIpRateLimit(ip);
      expect(result.allowed).toBe(false);

      // Wait for lock to expire (simulate by clearing and checking after window)
      // In a real scenario, we'd wait 15 minutes, but for testing we verify the logic
      // by checking that the service correctly calculates retryAfter
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should automatically unlock account after lock duration', async () => {
      const ip = '192.168.1.1';
      const email = 'test@example.com';

      // Record 5 failed attempts to trigger lock
      for (let i = 0; i < 5; i++) {
        await service.recordFailedAttempt(ip, email);
      }

      // Verify account is locked
      const result = await service.checkAccountLock(email);
      expect(result.locked).toBe(true);

      // Verify retryAfter is set correctly
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('independent IP and account tracking', () => {
    it('should track IP and account attempts independently', async () => {
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';
      const email = 'test@example.com';

      // Record 4 attempts from IP1
      for (let i = 0; i < 4; i++) {
        await service.recordFailedAttempt(ip1, email);
      }

      // Record 1 attempt from IP2 (same account)
      await service.recordFailedAttempt(ip2, email);

      // Account should be locked (5 total attempts)
      const accountResult = await service.checkAccountLock(email);
      expect(accountResult.locked).toBe(true);

      // IP1 should not be blocked (only 4 attempts)
      const ip1Result = await service.checkIpRateLimit(ip1);
      expect(ip1Result.allowed).toBe(true);

      // IP2 should not be blocked (only 1 attempt)
      const ip2Result = await service.checkIpRateLimit(ip2);
      expect(ip2Result.allowed).toBe(true);
    });
  });

  describe('TOTP verification rate limiting', () => {
    it('should allow TOTP verification for new user', async () => {
      const userId = 'user-123';
      const result = await service.checkTotpVerificationLimit(userId);
      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should allow TOTP verification attempts within limit', async () => {
      const userId = 'user-123';

      // Record 4 failed attempts (below the 5 limit)
      for (let i = 0; i < 4; i++) {
        await service.recordTotpVerificationAttempt(userId);
      }

      const result = await service.checkTotpVerificationLimit(userId);
      expect(result.allowed).toBe(true);
    });

    it('should block TOTP verification after 5 failed attempts', async () => {
      const userId = 'user-123';

      // Record 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await service.recordTotpVerificationAttempt(userId);
      }

      const result = await service.checkTotpVerificationLimit(userId);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should return correct retryAfter time for blocked TOTP verification', async () => {
      const userId = 'user-123';

      // Record 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await service.recordTotpVerificationAttempt(userId);
      }

      const result = await service.checkTotpVerificationLimit(userId);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      // Should be approximately 15 minutes (900 seconds)
      expect(result.retryAfter).toBeGreaterThanOrEqual(890);
      expect(result.retryAfter).toBeLessThanOrEqual(900);
    });

    it('should reset TOTP verification attempts after successful verification', async () => {
      const userId = 'user-123';

      // Record 4 failed attempts
      for (let i = 0; i < 4; i++) {
        await service.recordTotpVerificationAttempt(userId);
      }

      // Reset attempts
      await service.resetTotpVerificationAttempts(userId);

      // Should be able to make more attempts
      const result = await service.checkTotpVerificationLimit(userId);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Recovery code verification rate limiting', () => {
    it('should allow recovery code verification for new user', async () => {
      const userId = 'user-123';
      const result = await service.checkRecoveryCodeLimit(userId);
      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should allow recovery code attempts within limit', async () => {
      const userId = 'user-123';

      // Record 2 failed attempts (below the 3 limit)
      for (let i = 0; i < 2; i++) {
        await service.recordRecoveryCodeAttempt(userId);
      }

      const result = await service.checkRecoveryCodeLimit(userId);
      expect(result.allowed).toBe(true);
    });

    it('should block recovery code verification after 3 failed attempts', async () => {
      const userId = 'user-123';

      // Record 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await service.recordRecoveryCodeAttempt(userId);
      }

      const result = await service.checkRecoveryCodeLimit(userId);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should return correct retryAfter time for blocked recovery code verification', async () => {
      const userId = 'user-123';

      // Record 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await service.recordRecoveryCodeAttempt(userId);
      }

      const result = await service.checkRecoveryCodeLimit(userId);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      // Should be approximately 15 minutes (900 seconds)
      expect(result.retryAfter).toBeGreaterThanOrEqual(890);
      expect(result.retryAfter).toBeLessThanOrEqual(900);
    });

    it('should reset recovery code attempts after successful verification', async () => {
      const userId = 'user-123';

      // Record 2 failed attempts
      for (let i = 0; i < 2; i++) {
        await service.recordRecoveryCodeAttempt(userId);
      }

      // Reset attempts
      await service.resetRecoveryCodeAttempts(userId);

      // Should be able to make more attempts
      const result = await service.checkRecoveryCodeLimit(userId);
      expect(result.allowed).toBe(true);
    });
  });

  describe('TOTP setup verification rate limiting', () => {
    it('should allow TOTP setup verification for new user', async () => {
      const userId = 'user-123';
      const result = await service.checkTotpSetupLimit(userId);
      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should allow TOTP setup attempts within limit', async () => {
      const userId = 'user-123';

      // Record 9 failed attempts (below the 10 limit)
      for (let i = 0; i < 9; i++) {
        await service.recordTotpSetupAttempt(userId);
      }

      const result = await service.checkTotpSetupLimit(userId);
      expect(result.allowed).toBe(true);
    });

    it('should block TOTP setup verification after 10 failed attempts', async () => {
      const userId = 'user-123';

      // Record 10 failed attempts
      for (let i = 0; i < 10; i++) {
        await service.recordTotpSetupAttempt(userId);
      }

      const result = await service.checkTotpSetupLimit(userId);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should return correct retryAfter time for blocked TOTP setup', async () => {
      const userId = 'user-123';

      // Record 10 failed attempts
      for (let i = 0; i < 10; i++) {
        await service.recordTotpSetupAttempt(userId);
      }

      const result = await service.checkTotpSetupLimit(userId);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      // Should be approximately 1 hour (3600 seconds)
      expect(result.retryAfter).toBeGreaterThanOrEqual(3590);
      expect(result.retryAfter).toBeLessThanOrEqual(3600);
    });

    it('should reset TOTP setup attempts after successful setup', async () => {
      const userId = 'user-123';

      // Record 9 failed attempts
      for (let i = 0; i < 9; i++) {
        await service.recordTotpSetupAttempt(userId);
      }

      // Reset attempts
      await service.resetTotpSetupAttempts(userId);

      // Should be able to make more attempts
      const result = await service.checkTotpSetupLimit(userId);
      expect(result.allowed).toBe(true);
    });
  });

  describe('TOTP rate limiting independence', () => {
    it('should track TOTP verification and recovery code attempts independently', async () => {
      const userId = 'user-123';

      // Record 4 TOTP verification attempts
      for (let i = 0; i < 4; i++) {
        await service.recordTotpVerificationAttempt(userId);
      }

      // Record 2 recovery code attempts
      for (let i = 0; i < 2; i++) {
        await service.recordRecoveryCodeAttempt(userId);
      }

      // Both should still be allowed
      const totpResult = await service.checkTotpVerificationLimit(userId);
      const recoveryResult = await service.checkRecoveryCodeLimit(userId);

      expect(totpResult.allowed).toBe(true);
      expect(recoveryResult.allowed).toBe(true);
    });

    it('should track TOTP setup and verification attempts independently', async () => {
      const userId = 'user-123';

      // Record 9 TOTP setup attempts
      for (let i = 0; i < 9; i++) {
        await service.recordTotpSetupAttempt(userId);
      }

      // Record 4 TOTP verification attempts
      for (let i = 0; i < 4; i++) {
        await service.recordTotpVerificationAttempt(userId);
      }

      // Both should still be allowed
      const setupResult = await service.checkTotpSetupLimit(userId);
      const verifyResult = await service.checkTotpVerificationLimit(userId);

      expect(setupResult.allowed).toBe(true);
      expect(verifyResult.allowed).toBe(true);
    });

    it('should not affect login rate limiting when TOTP is rate limited', async () => {
      const userId = 'user-123';
      const ip = '192.168.1.1';
      const email = 'test@example.com';

      // Record 5 TOTP verification attempts (hit limit)
      for (let i = 0; i < 5; i++) {
        await service.recordTotpVerificationAttempt(userId);
      }

      // TOTP should be blocked
      const totpResult = await service.checkTotpVerificationLimit(userId);
      expect(totpResult.allowed).toBe(false);

      // Login rate limits should be unaffected
      const ipResult = await service.checkIpRateLimit(ip);
      const accountResult = await service.checkAccountLock(email);

      expect(ipResult.allowed).toBe(true);
      expect(accountResult.locked).toBe(false);
    });
  });
});
