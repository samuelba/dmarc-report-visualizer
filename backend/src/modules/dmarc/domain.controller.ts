import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DomainService } from './domain.service';
import {
  CreateDomainDto,
  UpdateDomainDto,
  QueryDomainsDto,
  DomainStatisticsDto,
} from './dto/domain.dto';
import { Domain } from './entities/domain.entity';

@ApiTags('Domains')
@Controller('domains')
export class DomainController {
  constructor(private readonly domainService: DomainService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new managed domain' })
  @ApiResponse({ status: 201, description: 'Domain created successfully' })
  @ApiResponse({ status: 409, description: 'Domain already exists' })
  create(@Body() createDomainDto: CreateDomainDto): Promise<Domain> {
    return this.domainService.create(createDomainDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all managed domains' })
  @ApiResponse({ status: 200, description: 'Returns all managed domains' })
  findAll(): Promise<Domain[]> {
    return this.domainService.findAll();
  }

  @Get('statistics')
  @ApiOperation({
    summary: 'Get statistics for all domains (managed and unmanaged)',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns statistics for all domains found in DMARC reports',
    type: [DomainStatisticsDto],
  })
  getStatistics(
    @Query() query: QueryDomainsDto,
  ): Promise<DomainStatisticsDto[]> {
    const daysBack = query.daysBack ? Number(query.daysBack) : 30;
    return this.domainService.getDomainStatistics(daysBack);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific managed domain by ID' })
  @ApiResponse({ status: 200, description: 'Returns the domain' })
  @ApiResponse({ status: 404, description: 'Domain not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Domain> {
    return this.domainService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a managed domain' })
  @ApiResponse({ status: 200, description: 'Domain updated successfully' })
  @ApiResponse({ status: 404, description: 'Domain not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDomainDto: UpdateDomainDto,
  ): Promise<Domain> {
    return this.domainService.update(id, updateDomainDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a managed domain' })
  @ApiResponse({ status: 200, description: 'Domain deleted successfully' })
  @ApiResponse({ status: 404, description: 'Domain not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.domainService.remove(id);
    return { message: 'Domain deleted successfully' };
  }
}
