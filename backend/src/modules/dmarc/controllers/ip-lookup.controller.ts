import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GeolocationService } from '../services/geolocation.service';
import {
  IpLookupConfigDto,
  IpLookupTestDto,
} from '../dto/ip-lookup-config.dto';
import { IpLookupQueueService } from '../services/ip-lookup-queue.service';
import { DmarcParserService } from '../services/dmarc-parser.service';

@ApiTags('ip-lookup')
@Controller('ip-lookup')
export class IpLookupController {
  constructor(
    private readonly geolocationService: GeolocationService,
    private readonly ipLookupQueueService: IpLookupQueueService,
    private readonly dmarcParserService: DmarcParserService,
  ) {}

  @Get('config')
  @ApiOperation({
    summary: 'Get current IP lookup configuration',
    description:
      'Retrieve the current IP lookup service configuration including provider selection and settings',
  })
  @ApiResponse({
    status: 200,
    description: 'Current configuration',
    type: IpLookupConfigDto,
  })
  getConfig() {
    return this.geolocationService.getConfig();
  }

  @Put('config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update IP lookup configuration',
    description:
      'Update the IP lookup service configuration. Changes take effect immediately.',
  })
  @ApiResponse({
    status: 200,
    description: 'Configuration updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid configuration',
  })
  updateConfig(@Body() configDto: IpLookupConfigDto) {
    this.geolocationService.setConfig(configDto);
    return {
      message: 'Configuration updated successfully',
      config: this.geolocationService.getConfig(),
    };
  }

  @Get('providers')
  @ApiOperation({
    summary: 'Get available IP lookup providers',
    description:
      'List all available IP lookup providers with their capabilities and current statistics',
  })
  @ApiResponse({
    status: 200,
    description: 'List of available providers',
  })
  getProviders() {
    return this.geolocationService.getProviderStats();
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Test IP lookup',
    description:
      'Test the IP lookup service by looking up a specific IP address',
  })
  @ApiResponse({
    status: 200,
    description: 'Lookup result',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid IP address',
  })
  async testLookup(@Body() testDto: IpLookupTestDto) {
    const result = await this.geolocationService.getLocationForIp(testDto.ip);
    return {
      ip: testDto.ip,
      result,
      provider: this.geolocationService.getConfig().provider,
    };
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get IP lookup statistics',
    description: 'Get usage statistics for all configured IP lookup providers',
  })
  @ApiResponse({
    status: 200,
    description: 'Provider statistics',
  })
  getStats() {
    return {
      providers: this.geolocationService.getProviderStats(),
      config: this.geolocationService.getConfig(),
    };
  }

  @Get('queue')
  @ApiOperation({
    summary: 'Get IP lookup queue status',
    description:
      'Get current status of the IP lookup queue including pending items',
  })
  @ApiResponse({
    status: 200,
    description: 'Queue statistics',
  })
  getQueueStatus() {
    return this.ipLookupQueueService.getQueueStats();
  }

  @Post('queue/process-pending')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Process pending IP lookups',
    description:
      'Queue all records that are missing geolocation data for background processing',
  })
  @ApiResponse({
    status: 200,
    description: 'Number of records queued',
  })
  async processPending() {
    const count = await this.ipLookupQueueService.processPendingLookups(1000);
    return {
      message: `Queued ${count} records for IP lookup`,
      queued: count,
    };
  }

  @Delete('queue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clear IP lookup queue',
    description: 'Clear all pending items from the IP lookup queue',
  })
  @ApiResponse({
    status: 200,
    description: 'Queue cleared',
  })
  clearQueue() {
    this.ipLookupQueueService.clearQueue();
    return {
      message: 'Queue cleared successfully',
    };
  }

  @Put('mode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set IP lookup mode',
    description:
      'Switch between async (queued) and sync (immediate) IP lookup modes',
  })
  @ApiResponse({
    status: 200,
    description: 'Mode updated',
  })
  setMode(@Body() body: { async: boolean }) {
    this.dmarcParserService.setAsyncIpLookup(body.async);
    return {
      message: `IP lookup mode set to ${body.async ? 'async' : 'sync'}`,
      async: body.async,
    };
  }

  @Get('processing-status')
  @ApiOperation({
    summary: 'Get IP lookup processing status',
    description: 'Get counts of records by their IP lookup status',
  })
  @ApiResponse({
    status: 200,
    description: 'Processing status breakdown',
  })
  async getProcessingStatus() {
    // This would be better implemented in a dedicated service
    // For now, return basic stats from queue
    return {
      queue: this.ipLookupQueueService.getQueueStats(),
      // Note: Add a method to get status counts from database
      message: 'Use SQL queries to get detailed status breakdown',
    };
  }
}
