import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DmarcRecord, GeoLookupStatus } from '../entities/dmarc-record.entity';
import { GeolocationService } from './geolocation.service';
import { RateLimitError } from '../interfaces/ip-lookup-provider.interface';
import { IpLookupProviderType } from '../config/ip-lookup.config';

interface QueuedIpLookup {
  ip: string;
  recordIds: string[]; // Multiple records may have the same IP
  priority: number; // 0 = high, 1 = normal, 2 = low
  retries: number;
  failedAttempts: number; // Non-rate-limit failures
}

@Injectable()
export class IpLookupQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IpLookupQueueService.name);
  private queue: QueuedIpLookup[] = [];
  private processing = false;
  private readonly PROCESS_INTERVAL_MS = 1000; // Wait time after API calls

  constructor(
    @InjectRepository(DmarcRecord)
    private dmarcRecordRepository: Repository<DmarcRecord>,
    private readonly geolocationService: GeolocationService,
  ) {}

  async onModuleInit() {
    // Load and queue any pending IPs from the database
    this.logger.log('Checking for pending IP lookups on startup...');
    try {
      const count = await this.processPendingLookups(100000); // Process up to 100000 on startup
      if (count > 0) {
        this.logger.log(`Queued ${count} pending IPs for lookup`);
      }
    } catch (error) {
      this.logger.error('Failed to load pending lookups on startup', error);
    }
  }

  async onModuleDestroy() {
    // Nothing to clean up - event-driven processing
    this.logger.log('IP lookup queue service shutting down');
  }

  /**
   * Queue an IP for lookup without blocking
   * @param ip - The IP address to lookup
   * @param recordIds - The DMARC record IDs that use this IP
   * @param priority - 0 = high, 1 = normal, 2 = low
   */
  async queueIpLookup(
    ip: string,
    recordIds: string[],
    priority: number = 1,
  ): Promise<void> {
    // Check if this IP is already in the queue
    const existing = this.queue.find((item) => item.ip === ip);

    if (existing) {
      // Add record IDs to existing queue item
      existing.recordIds = [...new Set([...existing.recordIds, ...recordIds])];
      // Upgrade priority if needed
      existing.priority = Math.min(existing.priority, priority);
      this.logger.debug(
        `IP ${ip} already queued, added ${recordIds.length} more records`,
      );
    } else {
      // Add new item to queue
      this.queue.push({
        ip,
        recordIds,
        priority,
        retries: 0,
        failedAttempts: 0,
      });
      this.logger.debug(
        `Queued IP ${ip} for lookup (${recordIds.length} records)`,
      );
    }

    // Sort queue by priority
    this.queue.sort((a, b) => a.priority - b.priority);

    // Trigger processing (event-driven, only when items are added)
    this.triggerProcessing();
  }

  /**
   * Queue multiple IPs at once
   */
  async queueMultipleIps(
    items: Array<{ ip: string; recordIds: string[]; priority?: number }>,
  ): Promise<void> {
    // Add all items to queue without triggering processing each time
    for (const item of items) {
      const ip = item.ip;
      const recordIds = item.recordIds;
      const priority = item.priority || 1;

      // Check if this IP is already in the queue
      const existing = this.queue.find((qItem) => qItem.ip === ip);

      if (existing) {
        // Add record IDs to existing queue item
        existing.recordIds = [
          ...new Set([...existing.recordIds, ...recordIds]),
        ];
        // Upgrade priority if needed
        existing.priority = Math.min(existing.priority, priority);
      } else {
        // Add new item to queue
        this.queue.push({
          ip,
          recordIds,
          priority,
          retries: 0,
          failedAttempts: 0,
        });
      }
    }

    // Sort queue by priority once after all items are added
    this.queue.sort((a, b) => a.priority - b.priority);

    this.logger.log(`Queued ${items.length} IPs for lookup`);

    // Trigger processing once after all items are queued
    this.triggerProcessing();
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    queueSize: number;
    processing: boolean;
    itemsByPriority: { high: number; normal: number; low: number };
    uniqueIps: number;
    totalRecords: number;
  } {
    const itemsByPriority = {
      high: this.queue.filter((item) => item.priority === 0).length,
      normal: this.queue.filter((item) => item.priority === 1).length,
      low: this.queue.filter((item) => item.priority === 2).length,
    };

    const totalRecords = this.queue.reduce(
      (sum, item) => sum + item.recordIds.length,
      0,
    );

    return {
      queueSize: this.queue.length,
      processing: this.processing,
      itemsByPriority,
      uniqueIps: this.queue.length,
      totalRecords,
    };
  }

  /**
   * Trigger queue processing (event-driven, no continuous polling)
   */
  private triggerProcessing(): void {
    // If already processing, the current processing loop will continue
    // No need to trigger again - it will check queue after current item
    if (this.processing) {
      return;
    }
    // Use setImmediate to avoid blocking the current execution
    setImmediate(() => {
      void this.processQueue();
    });
  }

  /**
   * Schedule next processing cycle after a delay
   * @param delay - Delay in milliseconds before processing next item
   */
  private scheduleNextProcessing(delay: number): void {
    setTimeout(() => {
      this.processing = false;
      if (this.queue.length > 0) {
        this.triggerProcessing();
      }
    }, delay);
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      const item = this.queue[0]; // Get highest priority item

      // Check if we can make a request (rate limit check)
      const providerStats = this.geolocationService.getProviderStats();
      const currentProvider = this.geolocationService.getConfig().provider;
      const currentStats = providerStats[currentProvider];

      // Simple rate limit check (can be enhanced)
      if (currentStats?.usage) {
        const { minuteRequests, minuteLimit, dailyRequests, dailyLimit } =
          currentStats.usage;

        if (
          (minuteLimit && minuteRequests >= minuteLimit) ||
          (dailyLimit && dailyRequests >= dailyLimit)
        ) {
          this.logger.debug(
            `Rate limit approaching for ${currentProvider}, waiting...`,
          );
          this.processing = false;
          return;
        }
      }

      // Process the lookup (returns wasApiCall and shouldRemoveFromQueue)
      const { wasApiCall, shouldRemoveFromQueue } =
        await this.processIpLookup(item);

      if (shouldRemoveFromQueue) {
        // Remove from queue - processing was successful
        this.queue.shift();

        // If it was an API call, wait before processing next item
        // If it was a cache hit, process next item immediately
        if (wasApiCall) {
          // Wait before processing next item to respect rate limits
          this.scheduleNextProcessing(this.PROCESS_INTERVAL_MS);
        } else {
          // Cache hit - process next item immediately
          this.processing = false;
          if (this.queue.length > 0) {
            this.triggerProcessing();
          }
        }
      } else {
        // Item needs to be retried - move to end of queue and wait
        this.queue.shift();
        this.queue.push(item);
        // Wait before retrying to avoid tight loop
        this.scheduleNextProcessing(this.PROCESS_INTERVAL_MS);
      }
    } catch (error) {
      this.logger.error(
        `Error processing queue: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Retry after a delay on error
      this.scheduleNextProcessing(this.PROCESS_INTERVAL_MS);
    }
  }

  /**
   * Process a single IP lookup
   * @returns object with wasApiCall and shouldRemoveFromQueue flags
   */
  private async processIpLookup(
    item: QueuedIpLookup,
  ): Promise<{ wasApiCall: boolean; shouldRemoveFromQueue: boolean }> {
    try {
      this.logger.debug(
        `Looking up IP ${item.ip} for ${item.recordIds.length} records`,
      );

      // Mark records as processing
      await this.updateRecordsStatus(
        item.recordIds,
        GeoLookupStatus.PROCESSING,
      );

      // Check if we'll hit cache by checking provider stats before and after
      const statsBefore = this.geolocationService.getProviderStats();
      const currentProvider = this.geolocationService.getConfig().provider;
      const requestsBefore =
        statsBefore[currentProvider]?.usage?.minuteRequests || 0;

      // Perform the lookup
      const geoData = await this.geolocationService.getLocationForIp(item.ip);

      // Check if API was actually called
      const statsAfter = this.geolocationService.getProviderStats();
      const requestsAfter =
        statsAfter[currentProvider]?.usage?.minuteRequests || 0;
      const wasApiCall = requestsAfter > requestsBefore;

      if (!geoData) {
        this.logger.warn(`No geolocation data found for IP ${item.ip}`);
        // Mark as failed (not completed, but no data available)
        await this.updateRecordsStatus(
          item.recordIds,
          GeoLookupStatus.FAILED,
          'No data available',
        );
        return { wasApiCall, shouldRemoveFromQueue: true };
      }

      // Update all records with this IP
      await this.updateRecordsWithGeoData(item.recordIds, geoData);

      const cacheStatus = wasApiCall ? '(API call)' : '(cache hit)';
      this.logger.debug(
        `Successfully updated ${item.recordIds.length} records with geo data for IP ${item.ip} ${cacheStatus}`,
      );

      return { wasApiCall, shouldRemoveFromQueue: true };
    } catch (error) {
      // Handle rate limit errors differently - keep in queue without penalty
      if (error instanceof RateLimitError) {
        this.logger.warn(`Rate limited for IP ${item.ip}, will retry later`);

        // Downgrade priority to let other IPs process first
        item.priority = 2;

        // Don't mark records as failed, keep them as pending/processing
        await this.updateRecordsStatus(item.recordIds, GeoLookupStatus.PENDING);

        this.logger.debug(
          `Keeping IP ${item.ip} in queue after rate limit (will retry)`,
        );
        // Don't remove from queue, will be retried later
        return { wasApiCall: true, shouldRemoveFromQueue: false };
      }

      // Handle other errors with retry logic
      this.logger.error(
        `Failed to lookup IP ${item.ip}: ${error instanceof Error ? error.message : String(error)}`,
      );

      item.failedAttempts++;

      // Mark as failed
      await this.updateRecordsStatus(
        item.recordIds,
        GeoLookupStatus.FAILED,
        error instanceof Error ? error.message : String(error),
      );

      // Retry logic for non-rate-limit errors
      // After multiple failures, try geoip-lite as last resort
      const MAX_FAILED_ATTEMPTS = 3;

      if (item.failedAttempts < MAX_FAILED_ATTEMPTS) {
        item.retries++;
        item.priority = Math.min(item.priority + 1, 2); // Downgrade priority
        // Reset status back to pending for retry
        await this.updateRecordsStatus(item.recordIds, GeoLookupStatus.PENDING);
        this.logger.debug(
          `Keeping IP ${item.ip} in queue (failed attempt ${item.failedAttempts}/${MAX_FAILED_ATTEMPTS})`,
        );
        // Don't remove from queue, will be retried
        return { wasApiCall: true, shouldRemoveFromQueue: false };
      } else {
        // After MAX_FAILED_ATTEMPTS, try geoip-lite as last resort if not already configured
        const config = this.geolocationService.getConfig();
        const hasGeoipLiteFallback = config.fallbackProviders?.includes(
          IpLookupProviderType.GEOIP_LITE,
        );

        if (
          !hasGeoipLiteFallback &&
          item.failedAttempts === MAX_FAILED_ATTEMPTS
        ) {
          this.logger.warn(
            `Trying geoip-lite as last resort for IP ${item.ip} after ${MAX_FAILED_ATTEMPTS} failures`,
          );

          // Temporarily add geoip-lite and try one more time
          const originalFallbacks = config.fallbackProviders || [];
          this.geolocationService.setConfig({
            ...config,
            fallbackProviders: [
              ...originalFallbacks,
              IpLookupProviderType.GEOIP_LITE,
            ],
          });

          item.retries++;
          item.priority = 2; // Low priority
          await this.updateRecordsStatus(
            item.recordIds,
            GeoLookupStatus.PENDING,
          );

          // Restore original config after this attempt
          setTimeout(() => {
            this.geolocationService.setConfig({
              ...config,
              fallbackProviders: originalFallbacks,
            });
          }, 100);

          // Keep in queue for one more attempt with geoip-lite
          return { wasApiCall: true, shouldRemoveFromQueue: false };
        } else {
          this.logger.error(`Max retries reached for IP ${item.ip}, giving up`);
          // Remove from queue, we've exhausted all options
          return { wasApiCall: true, shouldRemoveFromQueue: true };
        }
      }

      return { wasApiCall: true, shouldRemoveFromQueue: true }; // Errors typically happen during API calls
    }
  }

  /**
   * Update DMARC records with geolocation data
   */
  private async updateRecordsWithGeoData(
    recordIds: string[],
    geoData: any,
  ): Promise<void> {
    await this.dmarcRecordRepository.update(recordIds, {
      geoCountry: geoData.country || null,
      geoCountryName: geoData.countryName || null,
      geoCity: geoData.city || null,
      geoLatitude: geoData.latitude || null,
      geoLongitude: geoData.longitude || null,
      geoIsp: geoData.isp || null,
      geoOrg: geoData.org || null,
      geoLookupStatus: GeoLookupStatus.COMPLETED,
      geoLookupCompletedAt: new Date(),
      geoLookupAttempts: () => '"geoLookupAttempts" + 1',
      geoLookupLastAttempt: new Date(),
    });
  }

  /**
   * Update records status
   */
  private async updateRecordsStatus(
    recordIds: string[],
    status: GeoLookupStatus,
    errorMessage?: string,
  ): Promise<void> {
    const updateData: any = {
      geoLookupStatus: status,
      geoLookupLastAttempt: new Date(),
      geoLookupAttempts: () => '"geoLookupAttempts" + 1',
    };

    if (status === GeoLookupStatus.COMPLETED) {
      updateData.geoLookupCompletedAt = new Date();
    }

    await this.dmarcRecordRepository.update(recordIds, updateData);

    if (errorMessage) {
      this.logger.warn(
        `Records ${recordIds.join(', ')} marked as ${status}: ${errorMessage}`,
      );
    }
  }

  /**
   * Process all pending lookups for records without geo data
   * Useful for backfilling existing records
   */
  async processPendingLookups(limit: number = 1000): Promise<number> {
    this.logger.log(`Processing pending lookups (limit: ${limit})`);

    // Find records with pending or failed status
    const records = await this.dmarcRecordRepository
      .createQueryBuilder('record')
      .where('record.sourceIp IS NOT NULL')
      .andWhere(
        '(record.geoLookupStatus = :pending OR record.geoLookupStatus = :failed OR record.geoLookupStatus IS NULL)',
        { pending: GeoLookupStatus.PENDING, failed: GeoLookupStatus.FAILED },
      )
      .limit(limit)
      .getMany();

    if (records.length === 0) {
      this.logger.log('No pending lookups found');
      return 0;
    }

    // Group records by IP
    const ipMap = new Map<string, string[]>();
    for (const record of records) {
      if (!record.sourceIp) {
        continue;
      }

      if (!ipMap.has(record.sourceIp)) {
        ipMap.set(record.sourceIp, []);
      }
      ipMap.get(record.sourceIp)!.push(record.id);
    }

    // Queue all IPs
    const items = Array.from(ipMap.entries()).map(([ip, recordIds]) => ({
      ip,
      recordIds,
      priority: 2, // Low priority for backfill
    }));

    await this.queueMultipleIps(items);

    this.logger.log(
      `Queued ${items.length} unique IPs for ${records.length} records`,
    );

    return records.length;
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    const queueSize = this.queue.length;
    this.queue = [];
    this.logger.log(`Cleared queue (${queueSize} items removed)`);
  }
}
