import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
export class IpLookupQueueService implements OnModuleInit {
  private readonly logger = new Logger(IpLookupQueueService.name);
  private queue: QueuedIpLookup[] = [];
  private processing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly PROCESS_INTERVAL_MS = 1000; // Check queue every second
  private readonly MAX_RETRIES = 3;

  constructor(
    @InjectRepository(DmarcRecord)
    private dmarcRecordRepository: Repository<DmarcRecord>,
    private readonly geolocationService: GeolocationService,
  ) {}

  async onModuleInit() {
    // Start the background processor
    this.startProcessor();

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
  }

  /**
   * Queue multiple IPs at once
   */
  async queueMultipleIps(
    items: Array<{ ip: string; recordIds: string[]; priority?: number }>,
  ): Promise<void> {
    for (const item of items) {
      await this.queueIpLookup(item.ip, item.recordIds, item.priority || 1);
    }
    this.logger.log(`Queued ${items.length} IPs for lookup`);
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
   * Start the background processor
   */
  private startProcessor(): void {
    if (this.processingInterval) {
      return; // Already started
    }

    this.logger.log('Starting IP lookup queue processor');
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, this.PROCESS_INTERVAL_MS);
  }

  /**
   * Stop the background processor
   */
  stopProcessor(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      this.logger.log('Stopped IP lookup queue processor');
    }
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

      // Process the lookup
      await this.processIpLookup(item);

      // Remove from queue
      this.queue.shift();
    } catch (error) {
      this.logger.error(
        `Error processing queue: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process a single IP lookup
   */
  private async processIpLookup(item: QueuedIpLookup): Promise<void> {
    try {
      this.logger.debug(
        `Looking up IP ${item.ip} for ${item.recordIds.length} records`,
      );

      // Mark records as processing
      await this.updateRecordsStatus(
        item.recordIds,
        GeoLookupStatus.PROCESSING,
      );

      // Perform the lookup
      const geoData = await this.geolocationService.getLocationForIp(item.ip);

      if (!geoData) {
        this.logger.warn(`No geolocation data found for IP ${item.ip}`);
        // Mark as failed (not completed, but no data available)
        await this.updateRecordsStatus(
          item.recordIds,
          GeoLookupStatus.FAILED,
          'No data available',
        );
        return;
      }

      // Update all records with this IP
      await this.updateRecordsWithGeoData(item.recordIds, geoData);

      this.logger.debug(
        `Successfully updated ${item.recordIds.length} records with geo data for IP ${item.ip}`,
      );
    } catch (error) {
      // Handle rate limit errors differently - put back in queue without penalty
      if (error instanceof RateLimitError) {
        this.logger.warn(`Rate limited for IP ${item.ip}, will retry later`);

        // Put item back at the end of the queue without incrementing failure counter
        item.priority = 2; // Set to low priority to let other IPs process
        this.queue.push(item);

        // Don't mark records as failed, keep them as pending/processing
        await this.updateRecordsStatus(item.recordIds, GeoLookupStatus.PENDING);

        this.logger.debug(
          `Re-queued IP ${item.ip} after rate limit (will wait)`,
        );
        return;
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
        this.queue.push(item); // Add back to queue
        // Reset status back to pending for retry
        await this.updateRecordsStatus(item.recordIds, GeoLookupStatus.PENDING);
        this.logger.debug(
          `Re-queued IP ${item.ip} (failed attempt ${item.failedAttempts}/${MAX_FAILED_ATTEMPTS})`,
        );
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
          this.queue.push(item);
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
        } else {
          this.logger.error(`Max retries reached for IP ${item.ip}, giving up`);
        }
      }
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
