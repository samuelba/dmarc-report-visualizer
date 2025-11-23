import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { SmtpConfig } from './entities/smtp-config.entity';
import { SmtpConfigService } from './services/smtp-config.service';
import { EmailService } from './services/email.service';
import { EmailQueueService } from './services/email-queue.service';
import { EmailProcessor } from './processors/email.processor';
import { EmailController } from './email.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AuthModule), // Use forwardRef to handle circular dependency
    TypeOrmModule.forFeature([SmtpConfig]),
    BullModule.registerQueue({
      name: 'email',
    }),
  ],
  controllers: [EmailController],
  providers: [
    SmtpConfigService,
    EmailService,
    EmailQueueService,
    EmailProcessor,
  ],
  exports: [SmtpConfigService, EmailService, EmailQueueService],
})
export class EmailModule {}
