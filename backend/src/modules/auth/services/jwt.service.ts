import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { RefreshTokenPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtService {
  constructor(
    private readonly nestJwtService: NestJwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate an access token with 15-minute expiration
   * @param userId User ID
   * @param email User email
   * @param organizationId Optional organization ID for multi-tenant support
   * @returns JWT access token string
   */
  generateAccessToken(
    userId: string,
    email: string,
    authProvider: string,
    organizationId?: string | null,
  ): string {
    const payload: any = {
      sub: userId,
      email,
      authProvider,
      organizationId,
    };

    const expiresIn = this.configService.get<string>(
      'JWT_ACCESS_EXPIRATION',
      '15m',
    );

    return this.nestJwtService.sign(payload, {
      expiresIn: expiresIn as any,
    });
  }

  /**
   * Generate a refresh token with 7-day expiration
   * @param userId User ID
   * @param tokenId Refresh token ID in database
   * @returns JWT refresh token string
   */
  generateRefreshToken(userId: string, tokenId: string): string {
    const payload: any = {
      sub: userId,
      tokenId,
    };

    const expiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRATION',
      '7d',
    );

    return this.nestJwtService.sign(payload, {
      expiresIn: expiresIn as any,
    });
  }

  /**
   * Verify and decode a refresh token
   * @param token JWT refresh token string
   * @returns Decoded refresh token payload
   * @throws UnauthorizedException if token is invalid or expired
   */
  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      return this.nestJwtService.verify<RefreshTokenPayload>(token);
    } catch (_error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Verify and decode an access token, ignoring expiration
   * Used during token refresh to validate that the access token belongs to the user
   * @param token JWT access token string
   * @returns Decoded access token payload
   * @throws UnauthorizedException if token is invalid (signature, structure, etc.)
   */
  verifyAccessTokenIgnoreExpiration(token: string): any {
    try {
      return this.nestJwtService.verify(token, {
        ignoreExpiration: true, // Allow expired tokens
      });
    } catch (_error) {
      throw new UnauthorizedException('Invalid access token');
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
}
