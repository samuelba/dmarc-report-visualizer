import { Injectable, Logger } from '@nestjs/common';
import { getMcpRateLimitPerMinute } from '../../../config/mcp.config';

export const AUTH_FAILURE_LIMIT = 10;
export const AUTH_FAILURE_WINDOW_MS = 5 * 60 * 1000;
export const AUTH_LOCK_MS = 15 * 60 * 1000;
const REQUEST_WINDOW_MS = 60 * 1000;
export const MAX_TRACKED_KEYS = 10_000;

interface Counter {
  count: number;
  startedAt: number;
  lockedUntil?: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfter?: number;
}

/**
 * In-memory limits for Bearer-token requests: locks an IP after repeated
 * invalid tokens and caps requests per user. Like the login limiter, the
 * counters are per process, so run a single backend instance.
 */
@Injectable()
export class ApiTokenRateLimiterService {
  private readonly logger = new Logger(ApiTokenRateLimiterService.name);
  private readonly authFailures = new Map<string, Counter>();
  private readonly requests = new Map<string, Counter>();
  private readonly requestsPerMinute = getMcpRateLimitPerMinute();

  checkAuthAllowed(ip: string, now: number = Date.now()): RateLimitDecision {
    const lockedUntil = this.authFailures.get(ip)?.lockedUntil;
    if (lockedUntil && lockedUntil > now) {
      return { allowed: false, retryAfter: secondsUntil(lockedUntil, now) };
    }
    return { allowed: true };
  }

  recordAuthFailure(ip: string, now: number = Date.now()): void {
    const counter = this.currentCounter(
      this.authFailures,
      ip,
      AUTH_FAILURE_WINDOW_MS,
      now,
    );
    counter.count += 1;
    if (counter.count >= AUTH_FAILURE_LIMIT && !counter.lockedUntil) {
      counter.lockedUntil = now + AUTH_LOCK_MS;
      this.logger.warn('Rate limit violation detected', {
        event: 'rate_limit_violation',
        type: 'api_token_auth',
        ipAddress: ip,
        attempts: counter.count,
      });
    }
  }

  consumeRequest(userId: string, now: number = Date.now()): RateLimitDecision {
    const counter = this.currentCounter(
      this.requests,
      userId,
      REQUEST_WINDOW_MS,
      now,
    );
    if (counter.count >= this.requestsPerMinute) {
      return {
        allowed: false,
        retryAfter: secondsUntil(counter.startedAt + REQUEST_WINDOW_MS, now),
      };
    }
    counter.count += 1;
    return { allowed: true };
  }

  private currentCounter(
    counters: Map<string, Counter>,
    key: string,
    windowMs: number,
    now: number,
  ): Counter {
    const existing = counters.get(key);
    if (existing && isLive(existing, windowMs, now)) {
      return existing;
    }
    if (counters.size >= MAX_TRACKED_KEYS) {
      for (const [k, counter] of counters) {
        if (!isLive(counter, windowMs, now)) {
          counters.delete(k);
        }
      }
    }
    // Still full: drop the oldest entries (Map keeps insertion order).
    for (const k of counters.keys()) {
      if (counters.size < MAX_TRACKED_KEYS) {
        break;
      }
      counters.delete(k);
    }
    const fresh: Counter = { count: 0, startedAt: now };
    counters.set(key, fresh);
    return fresh;
  }
}

function isLive(counter: Counter, windowMs: number, now: number): boolean {
  return now - counter.startedAt < windowMs || (counter.lockedUntil ?? 0) > now;
}

function secondsUntil(timestamp: number, now: number): number {
  return Math.max(1, Math.ceil((timestamp - now) / 1000));
}
