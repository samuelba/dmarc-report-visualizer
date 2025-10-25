import { Logger } from '@nestjs/common';

export interface RateLimiterConfig {
  requestsPerMinute?: number;
  requestsPerDay?: number;
  requestsPerMonth?: number;
}

export class RateLimiter {
  private readonly logger = new Logger(RateLimiter.name);
  private minuteRequests: number[] = [];
  private dailyRequests: number[] = [];
  private monthlyRequests: number[] = [];
  private readonly config: RateLimiterConfig;
  private readonly name: string;

  constructor(name: string, config: RateLimiterConfig) {
    this.name = name;
    this.config = config;
  }

  /**
   * Check if a request can be made without exceeding rate limits
   * @returns true if request is allowed, false if rate limited
   */
  canMakeRequest(): boolean {
    const now = Date.now();
    this.cleanupOldRequests(now);

    if (
      this.config.requestsPerMinute &&
      this.minuteRequests.length >= this.config.requestsPerMinute
    ) {
      this.logger.warn(
        `${this.name}: Rate limit reached (${this.config.requestsPerMinute}/min)`,
      );
      return false;
    }

    if (
      this.config.requestsPerDay &&
      this.dailyRequests.length >= this.config.requestsPerDay
    ) {
      this.logger.warn(
        `${this.name}: Daily rate limit reached (${this.config.requestsPerDay}/day)`,
      );
      return false;
    }

    if (
      this.config.requestsPerMonth &&
      this.monthlyRequests.length >= this.config.requestsPerMonth
    ) {
      this.logger.warn(
        `${this.name}: Monthly rate limit reached (${this.config.requestsPerMonth}/month)`,
      );
      return false;
    }

    return true;
  }

  /**
   * Record that a request was made
   */
  recordRequest(): void {
    const now = Date.now();
    this.minuteRequests.push(now);
    this.dailyRequests.push(now);
    this.monthlyRequests.push(now);
  }

  /**
   * Wait until a request can be made
   * @param maxWaitMs - Maximum time to wait in milliseconds
   * @returns true if can proceed, false if timeout
   */
  async waitForSlot(maxWaitMs: number = 60000): Promise<boolean> {
    const startTime = Date.now();

    while (!this.canMakeRequest()) {
      if (Date.now() - startTime > maxWaitMs) {
        return false;
      }

      // Wait 1 second before checking again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return true;
  }

  /**
   * Get the time until the next available slot
   * @returns milliseconds until next slot, or 0 if immediately available
   */
  getTimeUntilNextSlot(): number {
    const now = Date.now();
    this.cleanupOldRequests(now);

    if (this.canMakeRequest()) {
      return 0;
    }

    // Check minute limit
    if (
      this.config.requestsPerMinute &&
      this.minuteRequests.length >= this.config.requestsPerMinute
    ) {
      const oldestMinuteRequest = this.minuteRequests[0];
      return Math.max(0, oldestMinuteRequest + 60 * 1000 - now);
    }

    // Check daily limit
    if (
      this.config.requestsPerDay &&
      this.dailyRequests.length >= this.config.requestsPerDay
    ) {
      const oldestDailyRequest = this.dailyRequests[0];
      return Math.max(0, oldestDailyRequest + 24 * 60 * 60 * 1000 - now);
    }

    // Check monthly limit
    if (
      this.config.requestsPerMonth &&
      this.monthlyRequests.length >= this.config.requestsPerMonth
    ) {
      const oldestMonthlyRequest = this.monthlyRequests[0];
      return Math.max(0, oldestMonthlyRequest + 30 * 24 * 60 * 60 * 1000 - now);
    }

    return 0;
  }

  /**
   * Get current usage statistics
   */
  getUsageStats(): {
    minuteRequests: number;
    dailyRequests: number;
    minuteLimit?: number;
    dailyLimit?: number;
  } {
    const now = Date.now();
    this.cleanupOldRequests(now);

    return {
      minuteRequests: this.minuteRequests.length,
      dailyRequests: this.dailyRequests.length,
      minuteLimit: this.config.requestsPerMinute,
      dailyLimit: this.config.requestsPerDay,
    };
  }

  /**
   * Remove expired requests from tracking
   */
  private cleanupOldRequests(now: number): void {
    const oneMinuteAgo = now - 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

    // Remove requests older than 1 minute
    this.minuteRequests = this.minuteRequests.filter((t) => t > oneMinuteAgo);

    // Remove requests older than 1 day
    this.dailyRequests = this.dailyRequests.filter((t) => t > oneDayAgo);

    // Remove requests older than 30 days
    this.monthlyRequests = this.monthlyRequests.filter((t) => t > oneMonthAgo);
  }

  /**
   * Reset all tracked requests (useful for testing)
   */
  reset(): void {
    this.minuteRequests = [];
    this.dailyRequests = [];
    this.monthlyRequests = [];
  }
}
