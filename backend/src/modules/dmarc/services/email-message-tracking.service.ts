import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EmailMessageTracking,
  EmailSource,
  ProcessingStatus,
} from '../entities/email-message-tracking.entity';

@Injectable()
export class EmailMessageTrackingService {
  private readonly logger = new Logger(EmailMessageTrackingService.name);

  constructor(
    @InjectRepository(EmailMessageTracking)
    private readonly trackingRepository: Repository<EmailMessageTracking>,
  ) {}

  /**
   * Check if a message has already been processed
   */
  async isProcessed(
    messageId: string,
    source: EmailSource,
    accountIdentifier: string,
  ): Promise<boolean> {
    const tracking = await this.trackingRepository.findOne({
      where: {
        messageId,
        source,
        accountIdentifier,
      },
    });

    return tracking !== null && tracking.status === ProcessingStatus.SUCCESS;
  }

  /**
   * Check if a message exists (regardless of status)
   */
  async exists(
    messageId: string,
    source: EmailSource,
    accountIdentifier: string,
  ): Promise<boolean> {
    const count = await this.trackingRepository.count({
      where: {
        messageId,
        source,
        accountIdentifier,
      },
    });

    return count > 0;
  }

  /**
   * Mark a message as processing
   */
  async markProcessing(
    messageId: string,
    source: EmailSource,
    accountIdentifier: string,
  ): Promise<EmailMessageTracking> {
    let tracking = await this.trackingRepository.findOne({
      where: {
        messageId,
        source,
        accountIdentifier,
      },
    });

    if (!tracking) {
      tracking = this.trackingRepository.create({
        messageId,
        source,
        accountIdentifier,
        status: ProcessingStatus.PROCESSING,
        attemptCount: 1,
        lastAttemptAt: new Date(),
      });
    } else {
      tracking.status = ProcessingStatus.PROCESSING;
      tracking.attemptCount += 1;
      tracking.lastAttemptAt = new Date();
    }

    return await this.trackingRepository.save(tracking);
  }

  /**
   * Mark a message as successfully processed
   */
  async markSuccess(
    messageId: string,
    source: EmailSource,
    accountIdentifier: string,
    reportId?: string,
  ): Promise<EmailMessageTracking> {
    let tracking = await this.trackingRepository.findOne({
      where: {
        messageId,
        source,
        accountIdentifier,
      },
    });

    if (!tracking) {
      tracking = this.trackingRepository.create({
        messageId,
        source,
        accountIdentifier,
        status: ProcessingStatus.SUCCESS,
        processedAt: new Date(),
        attemptCount: 1,
        reportId,
      });
    } else {
      tracking.status = ProcessingStatus.SUCCESS;
      tracking.processedAt = new Date();
      tracking.errorMessage = null;
      if (reportId) {
        tracking.reportId = reportId;
      }
    }

    return await this.trackingRepository.save(tracking);
  }

  /**
   * Mark a message as failed
   */
  async markFailed(
    messageId: string,
    source: EmailSource,
    accountIdentifier: string,
    errorMessage: string,
  ): Promise<EmailMessageTracking> {
    let tracking = await this.trackingRepository.findOne({
      where: {
        messageId,
        source,
        accountIdentifier,
      },
    });

    if (!tracking) {
      tracking = this.trackingRepository.create({
        messageId,
        source,
        accountIdentifier,
        status: ProcessingStatus.FAILED,
        attemptCount: 1,
        lastAttemptAt: new Date(),
        errorMessage,
      });
    } else {
      tracking.status = ProcessingStatus.FAILED;
      tracking.lastAttemptAt = new Date();
      tracking.errorMessage = errorMessage;
    }

    return await this.trackingRepository.save(tracking);
  }

  /**
   * Get tracking record for a message
   */
  async getTracking(
    messageId: string,
    source: EmailSource,
    accountIdentifier: string,
  ): Promise<EmailMessageTracking | null> {
    return await this.trackingRepository.findOne({
      where: {
        messageId,
        source,
        accountIdentifier,
      },
    });
  }

  @Cron('0 0 3 * * *') // Daily at 3 AM
  async scheduledCleanup(): Promise<void> {
    this.logger.log('Starting email tracking cleanup job');

    try {
      await this.cleanupOldRecords();
      this.logger.log('Email tracking cleanup completed successfully');
    } catch (error) {
      this.logger.error(
        'Email tracking cleanup failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Clean up old successful tracking records
   */
  async cleanupOldRecords(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.trackingRepository
      .createQueryBuilder()
      .delete()
      .where('status = :status', { status: ProcessingStatus.SUCCESS })
      .andWhere('processedAt < :cutoffDate', { cutoffDate })
      .execute();

    this.logger.log(
      `Cleaned up ${result.affected || 0} old email tracking records`,
    );
    return result.affected || 0;
  }
}
