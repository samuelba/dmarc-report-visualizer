import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { SendEmailOptions } from './email.service';

@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);

  constructor(
    @InjectQueue('email')
    private readonly emailQueue: Queue,
  ) {}

  /**
   * Queue an email for asynchronous sending
   * @param options Email options
   * @returns Job ID
   */
  async queueEmail(options: SendEmailOptions): Promise<string> {
    this.logger.log(`Queueing email to ${options.to}: ${options.subject}`);

    const job = await this.emailQueue.add('send-email', options, {
      attempts: 3, // Retry up to 3 times
      backoff: {
        type: 'exponential',
        delay: 1000, // Start with 1 second, then 2s, 4s
      },
      removeOnComplete: true, // Clean up completed jobs
      removeOnFail: false, // Keep failed jobs for debugging
    });

    this.logger.log(`Email queued with job ID: ${job.id}`);
    return job.id.toString();
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

    const job = await this.emailQueue.add(
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
    return job.id.toString();
  }
}
