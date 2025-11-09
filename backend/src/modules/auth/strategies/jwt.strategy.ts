import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * JWT Strategy for Passport authentication
 * Validates JWT tokens and attaches user information to requests
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Validates the JWT payload and returns user information
   * This method is called automatically by Passport after token verification
   */
  async validate(payload: JwtPayload): Promise<{
    id: string;
    email: string;
    organizationId?: string;
    authProvider: string;
  }> {
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
      organizationId: user.organizationId ?? undefined,
      authProvider: user.authProvider,
    };
  }
}
