import { DynamicModule, Module, Type } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DmarcModule } from './modules/dmarc/dmarc.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmailModule } from './modules/email/email.module';
import databaseConfig from './config/database.config';
import authConfig from './config/auth.config';
import { isRedisConfigured } from './config/redis.config';
import { isMcpEnabled } from './config/mcp.config';
import { ApiTokenModule } from './modules/auth/api-token.module';

/**
 * With MCP_ENABLED unset or false, API tokens and the MCP server are not
 * part of the app at all: no routes, no Bearer authentication.
 */
export function getOptionalMcpModules(
  enabled: boolean = isMcpEnabled(),
): Type[] {
  return enabled ? [ApiTokenModule] : [];
}

function getOptionalBullRoot(): DynamicModule[] {
  if (!isRedisConfigured()) {
    return [];
  }

  return [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
          password: configService.get('REDIS_PASSWORD'),
        },
      }),
    }),
  ];
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, authConfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get('database');
        return { ...dbConfig };
      },
    }),
    ...getOptionalBullRoot(),
    AuthModule,
    EmailModule.register(),
    DmarcModule,
    ...getOptionalMcpModules(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
