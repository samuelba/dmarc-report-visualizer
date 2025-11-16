import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule as NestJwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PassportModule } from '@nestjs/passport';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { SamlConfig } from './entities/saml-config.entity';
import { RecoveryCode } from './entities/recovery-code.entity';
import { AuthController } from './auth.controller';
import { JwtService } from './services/jwt.service';
import { PasswordService } from './services/password.service';
import { AuthService } from './services/auth.service';
import { SamlService } from './services/saml.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { TotpService } from './services/totp.service';
import { RecoveryCodeService } from './services/recovery-code.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SetupGuard } from './guards/setup.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { SamlEnabledGuard } from './guards/saml-enabled.guard';
import { TokenCleanupService } from './services/token-cleanup.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SamlStrategy } from './strategies/saml.strategy';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forFeature([User, RefreshToken, SamlConfig, RecoveryCode]),
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
    SamlService,
    RateLimiterService,
    TotpService,
    RecoveryCodeService,
    TokenCleanupService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    SetupGuard,
    RateLimitGuard,
    SamlEnabledGuard,
    JwtStrategy,
    SamlStrategy,
  ],
  exports: [TypeOrmModule, JwtService, AuthService, SetupGuard, RateLimitGuard],
})
export class AuthModule {}
