import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule as NestJwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PassportModule } from '@nestjs/passport';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuthController } from './auth.controller';
import { JwtService } from './services/jwt.service';
import { PasswordService } from './services/password.service';
import { AuthService } from './services/auth.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SetupGuard } from './guards/setup.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { TokenCleanupService } from './services/token-cleanup.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forFeature([User, RefreshToken]),
    NestJwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (
        configService: ConfigService,
      ): Promise<JwtModuleOptions> => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET is not configured');
        }
        const expiresIn = configService.get<string>(
          'JWT_ACCESS_EXPIRATION',
          '15m',
        );
        return {
          secret,
          signOptions: {
            expiresIn,
          },
        } as JwtModuleOptions;
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    JwtService,
    PasswordService,
    AuthService,
    RateLimiterService,
    TokenCleanupService,
    JwtAuthGuard,
    SetupGuard,
    RateLimitGuard,
    JwtStrategy,
  ],
  exports: [
    TypeOrmModule,
    JwtService,
    AuthService,
    JwtAuthGuard,
    SetupGuard,
    RateLimitGuard,
  ],
})
export class AuthModule {}
