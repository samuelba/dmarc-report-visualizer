import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiToken } from './entities/api-token.entity';
import { ApiTokenController } from './api-token.controller';
import { ApiTokenService } from './services/api-token.service';
import { ApiTokenRateLimiterService } from './services/api-token-rate-limiter.service';
import { ApiTokenGuard } from './guards/api-token.guard';
import { SameOriginGuard } from './guards/same-origin.guard';

/**
 * API tokens for the MCP endpoint. Imported only when MCP_ENABLED=true, so
 * with the feature off neither the token routes nor Bearer auth exist.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ApiToken])],
  controllers: [ApiTokenController],
  providers: [
    ApiTokenService,
    ApiTokenRateLimiterService,
    ApiTokenGuard,
    SameOriginGuard,
  ],
  exports: [ApiTokenService, ApiTokenRateLimiterService, ApiTokenGuard],
})
export class ApiTokenModule {}
