import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiTokenModule } from '../auth/api-token.module';
import { DmarcModule } from '../dmarc/dmarc.module';
import { IpLocation } from '../dmarc/entities/ip-location.entity';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server.factory';

/** Read-only MCP server. Imported only when MCP_ENABLED=true. */
@Module({
  imports: [
    ApiTokenModule,
    DmarcModule,
    TypeOrmModule.forFeature([IpLocation]),
  ],
  controllers: [McpController],
  providers: [McpServerFactory],
})
export class McpModule {}
