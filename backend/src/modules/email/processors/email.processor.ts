import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import {
  EmailService,
  SendEmailOptions,
  SendEmailResult,
} from '../services/email.service';

/**
 * Error codes that indicate transient failures that should be retried
 */
const TRANSIENT_ERROR_CODES = [
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ENETUNREACH',
  'EAI_AGAIN',
];

/**
 * Error messages that indicate transient failures
 */
const TRANSIENT_ERROR_PATTERNS = [
  /timeout/i,
  /connection.*refused/i,
  /connection.*reset/i,
  /network.*unreachable/i,
  /temporary.*failure/i,
  /try.*again/i,
];

/**
 * Error codes that indicate permanent failures that should not be retried
 */
const PERMANENT_ERROR_CODES = [
  'EAUTH', // Authentication failed
];

/**
 * Error messages that indicate permanent failures
 */
const PERMANENT_ERROR_PATTERNS = [
  /authentication.*failed/i,
  /invalid.*credentials/i,
  /invalid.*email/i,
  /recipient.*rejected/i,
  /mailbox.*not.*found/i,
  /user.*unknown/i,
];

@Processor('email')
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {}

  /**
   * Determine if an error is transient (should retry) or permanent (should not retry)
   */
  private isTransientError(error: any): boolean {
    if (!error) {
      return false;
    }

    // Check error code
    if (error.code && TRANSIENT_ERROR_CODES.includes(error.code as string)) {
      return true;
    }

    if (error.code && PERMANENT_ERROR_CODES.includes(error.code as string)) {
      return false;
    }

    // Check error message
    const errorMessage = error.message || String(error);

    // Check for permanent error patterns first
    for (const pattern of PERMANENT_ERROR_PATTERNS) {
      if (pattern.test(errorMessage as string)) {
        return false;
      }
    }

    // Check for transient error patterns
    for (const pattern of TRANSIENT_ERROR_PATTERNS) {
      if (pattern.test(errorMessage as string)) {
        return true;
      }
    }

    // Default to transient for unknown errors (safer to retry)
    return true;
  }

  /**
   * Process an email job from the queue
   */
  @Process('send-email')
  async processEmail(job: Job<SendEmailOptions>): Promise<SendEmailResult> {
    const { to, subject } = job.data;
    const attemptNumber = job.attemptsMade + 1;

    this.logger.log(
      `Processing email job ${job.id} (attempt ${attemptNumber}/${job.opts.attempts}): ${subject} to ${to}`,
    );

    try {
      // Send the email
      const result = await this.emailService.sendEmail(job.data);

      if (result.success) {
        this.logger.log(
          `Email job ${job.id} completed successfully: ${subject} to ${to}`,
        );
        return result;
      } else {
        // Email service returned a failure
        this.logger.error(`Email job ${job.id} failed: ${result.error}`);

        // Determine if we should retry
        const isTransient = this.isTransientError({ message: result.error });

        if (!isTransient) {
          // Permanent error - don't retry
          this.logger.error(
            `Email job ${job.id} failed with permanent error, not retrying: ${result.error}`,
          );
          throw new Error(`Permanent error: ${result.error}`);
        }

        // Transient error - will retry based on job configuration
        if (attemptNumber < (job.opts.attempts || 1)) {
          this.logger.warn(
            `Email job ${job.id} failed with transient error, will retry: ${result.error}`,
          );
        } else {
          this.logger.error(
            `Email job ${job.id} failed after all retry attempts: ${result.error}`,
          );
        }

        throw new Error(result.error);
      }
    } catch (error) {
      // Unexpected error during processing
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Email job ${job.id} encountered error: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Determine if we should retry
      const isTransient = this.isTransientError(error);

      if (!isTransient) {
        this.logger.error(
          `Email job ${job.id} failed with permanent error, not retrying: ${errorMessage}`,
        );
      } else if (attemptNumber >= (job.opts.attempts || 1)) {
        this.logger.error(
          `Email job ${job.id} failed after all retry attempts: ${errorMessage}`,
        );
      } else {
        this.logger.warn(
          `Email job ${job.id} failed with transient error, will retry: ${errorMessage}`,
        );
      }

      // Re-throw to let Bull handle retry logic
      throw error;
    }
  }

  /**
   * Process an invite email job from the queue
   */
  @Process('send-invite-email')
  async processInviteEmail(
    job: Job<{ email: string; token: string; inviterName: string }>,
  ): Promise<SendEmailResult> {
    const { email, token, inviterName } = job.data;
    const attemptNumber = job.attemptsMade + 1;

    this.logger.log(
      `Processing invite email job ${job.id} (attempt ${attemptNumber}/${job.opts.attempts}): to ${email}`,
    );

    try {
      // Send the invite email using the template
      const result = await this.emailService.sendInviteEmail(
        email,
        token,
        inviterName,
      );

      if (result.success) {
        this.logger.log(
          `Invite email job ${job.id} completed successfully: to ${email}`,
        );
        return result;
      } else {
        // Email service returned a failure
        this.logger.error(`Invite email job ${job.id} failed: ${result.error}`);

        // Determine if we should retry
        const isTransient = this.isTransientError({ message: result.error });

        if (!isTransient) {
          // Permanent error - don't retry
          this.logger.error(
            `Invite email job ${job.id} failed with permanent error, not retrying: ${result.error}`,
          );
          throw new Error(`Permanent error: ${result.error}`);
        }

        // Transient error - will retry based on job configuration
        if (attemptNumber < (job.opts.attempts || 1)) {
          this.logger.warn(
            `Invite email job ${job.id} failed with transient error, will retry: ${result.error}`,
          );
        } else {
          this.logger.error(
            `Invite email job ${job.id} failed after all retry attempts: ${result.error}`,
          );
        }

        throw new Error(result.error);
      }
    } catch (error) {
      // Unexpected error during processing
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Invite email job ${job.id} encountered error: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Determine if we should retry
      const isTransient = this.isTransientError(error);

      if (!isTransient) {
        this.logger.error(
          `Invite email job ${job.id} failed with permanent error, not retrying: ${errorMessage}`,
        );
      } else if (attemptNumber >= (job.opts.attempts || 1)) {
        this.logger.error(
          `Invite email job ${job.id} failed after all retry attempts: ${errorMessage}`,
        );
      } else {
        this.logger.warn(
          `Invite email job ${job.id} failed with transient error, will retry: ${errorMessage}`,
        );
      }

      // Re-throw to let Bull handle retry logic
      throw error;
    }
  }
}
