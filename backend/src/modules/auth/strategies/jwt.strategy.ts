import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { User } from '../entities/user.entity';
import { JwtPayload, TOKEN_TYPE } from '../interfaces/jwt-payload.interface';
import {
  deriveTokenKey,
  JWT_ALGORITHM,
  requireJwtSecret,
} from '../utils/jwt-keys';

/**
 * JWT Strategy for Passport authentication
 * Validates JWT tokens from HttpOnly cookies and attaches user information to requests
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    const accessKey = deriveTokenKey(
      requireJwtSecret(configService.get<string>('JWT_SECRET')),
      TOKEN_TYPE.ACCESS,
    );

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          // Extract JWT from accessToken cookie
          return request?.cookies?.accessToken;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: accessKey,
      algorithms: [JWT_ALGORITHM],
    });
  }

  /**
   * Validates the JWT payload and returns user information
   * This method is called automatically by Passport after token verification
   */
  async validate(payload: JwtPayload): Promise<{
    id: string;
    email: string;
    role: string;
    organizationId?: string;
    authProvider: string;
  }> {
    // Only access tokens may authenticate requests (second check besides the per-type signing key)
    if (payload?.type !== TOKEN_TYPE.ACCESS) {
      throw new UnauthorizedException('Invalid token type');
    }

    // Verify user still exists in database
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Return user payload that will be attached to request.user
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId ?? undefined,
      authProvider: user.authProvider,
    };
  }
}
