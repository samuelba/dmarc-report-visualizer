import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RateLimitEntry {
  attempts: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

@Injectable()
export class RateLimiterService {
  private readonly ipAttempts = new Map<string, RateLimitEntry>();
  private readonly accountAttempts = new Map<string, RateLimitEntry>();

  // Configuration constants from environment
  private readonly IP_MAX_ATTEMPTS: number;
  private readonly IP_WINDOW_MS: number;
  private readonly ACCOUNT_MAX_ATTEMPTS: number;
  private readonly ACCOUNT_WINDOW_MS: number;
  private readonly LOCK_DURATION_MS: number;

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
  async checkIpRateLimit(
    ip: string,
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    const now = Date.now();
    const entry = this.ipAttempts.get(ip);

    if (!entry) {
      return { allowed: true };
    }

    // Check if locked
    if (entry.lockedUntil && entry.lockedUntil > now) {
      const retryAfter = Math.ceil((entry.lockedUntil - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // Check if window has expired
    if (now - entry.firstAttemptAt > this.IP_WINDOW_MS) {
      // Window expired, clean up
      this.ipAttempts.delete(ip);
      return { allowed: true };
    }

    // Check if attempts exceeded
    if (entry.attempts >= this.IP_MAX_ATTEMPTS) {
      // Lock the IP
      entry.lockedUntil = now + this.LOCK_DURATION_MS;
      const retryAfter = Math.ceil(this.LOCK_DURATION_MS / 1000);
      return { allowed: false, retryAfter };
    }

    return { allowed: true };
  }

  /**
   * Check if an account is locked due to failed attempts
   * @param email - The email address to check
   * @returns Object with locked status and optional retryAfter in seconds
   */
  async checkAccountLock(
    email: string,
  ): Promise<{ locked: boolean; retryAfter?: number }> {
    const now = Date.now();
    const entry = this.accountAttempts.get(email.toLowerCase());

    if (!entry) {
      return { locked: false };
    }

    // Check if locked
    if (entry.lockedUntil && entry.lockedUntil > now) {
      const retryAfter = Math.ceil((entry.lockedUntil - now) / 1000);
      return { locked: true, retryAfter };
    }

    // Check if window has expired
    if (now - entry.firstAttemptAt > this.ACCOUNT_WINDOW_MS) {
      // Window expired, clean up
      this.accountAttempts.delete(email.toLowerCase());
      return { locked: false };
    }

    // Check if attempts exceeded
    if (entry.attempts >= this.ACCOUNT_MAX_ATTEMPTS) {
      // Lock the account
      entry.lockedUntil = now + this.LOCK_DURATION_MS;
      const retryAfter = Math.ceil(this.LOCK_DURATION_MS / 1000);
      return { locked: true, retryAfter };
    }

    return { locked: false };
  }

  /**
   * Record a failed login attempt for both IP and account
   * @param ip - The IP address
   * @param email - The email address
   */
  async recordFailedAttempt(ip: string, email: string): Promise<void> {
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
  }

  /**
   * Reset attempts for an account after successful login
   * @param email - The email address
   */
  async resetAttempts(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase();
    this.accountAttempts.delete(normalizedEmail);
  }

  /**
   * Clear all rate limit data (useful for testing)
   */
  clearAll(): void {
    this.ipAttempts.clear();
    this.accountAttempts.clear();
  }
}
