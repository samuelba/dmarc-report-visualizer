import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimiterService } from '../services/rate-limiter.service';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let rateLimiterService: RateLimiterService;

  const mockRateLimiterService = {
    checkIpRateLimit: jest.fn(),
    checkAccountLock: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitGuard,
        {
          provide: RateLimiterService,
          useValue: mockRateLimiterService,
        },
      ],
    }).compile();

    guard = module.get<RateLimitGuard>(RateLimitGuard);
    rateLimiterService = module.get<RateLimiterService>(RateLimiterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockExecutionContext = (
    ip: string = '127.0.0.1',
    email?: string,
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          ip,
          connection: { remoteAddress: ip },
          body: email ? { email } : {},
        }),
      }),
    } as ExecutionContext;
  };

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow access when no rate limits are exceeded', async () => {
      const context = createMockExecutionContext(
        '127.0.0.1',
        'test@example.com',
      );

      mockRateLimiterService.checkIpRateLimit.mockResolvedValue({
        allowed: true,
      });
      mockRateLimiterService.checkAccountLock.mockResolvedValue({
        locked: false,
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(rateLimiterService.checkIpRateLimit).toHaveBeenCalledWith(
        '127.0.0.1',
      );
      expect(rateLimiterService.checkAccountLock).toHaveBeenCalledWith(
        'test@example.com',
      );
    });

    it('should allow access when no email is provided', async () => {
      const context = createMockExecutionContext('127.0.0.1');

      mockRateLimiterService.checkIpRateLimit.mockResolvedValue({
        allowed: true,
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(rateLimiterService.checkIpRateLimit).toHaveBeenCalledWith(
        '127.0.0.1',
      );
      expect(rateLimiterService.checkAccountLock).not.toHaveBeenCalled();
    });

    it('should throw 429 when IP rate limit is exceeded', async () => {
      const context = createMockExecutionContext(
        '127.0.0.1',
        'test@example.com',
      );

      mockRateLimiterService.checkIpRateLimit.mockResolvedValue({
        allowed: false,
        retryAfter: 900, // 15 minutes in seconds
      });

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

      try {
        await guard.canActivate(context);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const response = error.getResponse();
        expect(response.statusCode).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(response.message).toContain('Too many failed attempts');
        expect(response.message).toContain('15 minutes');
        expect(response.retryAfter).toBe(900);
        expect(response.error).toBe('Too Many Requests');
      }

      expect(rateLimiterService.checkIpRateLimit).toHaveBeenCalledWith(
        '127.0.0.1',
      );
    });

    it('should throw 423 when account is locked', async () => {
      const context = createMockExecutionContext(
        '127.0.0.1',
        'test@example.com',
      );

      mockRateLimiterService.checkIpRateLimit.mockResolvedValue({
        allowed: true,
      });
      mockRateLimiterService.checkAccountLock.mockResolvedValue({
        locked: true,
        retryAfter: 900, // 15 minutes in seconds
      });

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

      try {
        await guard.canActivate(context);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(423);
        const response = error.getResponse();
        expect(response.statusCode).toBe(423);
        expect(response.message).toContain('Account temporarily locked');
        expect(response.message).toContain('15 minutes');
        expect(response.retryAfter).toBe(900);
        expect(response.error).toBe('Locked');
      }

      expect(rateLimiterService.checkIpRateLimit).toHaveBeenCalledWith(
        '127.0.0.1',
      );
      expect(rateLimiterService.checkAccountLock).toHaveBeenCalledWith(
        'test@example.com',
      );
    });

    it('should use unknown IP when IP is not available', async () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            connection: {},
            body: { email: 'test@example.com' },
          }),
        }),
      } as ExecutionContext;

      mockRateLimiterService.checkIpRateLimit.mockResolvedValue({
        allowed: true,
      });
      mockRateLimiterService.checkAccountLock.mockResolvedValue({
        locked: false,
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(rateLimiterService.checkIpRateLimit).toHaveBeenCalledWith(
        'unknown',
      );
    });

    it('should check IP rate limit before account lock', async () => {
      const context = createMockExecutionContext(
        '127.0.0.1',
        'test@example.com',
      );

      mockRateLimiterService.checkIpRateLimit.mockResolvedValue({
        allowed: false,
        retryAfter: 900,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

      expect(rateLimiterService.checkIpRateLimit).toHaveBeenCalled();
      // Account lock should not be checked if IP is rate limited
      expect(rateLimiterService.checkAccountLock).not.toHaveBeenCalled();
    });
  });
});
