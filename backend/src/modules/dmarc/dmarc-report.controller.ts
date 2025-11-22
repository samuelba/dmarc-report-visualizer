import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { DmarcReportService } from './dmarc-report.service';
import { DmarcReport } from './entities/dmarc-report.entity';
import { QueryReportsDto } from './dto/query-reports.dto';
import { minifyXml } from './utils/xml-minifier.util';
import {
  StatsQueryDto,
  TimeSeriesQueryDto,
  TopSourcesQueryDto,
} from './dto/summary-stats.dto';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';

@ApiTags('DMARC Reports')
@Controller('dmarc-reports')
export class DmarcReportController {
  constructor(private readonly dmarcReportService: DmarcReportService) {}

  /**
   * Helper to make 'to' date inclusive by setting it to end of day
   */
  private makeToDateInclusive(dateStr?: string): Date | undefined {
    if (!dateStr) {
      return undefined;
    }
    const date = new Date(dateStr);
    date.setHours(23, 59, 59, 999);
    return date;
  }

  @Get()
  findAll(): Promise<DmarcReport[]> {
    return this.dmarcReportService.findAll();
  }

  @Get('list')
  async list(@Query() q: QueryReportsDto) {
    const from = q.from ? new Date(q.from) : undefined;
    const to = this.makeToDateInclusive(q.to);
    return this.dmarcReportService.list({
      domain: q.domain,
      from,
      to,
      page: q.page,
      pageSize: q.pageSize,
      sort: q.sort,
      order: q.order,
    });
  }

  @Get('stats/summary')
  async summary(@Query() q: StatsQueryDto) {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    return this.dmarcReportService.summaryStats({ domain: q.domain, from, to });
  }

  @Get('stats/timeseries')
  async timeseries(@Query() q: TimeSeriesQueryDto) {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    return this.dmarcReportService.timeSeries({
      domain: q.domain,
      from,
      to,
      interval: q.interval ?? 'day',
    });
  }

  @Get('stats/top-sources')
  async topSources(@Query() q: TopSourcesQueryDto) {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    return this.dmarcReportService.topSources({
      domain: q.domain,
      from,
      to,
      limit: q.limit ?? 10,
    });
  }

  @Get('stats/auth-summary')
  async authSummary(@Query() q: StatsQueryDto) {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    return this.dmarcReportService.authSummary({ domain: q.domain, from, to });
  }

  @Get('stats/auth-breakdown')
  async authBreakdown(@Query() q: StatsQueryDto) {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    return this.dmarcReportService.authBreakdown({
      domain: q.domain,
      from,
      to,
    });
  }

  @Get('stats/auth-pass-rate-timeseries')
  async authPassRateTimeseries(@Query() q: TimeSeriesQueryDto) {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    return this.dmarcReportService.authPassRateTimeseries({
      domain: q.domain,
      from,
      to,
      interval: q.interval ?? 'day',
    });
  }

  @Get('stats/disposition-timeseries')
  async dispositionTimeseries(@Query() q: TimeSeriesQueryDto) {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    return this.dmarcReportService.dispositionTimeseries({
      domain: q.domain,
      from,
      to,
      interval: q.interval ?? 'day',
    });
  }

  @Get('stats/auth-matrix')
  async authMatrix(@Query() q: StatsQueryDto) {
    const from = q.from ? new Date(q.from) : undefined;
    const to = this.makeToDateInclusive(q.to);
    return this.dmarcReportService.authMatrix({ domain: q.domain, from, to });
  }

  @Get('stats/top-ips')
  async topIps(
    @Query('domain') domain?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = this.makeToDateInclusive(toStr);
    const limit = limitStr ? parseInt(limitStr, 10) : 10;
    return this.dmarcReportService.topIps({ domain, from, to, limit });
  }

  @Get('stats/new-ips')
  async newIps(
    @Query('domain') domain?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = this.makeToDateInclusive(toStr);
    const limit = limitStr ? parseInt(limitStr, 10) : 10;
    return this.dmarcReportService.newIps({ domain, from, to, limit });
  }

  @Get('stats/test-new-endpoint')
  testNewEndpoint(): Promise<{ message: string }> {
    return Promise.resolve({ message: 'New endpoint working in stats!' });
  }

  @Post()
  create(@Body() dmarcReport: Partial<DmarcReport>): Promise<DmarcReport> {
    return this.dmarcReportService.create(dmarcReport);
  }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDmarcReport(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<DmarcReport> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const ext = (file.originalname?.split('.')?.pop() || '').toLowerCase();
    const xmlContent = await this.dmarcReportService.unzipReport(
      file.buffer,
      ext,
    );
    const dmarcReportData =
      await this.dmarcReportService.parseXmlReport(xmlContent);
    (dmarcReportData as any).originalXml = minifyXml(xmlContent);
    return this.dmarcReportService.createOrUpdateByReportId(dmarcReportData);
  }

  @Post('process-directory')
  @UseGuards(AdminGuard)
  async processDirectory(@Body() body: { directory?: string }) {
    const fs = require('fs/promises');
    const path = require('path');

    const dir =
      body.directory || path.resolve(process.cwd(), 'reports/incoming');
    const files = await fs.readdir(dir);
    const processed: any[] = [];

    for (const file of files) {
      if (file.match(/\.(xml|gz|zip)$/i)) {
        try {
          const filePath = path.join(dir, file);
          const buffer = await fs.readFile(filePath);
          const ext: string = (file.split('.').pop() || '').toLowerCase();
          const xmlContent = await this.dmarcReportService.unzipReport(
            buffer as Buffer,
            ext,
          );
          // xmlContent is already a string; no need for extra typeof check
          const parsed =
            await this.dmarcReportService.parseXmlReport(xmlContent);
          (parsed as Record<string, unknown>).originalXml =
            minifyXml(xmlContent);
          const result =
            await this.dmarcReportService.createOrUpdateByReportId(parsed);

          processed.push({ file, id: result.id, reportId: result.reportId });
        } catch (error) {
          processed.push({ file, error: String(error) });
        }
      }
    }

    return { directory: dir, processed };
  }

  @Get('test-endpoint')
  testEndpoint(): Promise<{ message: string }> {
    return Promise.resolve({ message: 'Test endpoint working!' });
  }

  @Get('report/:id/xml')
  async getReportXml(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<string | { message: string }> {
    const xml = await this.dmarcReportService.getReportOriginalXml(id);
    return xml ?? { message: 'No XML stored for this report' };
  }

  @Get('record/:id/xml')
  async getRecordXml(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<string | { message: string }> {
    const xml = await this.dmarcReportService.getRecordOriginalXml(id);
    return xml ?? { message: 'No XML stored for this record' };
  }

  @Get('domains')
  async getDomains(): Promise<{ domains: string[] }> {
    const result = await this.dmarcReportService.getDomains();
    return { domains: result };
  }

  @Get('report-domains')
  async getReportDomains(): Promise<{ domains: string[] }> {
    const result = await this.dmarcReportService.getReportDomains();
    return { domains: result };
  }

  @Get('top-countries')
  async getTopCountries(
    @Query('domain') domain?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<
    | Array<{
        country: string;
        count: number;
        dmarcPassCount: number;
        dkimPassCount: number;
        spfPassCount: number;
      }>
    | {
        data: Array<{
          country: string;
          count: number;
          dmarcPassCount: number;
          dkimPassCount: number;
          spfPassCount: number;
        }>;
        total: number;
      }
  > {
    // Support both legacy limit parameter and new pagination
    if (page && pageSize) {
      return this.dmarcReportService.getTopCountriesPaginated({
        domain,
        from: from ? new Date(from) : undefined,
        to: this.makeToDateInclusive(to),
        page: parseInt(page, 10),
        pageSize: parseInt(pageSize, 10),
      });
    } else {
      return this.dmarcReportService.getTopCountries({
        domain,
        from: from ? new Date(from) : undefined,
        to: this.makeToDateInclusive(to),
        limit: limit ? parseInt(limit, 10) : 10,
      });
    }
  }

  @Get('geo-heatmap')
  async getGeoHeatmap(
    @Query('domain') domain?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<
    Array<{
      latitude: number;
      longitude: number;
      count: number;
      passCount: number;
      failCount: number;
      country: string;
    }>
  > {
    return this.dmarcReportService.getGeoHeatmapData({
      domain,
      from: from ? new Date(from) : undefined,
      to: this.makeToDateInclusive(to),
    });
  }

  @Get('top-ips-enhanced')
  async getTopIpsEnhanced(
    @Query('domain') domain?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<{
    data: Array<{
      sourceIp: string;
      count: number;
      passCount: number;
      failCount: number;
      dkimPassCount: number;
      spfPassCount: number;
      country?: string;
      city?: string;
      latitude?: number;
      longitude?: number;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    return this.dmarcReportService.getTopIpsEnhanced({
      domain,
      from: from ? new Date(from) : undefined,
      to: this.makeToDateInclusive(to),
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 10,
    });
  }

  @Get('top-header-from')
  async getTopHeaderFrom(
    @Query('domain') domain?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<{
    data: Array<{
      headerFrom: string;
      count: number;
      dmarcPassCount: number;
      dkimPassCount: number;
      spfPassCount: number;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const p = page ? parseInt(page, 10) : 1;
    const ps = pageSize ? parseInt(pageSize, 10) : 10;
    const result =
      await this.dmarcReportService.getTopHeaderFromDomainsPaginated({
        domain,
        from: from ? new Date(from) : undefined,
        to: this.makeToDateInclusive(to),
        page: p,
        pageSize: ps,
      });
    return { ...result, page: p, pageSize: ps } as any;
  }

  @Get('records/distinct')
  async getDistinct(
    @Query('field')
    field:
      | 'domain'
      | 'orgName'
      | 'sourceIp'
      | 'envelopeTo'
      | 'envelopeFrom'
      | 'headerFrom'
      | 'dkimDomain'
      | 'spfDomain'
      | 'country',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dmarcReportService.getDistinctValues(
      field,
      from ? new Date(from) : undefined,
      this.makeToDateInclusive(to),
    );
  }

  @Get('record/:id')
  async getRecordById(@Param('id', ParseUUIDPipe) id: string) {
    return this.dmarcReportService.getRecordById(id);
  }

  // Parameterized routes must come last to avoid conflicts
  @Get('report/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<DmarcReport | null> {
    return this.dmarcReportService.findOne(id);
  }

  @Put('report/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dmarcReport: Partial<DmarcReport>,
  ): Promise<DmarcReport | null> {
    return this.dmarcReportService.update(id, dmarcReport);
  }

  @Delete('report/:id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.dmarcReportService.remove(id);
  }

  @Delete('old-reports')
  @UseGuards(AdminGuard)
  async deleteOldReports(
    @Query('olderThan') olderThan: string,
  ): Promise<{ deletedCount: number }> {
    if (!olderThan) {
      throw new BadRequestException('olderThan query parameter is required');
    }

    const date = new Date(olderThan);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    return this.dmarcReportService.deleteOldReports(date);
  }

  @Get('records/search')
  async searchRecords(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('domain') domain?: string | string[],
    @Query('orgName') orgName?: string | string[],
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('disposition') disposition?: string | string[],
    @Query('dkim') dkim?: string | string[],
    @Query('spf') spf?: string | string[],
    @Query('sourceIp') sourceIp?: string | string[],
    @Query('envelopeTo') envelopeTo?: string | string[],
    @Query('envelopeFrom') envelopeFrom?: string | string[],
    @Query('headerFrom') headerFrom?: string | string[],
    @Query('dkimDomain') dkimDomain?: string | string[],
    @Query('spfDomain') spfDomain?: string | string[],
    @Query('country') country?: string | string[],
    @Query('contains') contains?: string,
    @Query('isForwarded') isForwarded?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: 'asc' | 'desc',
  ) {
    const coerce = (v: any) =>
      v === undefined ? undefined : Array.isArray(v) ? v : [v];

    return this.dmarcReportService.searchRecords({
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      domain,
      orgName: coerce(orgName),
      from: from ? new Date(from) : undefined,
      to: this.makeToDateInclusive(to),
      disposition: coerce(disposition) as any,
      dkim: coerce(dkim) as any,
      spf: coerce(spf) as any,
      sourceIp: coerce(sourceIp),
      envelopeTo: coerce(envelopeTo),
      envelopeFrom: coerce(envelopeFrom),
      headerFrom: coerce(headerFrom),
      dkimDomain: coerce(dkimDomain),
      spfDomain: coerce(spfDomain),
      country: coerce(country),
      contains,
      isForwarded:
        isForwarded !== undefined
          ? isForwarded === 'true'
            ? true
            : isForwarded === 'false'
              ? false
              : isForwarded === 'null' || isForwarded === 'unknown'
                ? null
                : undefined
          : undefined,
      sort,
      order,
    });
  }
}
