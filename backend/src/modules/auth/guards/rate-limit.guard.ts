import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RateLimiterService } from '../services/rate-limiter.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly rateLimiterService: RateLimiterService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.connection.remoteAddress || 'unknown';
    const email = request.body?.email;

    // Check IP rate limit
    const ipCheck = await this.rateLimiterService.checkIpRateLimit(ip);
    if (!ipCheck.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many failed attempts from this IP address. Please try again in ${Math.ceil(ipCheck.retryAfter! / 60)} minutes.`,
          retryAfter: ipCheck.retryAfter,
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Check account lock if email is provided
    if (email) {
      const accountCheck =
        await this.rateLimiterService.checkAccountLock(email);
      if (accountCheck.locked) {
        throw new HttpException(
          {
            statusCode: 423, // Locked status code
            message: `Account temporarily locked due to multiple failed login attempts. Please try again in ${Math.ceil(accountCheck.retryAfter! / 60)} minutes.`,
            retryAfter: accountCheck.retryAfter,
            error: 'Locked',
          },
          423,
        );
      }
    }

    return true;
  }
}
