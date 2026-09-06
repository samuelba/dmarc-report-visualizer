import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SendEmailOptions } from './email.service';

const REDIS_REQUIRED_MESSAGE =
  'Redis is required for the email queue. Set REDIS_HOST to enable SMTP features.';

@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);

  constructor(
    @Optional()
    @InjectQueue('email')
    private readonly emailQueue?: Queue,
  ) {}

  private getQueue(): Queue {
    if (!this.emailQueue) {
      throw new ServiceUnavailableException(REDIS_REQUIRED_MESSAGE);
    }
    return this.emailQueue;
  }

  /**
   * Queue an email for asynchronous sending
   * @param options Email options
   * @returns Job ID
   */
  async queueEmail(options: SendEmailOptions): Promise<string> {
    this.logger.log(`Queueing email to ${options.to}: ${options.subject}`);

    const job = await this.getQueue().add('send-email', options, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.log(`Email queued with job ID: ${job.id}`);
    return job.id?.toString() || '';
  }

  /**
   * Queue an invitation email with template rendering
   * @param email Recipient email
   * @param token Invitation token
   * @param inviterName Name of the person who sent the invite
   * @returns Job ID
   */
  async queueInviteEmail(
    email: string,
    token: string,
    inviterName: string,
  ): Promise<string> {
    this.logger.log(`Queueing invitation email to ${email}`);

    const job = await this.getQueue().add(
      'send-invite-email',
      { email, token, inviterName },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(`Invitation email queued with job ID: ${job.id}`);
    return job.id?.toString() || '';
  }
}
