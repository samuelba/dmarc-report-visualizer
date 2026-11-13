import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JwtService as NestJwtService,
  JwtSignOptions,
  JwtVerifyOptions,
} from '@nestjs/jwt';
import {
  JwtPayload,
  RefreshTokenPayload,
  TempTokenPayload,
  TOKEN_TYPE,
  TokenType,
} from '../interfaces/jwt-payload.interface';
import {
  deriveTokenKey,
  findJwtSecretWeakness,
  JWT_ALGORITHM,
  requireJwtSecret,
} from '../utils/jwt-keys';

@Injectable()
export class JwtService {
  private readonly logger = new Logger(JwtService.name);
  private readonly keys: Readonly<Record<TokenType, Buffer>>;

  constructor(
    private readonly nestJwtService: NestJwtService,
    private readonly configService: ConfigService,
  ) {
    const secret = requireJwtSecret(
      this.configService.get<string>('JWT_SECRET'),
    );

    const weakness = findJwtSecretWeakness(secret);
    if (weakness) {
      this.logger.error(
        `${weakness} Generate a new one with "openssl rand -base64 48". Read docs/SECRETS.md before changing it on an existing installation.`,
      );
    }

    this.keys = Object.freeze({
      [TOKEN_TYPE.ACCESS]: deriveTokenKey(secret, TOKEN_TYPE.ACCESS),
      [TOKEN_TYPE.REFRESH]: deriveTokenKey(secret, TOKEN_TYPE.REFRESH),
      [TOKEN_TYPE.TOTP_TEMP]: deriveTokenKey(secret, TOKEN_TYPE.TOTP_TEMP),
    });
  }

  private signOptions(type: TokenType, expiresIn: string): JwtSignOptions {
    return {
      secret: this.keys[type],
      algorithm: JWT_ALGORITHM,
      expiresIn: expiresIn as JwtSignOptions['expiresIn'],
    };
  }

  private verifyOptions(
    type: TokenType,
    overrides: Partial<JwtVerifyOptions> = {},
  ): JwtVerifyOptions {
    return {
      secret: this.keys[type],
      algorithms: [JWT_ALGORITHM],
      ...overrides,
    };
  }

  /**
   * Generate an access token with 15-minute expiration
   * @param userId User ID
   * @param email User email
   * @param role User role
   * @param authProvider Authentication provider
   * @param organizationId Optional organization ID for multi-tenant support
   * @returns JWT access token string
   */
  generateAccessToken(
    userId: string,
    email: string,
    role: string,
    authProvider: string,
    organizationId?: string | null,
  ): string {
    const payload = {
      sub: userId,
      email,
      role,
      authProvider,
      organizationId,
      type: TOKEN_TYPE.ACCESS,
    };

    const expiresIn = this.configService.get<string>(
      'JWT_ACCESS_EXPIRATION',
      '15m',
    );

    return this.nestJwtService.sign(
      payload,
      this.signOptions(TOKEN_TYPE.ACCESS, expiresIn),
    );
  }

  /**
   * Generate a refresh token with 7-day expiration
   * @param userId User ID
   * @param tokenId Refresh token ID in database
   * @returns JWT refresh token string
   */
  generateRefreshToken(userId: string, tokenId: string): string {
    const payload = {
      sub: userId,
      tokenId,
      type: TOKEN_TYPE.REFRESH,
    };

    const expiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRATION',
      '7d',
    );

    return this.nestJwtService.sign(
      payload,
      this.signOptions(TOKEN_TYPE.REFRESH, expiresIn),
    );
  }

  /**
   * Verify and decode a refresh token
   * @param token JWT refresh token string
   * @returns Decoded refresh token payload
   * @throws UnauthorizedException if token is invalid or expired
   */
  verifyRefreshToken(token: string): RefreshTokenPayload {
    let payload: RefreshTokenPayload;
    try {
      payload = this.nestJwtService.verify<RefreshTokenPayload>(
        token,
        this.verifyOptions(TOKEN_TYPE.REFRESH),
      );
    } catch (_error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    this.assertTokenType(payload, TOKEN_TYPE.REFRESH);
    return payload;
  }

  /**
   * Verify and decode an access token, ignoring expiration
   * Used during token refresh to validate that the access token belongs to the user
   * @param token JWT access token string
   * @returns Decoded access token payload
   * @throws UnauthorizedException if token is invalid (signature, structure, etc.)
   */
  verifyAccessTokenIgnoreExpiration(token: string): JwtPayload {
    let payload: JwtPayload;
    try {
      payload = this.nestJwtService.verify<JwtPayload>(
        token,
        this.verifyOptions(TOKEN_TYPE.ACCESS, { ignoreExpiration: true }),
      );
    } catch (_error) {
      throw new UnauthorizedException('Invalid access token');
    }
    this.assertTokenType(payload, TOKEN_TYPE.ACCESS);
    return payload;
  }

  /**
   * Ensure a verified token is of the expected type. Each type already has its
   * own signing key; this is a second, independent check on the claim.
   * @throws UnauthorizedException if the type claim does not match
   */
  assertTokenType(payload: { type?: unknown }, expected: TokenType): void {
    if (payload?.type !== expected) {
      throw new UnauthorizedException('Invalid token type');
    }
  }

  /**
   * Parse JWT expiration string (e.g., '7d', '15m', '1h') to milliseconds
   * @param expiration Expiration string
   * @returns Expiration time in milliseconds
   */
  parseExpirationToMs(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiration format: ${expiration}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        throw new Error(`Invalid expiration unit: ${unit}`);
    }
  }

  /**
   * Get refresh token expiration time in milliseconds from config
   * @returns Expiration time in milliseconds
   */
  getRefreshTokenExpiryMs(): number {
    const expiration = this.configService.get<string>(
      'JWT_REFRESH_EXPIRATION',
      '7d',
    );
    return this.parseExpirationToMs(expiration);
  }

  /**
   * Get access token expiration time in milliseconds from config
   * @returns Expiration time in milliseconds
   */
  getAccessTokenExpiryMs(): number {
    const expiration = this.configService.get<string>(
      'JWT_ACCESS_EXPIRATION',
      '15m',
    );
    return this.parseExpirationToMs(expiration);
  }

  /**
   * Generate a temporary token for TOTP verification with 5-minute expiration
   * @param userId User ID
   * @param email User email
   * @returns JWT temporary token string
   */
  generateTempToken(userId: string, email: string): string {
    const payload = {
      sub: userId,
      email,
      type: TOKEN_TYPE.TOTP_TEMP,
    };

    return this.nestJwtService.sign(
      payload,
      this.signOptions(TOKEN_TYPE.TOTP_TEMP, '5m'),
    );
  }

  /**
   * Verify and decode a temporary token
   * @param token JWT temporary token string
   * @returns Decoded temporary token payload
   * @throws UnauthorizedException if token is invalid or expired
   */
  verifyTempToken(token: string): { sub: string; email: string } {
    try {
      const payload = this.nestJwtService.verify<TempTokenPayload>(
        token,
        this.verifyOptions(TOKEN_TYPE.TOTP_TEMP),
      );

      this.assertTokenType(payload, TOKEN_TYPE.TOTP_TEMP);

      return {
        sub: payload.sub,
        email: payload.email,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(
        'Verification session expired. Please log in again',
      );
    }
  }
}
