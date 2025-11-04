import { HttpException, HttpStatus } from '@nestjs/common';

export class RateLimitException extends HttpException {
  constructor(retryAfter: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Too many failed attempts. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`,
        retryAfter,
        error: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class AccountLockedException extends HttpException {
  constructor(retryAfter: number) {
    super(
      {
        statusCode: 423,
        message: `Account temporarily locked due to multiple failed login attempts. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`,
        retryAfter,
        error: 'Locked',
      },
      423,
    );
  }
}
