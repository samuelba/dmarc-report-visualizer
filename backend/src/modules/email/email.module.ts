import { DynamicModule, Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { SmtpConfig } from './entities/smtp-config.entity';
import { SmtpConfigService } from './services/smtp-config.service';
import { EmailService } from './services/email.service';
import { EmailQueueService } from './services/email-queue.service';
import { EmailProcessor } from './processors/email.processor';
import { EmailController } from './email.controller';
import { AuthModule } from '../auth/auth.module';
import { isRedisConfigured } from '../../config/redis.config';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AuthModule),
    TypeOrmModule.forFeature([SmtpConfig]),
  ],
  controllers: [EmailController],
  providers: [SmtpConfigService, EmailService, EmailQueueService],
  exports: [SmtpConfigService, EmailService, EmailQueueService],
})
export class EmailModule {
  static register(): DynamicModule {
    if (!isRedisConfigured()) {
      return { module: EmailModule };
    }

    return {
      module: EmailModule,
      imports: [
        BullModule.registerQueue({
          name: 'email',
        }),
      ],
      providers: [EmailProcessor],
    };
  }
}
