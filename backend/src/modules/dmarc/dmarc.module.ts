import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DmarcReportController } from './dmarc-report.controller';
import { ThirdPartySenderController } from './controllers/third-party-sender.controller';
import { ReprocessingController } from './controllers/reprocessing.controller';
import { DmarcReportService } from './dmarc-report.service';
import { DmarcReport } from './entities/dmarc-report.entity';
import { DmarcRecord } from './entities/dmarc-record.entity';
import { DkimResult } from './entities/dkim-result.entity';
import { SpfResult } from './entities/spf-result.entity';
import { PolicyOverrideReason } from './entities/policy-override-reason.entity';
import { IpLocation } from './entities/ip-location.entity';
import { ThirdPartySender } from './entities/third-party-sender.entity';
import { ReprocessingJob } from './entities/reprocessing-job.entity';
import { FileWatcherService } from './file-watcher.service';
import { GmailDownloaderService } from './gmail-downloader.service';
import { GeolocationService } from './services/geolocation.service';
import { ForwardingDetectionService } from './services/forwarding-detection.service';
import { ThirdPartySenderService } from './services/third-party-sender.service';
import { ReprocessingService } from './services/reprocessing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DmarcReport,
      DmarcRecord,
      DkimResult,
      SpfResult,
      PolicyOverrideReason,
      IpLocation,
      ThirdPartySender,
      ReprocessingJob,
    ]),
  ],
  controllers: [
    DmarcReportController,
    ThirdPartySenderController,
    ReprocessingController,
  ],
  providers: [
    DmarcReportService,
    FileWatcherService,
    GmailDownloaderService,
    GeolocationService,
    ForwardingDetectionService,
    ThirdPartySenderService,
    ReprocessingService,
  ],
  exports: [DmarcReportService, GeolocationService],
})
export class DmarcModule {}
