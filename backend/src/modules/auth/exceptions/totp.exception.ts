import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exception thrown when an invalid TOTP code is provided
 */
export class InvalidTotpCodeException extends HttpException {
  constructor(
    message: string = 'Invalid verification code. Please check your authenticator app and try again.',
  ) {
    super(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        message,
        error: 'Unauthorized',
        errorCode: 'INVALID_TOTP_CODE',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * Exception thrown when an invalid recovery code is provided
 */
export class InvalidRecoveryCodeException extends HttpException {
  constructor(
    message: string = 'Invalid recovery code. Please check the code and try again.',
  ) {
    super(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        message,
        error: 'Unauthorized',
        errorCode: 'INVALID_RECOVERY_CODE',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * Exception thrown when a recovery code has already been used
 */
export class RecoveryCodeAlreadyUsedException extends HttpException {
  constructor(
    message: string = 'This recovery code has already been used. Each recovery code can only be used once.',
  ) {
    super(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        message,
        error: 'Unauthorized',
        errorCode: 'RECOVERY_CODE_ALREADY_USED',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * Exception thrown when the temporary token has expired
 */
export class ExpiredTempTokenException extends HttpException {
  constructor(
    message: string = 'Your verification session has expired. Please log in again.',
  ) {
    super(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        message,
        error: 'Unauthorized',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * Exception thrown when TOTP is already enabled for a user
 */
export class TotpAlreadyEnabledException extends HttpException {
  constructor(
    message: string = 'Two-factor authentication is already enabled for your account.',
  ) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        message,
        error: 'Conflict',
      },
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * Exception thrown when TOTP is not enabled for a user
 */
export class TotpNotEnabledException extends HttpException {
  constructor(
    message: string = 'Two-factor authentication is not enabled for your account.',
  ) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message,
        error: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Exception thrown when a SAML user attempts to use TOTP
 */
export class SamlUserTotpException extends HttpException {
  constructor(
    message: string = "Two-factor authentication is managed by your organization's Identity Provider. Please contact your administrator for 2FA settings.",
  ) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message,
        error: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Exception thrown when an invalid password is provided for TOTP operations
 */
export class InvalidPasswordException extends HttpException {
  constructor(
    message: string = 'Invalid password. Please check your password and try again.',
  ) {
    super(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        message,
        error: 'Unauthorized',
        errorCode: 'INVALID_PASSWORD',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * Exception thrown when TOTP rate limit is exceeded
 */
export class TotpRateLimitException extends HttpException {
  constructor(retryAfter: number, operation: string = 'verification') {
    let timeMessage: string;
    if (retryAfter < 60) {
      timeMessage = `${retryAfter} second${retryAfter !== 1 ? 's' : ''}`;
    } else {
      const minutes = Math.ceil(retryAfter / 60);
      timeMessage = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }

    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Too many failed ${operation} attempts. Please try again in ${timeMessage}.`,
        retryAfter,
        error: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
