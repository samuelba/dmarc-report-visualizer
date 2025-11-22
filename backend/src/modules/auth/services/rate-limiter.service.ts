import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RateLimitEntry {
  attempts: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly ipAttempts = new Map<string, RateLimitEntry>();
  private readonly accountAttempts = new Map<string, RateLimitEntry>();
  private readonly totpVerificationAttempts = new Map<string, RateLimitEntry>();
  private readonly recoveryCodeAttempts = new Map<string, RateLimitEntry>();
  private readonly totpSetupAttempts = new Map<string, RateLimitEntry>();

  // Configuration constants from environment
  private readonly IP_MAX_ATTEMPTS: number;
  private readonly IP_WINDOW_MS: number;
  private readonly ACCOUNT_MAX_ATTEMPTS: number;
  private readonly ACCOUNT_WINDOW_MS: number;
  private readonly LOCK_DURATION_MS: number;

  // TOTP rate limiting constants
  private readonly TOTP_VERIFY_MAX_ATTEMPTS = 5;
  private readonly TOTP_VERIFY_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private readonly RECOVERY_CODE_MAX_ATTEMPTS = 3;
  private readonly RECOVERY_CODE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private readonly TOTP_SETUP_MAX_ATTEMPTS = 10;
  private readonly TOTP_SETUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

  constructor(private readonly configService: ConfigService) {
    this.IP_MAX_ATTEMPTS = parseInt(
      this.configService.get<string>('RATE_LIMIT_IP_MAX_ATTEMPTS', '10'),
      10,
    );
    this.IP_WINDOW_MS = parseInt(
      this.configService.get<string>(
        'RATE_LIMIT_IP_WINDOW_MS',
        String(5 * 60 * 1000),
      ),
      10,
    );
    this.ACCOUNT_MAX_ATTEMPTS = parseInt(
      this.configService.get<string>('RATE_LIMIT_ACCOUNT_MAX_ATTEMPTS', '5'),
      10,
    );
    this.ACCOUNT_WINDOW_MS = parseInt(
      this.configService.get<string>(
        'RATE_LIMIT_ACCOUNT_WINDOW_MS',
        String(5 * 60 * 1000),
      ),
      10,
    );
    this.LOCK_DURATION_MS = parseInt(
      this.configService.get<string>(
        'RATE_LIMIT_LOCK_DURATION_MS',
        String(15 * 60 * 1000),
      ),
      10,
    );
  }

  /**
   * Check if an IP address has exceeded the rate limit
   * @param ip - The IP address to check
   * @returns Object with allowed status and optional retryAfter in seconds
   */
  checkIpRateLimit(
    ip: string,
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    const now = Date.now();
    const entry = this.ipAttempts.get(ip);

    if (!entry) {
      return Promise.resolve({ allowed: true });
    }

    // Check if locked
    if (entry.lockedUntil && entry.lockedUntil > now) {
      const retryAfter = Math.ceil((entry.lockedUntil - now) / 1000);
      return Promise.resolve({ allowed: false, retryAfter });
    }

    // Check if window has expired
    if (now - entry.firstAttemptAt > this.IP_WINDOW_MS) {
      // Window expired, clean up
      this.ipAttempts.delete(ip);
      return Promise.resolve({ allowed: true });
    }

    // Check if attempts exceeded
    if (entry.attempts >= this.IP_MAX_ATTEMPTS) {
      // Lock the IP
      entry.lockedUntil = now + this.LOCK_DURATION_MS;
      const retryAfter = Math.ceil(this.LOCK_DURATION_MS / 1000);

      // Audit log: IP rate limit violation
      this.logger.warn('Rate limit violation detected', {
        event: 'rate_limit_violation',
        type: 'ip_login',
        ipAddress: ip,
        attempts: entry.attempts,
        timestamp: new Date().toISOString(),
      });

      return Promise.resolve({ allowed: false, retryAfter });
    }

    return Promise.resolve({ allowed: true });
  }

  /**
   * Check if an account is locked due to failed attempts
   * @param email - The email address to check
   * @returns Object with locked status and optional retryAfter in seconds
   */
  checkAccountLock(
    email: string,
  ): Promise<{ locked: boolean; retryAfter?: number }> {
    const now = Date.now();
    const entry = this.accountAttempts.get(email.toLowerCase());

    if (!entry) {
      return Promise.resolve({ locked: false });
    }

    // Check if locked
    if (entry.lockedUntil && entry.lockedUntil > now) {
      const retryAfter = Math.ceil((entry.lockedUntil - now) / 1000);
      return Promise.resolve({ locked: true, retryAfter });
    }

    // Check if window has expired
    if (now - entry.firstAttemptAt > this.ACCOUNT_WINDOW_MS) {
      // Window expired, clean up
      this.accountAttempts.delete(email.toLowerCase());
      return Promise.resolve({ locked: false });
    }

    // Check if attempts exceeded
    if (entry.attempts >= this.ACCOUNT_MAX_ATTEMPTS) {
      // Lock the account
      entry.lockedUntil = now + this.LOCK_DURATION_MS;
      const retryAfter = Math.ceil(this.LOCK_DURATION_MS / 1000);

      // Audit log: Account rate limit violation
      this.logger.warn('Rate limit violation detected', {
        event: 'rate_limit_violation',
        type: 'account_login',
        email: email.toLowerCase(),
        attempts: entry.attempts,
        timestamp: new Date().toISOString(),
      });

      return Promise.resolve({ locked: true, retryAfter });
    }

    return Promise.resolve({ locked: false });
  }

  /**
   * Record a failed login attempt for both IP and account
   * @param ip - The IP address
   * @param email - The email address
   */
  recordFailedAttempt(ip: string, email: string): Promise<void> {
    const now = Date.now();
    const normalizedEmail = email.toLowerCase();

    // Record IP attempt
    const ipEntry = this.ipAttempts.get(ip);
    if (!ipEntry || now - ipEntry.firstAttemptAt > this.IP_WINDOW_MS) {
      // Start new window
      this.ipAttempts.set(ip, {
        attempts: 1,
        firstAttemptAt: now,
      });
    } else {
      // Increment attempts in current window
      ipEntry.attempts++;
    }

    // Record account attempt
    const accountEntry = this.accountAttempts.get(normalizedEmail);
    if (
      !accountEntry ||
      now - accountEntry.firstAttemptAt > this.ACCOUNT_WINDOW_MS
    ) {
      // Start new window
      this.accountAttempts.set(normalizedEmail, {
        attempts: 1,
        firstAttemptAt: now,
      });
    } else {
      // Increment attempts in current window
      accountEntry.attempts++;
    }
    return Promise.resolve();
  }

  /**
   * Reset attempts for an account after successful login
   * @param email - The email address
   */
  resetAttempts(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase();
    this.accountAttempts.delete(normalizedEmail);
    return Promise.resolve();
  }

  /**
   * Check if TOTP verification is rate limited for a user
   * @param userId - The user ID
   * @returns Object with allowed status and optional retryAfter in seconds
   */
  checkTotpVerificationLimit(
    userId: string,
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    const result = this.checkRateLimit(
      this.totpVerificationAttempts,
      userId,
      this.TOTP_VERIFY_MAX_ATTEMPTS,
      this.TOTP_VERIFY_WINDOW_MS,
    );

    // Audit log if rate limit exceeded
    if (!result.allowed) {
      const entry = this.totpVerificationAttempts.get(userId);
      this.logger.warn('Rate limit violation detected', {
        event: 'rate_limit_violation',
        type: 'totp_verification',
        userId,
        attempts: entry?.attempts || 0,
        timestamp: new Date().toISOString(),
      });
    }

    return Promise.resolve(result);
  }

  /**
   * Record a failed TOTP verification attempt
   * @param userId - The user ID
   */
  recordTotpVerificationAttempt(userId: string): Promise<void> {
    this.recordAttempt(
      this.totpVerificationAttempts,
      userId,
      this.TOTP_VERIFY_WINDOW_MS,
    );
    return Promise.resolve();
  }

  /**
   * Reset TOTP verification attempts for a user
   * @param userId - The user ID
   */
  resetTotpVerificationAttempts(userId: string): Promise<void> {
    this.totpVerificationAttempts.delete(userId);
    return Promise.resolve();
  }

  /**
   * Check if recovery code verification is rate limited for a user
   * @param userId - The user ID
   * @returns Object with allowed status and optional retryAfter in seconds
   */
  checkRecoveryCodeLimit(
    userId: string,
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    const result = this.checkRateLimit(
      this.recoveryCodeAttempts,
      userId,
      this.RECOVERY_CODE_MAX_ATTEMPTS,
      this.RECOVERY_CODE_WINDOW_MS,
    );

    // Audit log if rate limit exceeded
    if (!result.allowed) {
      const entry = this.recoveryCodeAttempts.get(userId);
      this.logger.warn('Rate limit violation detected', {
        event: 'rate_limit_violation',
        type: 'recovery_code_verification',
        userId,
        attempts: entry?.attempts || 0,
        timestamp: new Date().toISOString(),
      });
    }

    return Promise.resolve(result);
  }

  /**
   * Record a failed recovery code verification attempt
   * @param userId - The user ID
   */
  recordRecoveryCodeAttempt(userId: string): Promise<void> {
    this.recordAttempt(
      this.recoveryCodeAttempts,
      userId,
      this.RECOVERY_CODE_WINDOW_MS,
    );
    return Promise.resolve();
  }

  /**
   * Reset recovery code verification attempts for a user
   * @param userId - The user ID
   */
  resetRecoveryCodeAttempts(userId: string): Promise<void> {
    this.recoveryCodeAttempts.delete(userId);
    return Promise.resolve();
  }

  /**
   * Check if TOTP setup verification is rate limited for a user
   * @param userId - The user ID
   * @returns Object with allowed status and optional retryAfter in seconds
   */
  checkTotpSetupLimit(
    userId: string,
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    const result = this.checkRateLimit(
      this.totpSetupAttempts,
      userId,
      this.TOTP_SETUP_MAX_ATTEMPTS,
      this.TOTP_SETUP_WINDOW_MS,
    );

    // Audit log if rate limit exceeded
    if (!result.allowed) {
      const entry = this.totpSetupAttempts.get(userId);
      this.logger.warn('Rate limit violation detected', {
        event: 'rate_limit_violation',
        type: 'totp_setup',
        userId,
        attempts: entry?.attempts || 0,
        timestamp: new Date().toISOString(),
      });
    }

    return Promise.resolve(result);
  }

  /**
   * Record a failed TOTP setup verification attempt
   * @param userId - The user ID
   */
  recordTotpSetupAttempt(userId: string): Promise<void> {
    this.recordAttempt(
      this.totpSetupAttempts,
      userId,
      this.TOTP_SETUP_WINDOW_MS,
    );
    return Promise.resolve();
  }

  /**
   * Reset TOTP setup verification attempts for a user
   * @param userId - The user ID
   */
  resetTotpSetupAttempts(userId: string): Promise<void> {
    this.totpSetupAttempts.delete(userId);
    return Promise.resolve();
  }

  /**
   * Generic rate limit checker
   * @param store - The Map to check
   * @param key - The key to check
   * @param maxAttempts - Maximum allowed attempts
   * @param windowMs - Time window in milliseconds
   * @returns Object with allowed status and optional retryAfter in seconds
   */
  private checkRateLimit(
    store: Map<string, RateLimitEntry>,
    key: string,
    maxAttempts: number,
    windowMs: number,
  ): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const entry = store.get(key);

    if (!entry) {
      return { allowed: true };
    }

    // Check if window has expired
    if (now - entry.firstAttemptAt > windowMs) {
      // Window expired, clean up
      store.delete(key);
      return { allowed: true };
    }

    // Check if attempts exceeded
    if (entry.attempts >= maxAttempts) {
      const windowEnd = entry.firstAttemptAt + windowMs;
      const retryAfter = Math.ceil((windowEnd - now) / 1000);
      return { allowed: false, retryAfter };
    }

    return { allowed: true };
  }

  /**
   * Generic attempt recorder
   * @param store - The Map to record in
   * @param key - The key to record
   * @param windowMs - Time window in milliseconds
   */
  private recordAttempt(
    store: Map<string, RateLimitEntry>,
    key: string,
    windowMs: number,
  ): void {
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now - entry.firstAttemptAt > windowMs) {
      // Start new window
      store.set(key, {
        attempts: 1,
        firstAttemptAt: now,
      });
    } else {
      // Increment attempts in current window
      entry.attempts++;
    }
  }

  /**
   * Clear all rate limit data (useful for testing)
   */
  clearAll(): void {
    this.ipAttempts.clear();
    this.accountAttempts.clear();
    this.totpVerificationAttempts.clear();
    this.recoveryCodeAttempts.clear();
    this.totpSetupAttempts.clear();
  }
}
