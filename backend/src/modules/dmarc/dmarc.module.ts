import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DmarcReportController } from './dmarc-report.controller';
import { DmarcReportService } from './dmarc-report.service';
import { DmarcReport } from './entities/dmarc-report.entity';
import { DmarcRecord } from './entities/dmarc-record.entity';
import { DkimResult } from './entities/dkim-result.entity';
import { SpfResult } from './entities/spf-result.entity';
import { PolicyOverrideReason } from './entities/policy-override-reason.entity';
import { IpLocation } from './entities/ip-location.entity';
import { FileWatcherService } from './file-watcher.service';
import { GmailDownloaderService } from './gmail-downloader.service';
import { GeolocationService } from './services/geolocation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DmarcReport,
      DmarcRecord,
      DkimResult,
      SpfResult,
      PolicyOverrideReason,
      IpLocation,
    ]),
  ],
  controllers: [DmarcReportController],
  providers: [
    DmarcReportService,
    FileWatcherService,
    GmailDownloaderService,
    GeolocationService,
  ],
  exports: [DmarcReportService, GeolocationService],
})
export class DmarcModule {}
