import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ReprocessingJob, ReprocessingJobStatus } from '../entities/reprocessing-job.entity';
import { DmarcRecord } from '../entities/dmarc-record.entity';
import { ForwardingDetectionService } from './forwarding-detection.service';
import * as os from 'os';

/**
 * Service for reprocessing DMARC records in the background.
 * This is triggered when third-party sender configurations change.
 * Supports parallel processing with configurable worker count.
 */
@Injectable()
export class ReprocessingService {
  private readonly logger = new Logger(ReprocessingService.name);
  private isProcessing = false;
  private readonly BATCH_SIZE = 100;
  private readonly WORKER_COUNT: number;

  constructor(
    @InjectRepository(ReprocessingJob)
    private readonly jobRepository: Repository<ReprocessingJob>,
    @InjectRepository(DmarcRecord)
    private readonly recordRepository: Repository<DmarcRecord>,
    private readonly forwardingDetectionService: ForwardingDetectionService,
  ) {
    // Calculate worker count: use half of available CPUs by default, or from env variable
    const cpuCount = os.cpus().length;
    const defaultWorkers = Math.max(1, Math.floor(cpuCount / 4));
    this.WORKER_COUNT = parseInt(process.env.REPROCESSING_WORKERS || String(defaultWorkers), 10);
    
    this.logger.log(`Reprocessing service initialized with ${this.WORKER_COUNT} workers (${cpuCount} CPUs available)`);
    
    // Check for interrupted jobs on startup and resume them
    this.resumeInterruptedJob().catch(error => {
      this.logger.error('Failed to resume interrupted job:', error);
    });
  }

  /**
   * Resume an interrupted reprocessing job (e.g., after backend restart)
   */
  private async resumeInterruptedJob(): Promise<void> {
    const runningJob = await this.jobRepository.findOne({
      where: { status: ReprocessingJobStatus.RUNNING },
      order: { createdAt: 'DESC' },
    });

    if (runningJob) {
      this.logger.log(`Found interrupted job ${runningJob.id}, resuming...`);
      
      // Count remaining unprocessed records
      const remainingCount = await this.recordRepository.count({
        where: { reprocessed: false },
      });

      if (remainingCount > 0) {
        this.logger.log(`Resuming job ${runningJob.id} with ${remainingCount} remaining records`);
        // Resume processing (don't await)
        this.processJob(runningJob.id, true).catch(error => {
          this.logger.error(`Failed to resume job ${runningJob.id}:`, error);
        });
      } else {
        // All records were processed, mark job as completed
        this.logger.log(`Job ${runningJob.id} was actually completed, marking as such`);
        runningJob.status = ReprocessingJobStatus.COMPLETED;
        runningJob.completedAt = new Date();
        await this.jobRepository.save(runningJob);
      }
    }
  }

  /**
   * Start a new reprocessing job
   */
  async startReprocessing(): Promise<ReprocessingJob> {
    // Check if there's already a running job
    const runningJob = await this.jobRepository.findOne({
      where: { status: ReprocessingJobStatus.RUNNING },
    });

    if (runningJob) {
      this.logger.warn('A reprocessing job is already running');
      return runningJob;
    }

    // Mark ALL records as not reprocessed (reset for new run)
    this.logger.log('Marking all records as not reprocessed...');
    await this.recordRepository.update({}, { reprocessed: false });

    // Count total records to process
    const totalRecords = await this.recordRepository.count();

    // Create new job
    const job = this.jobRepository.create({
      status: ReprocessingJobStatus.PENDING,
      totalRecords,
      processedRecords: 0,
      forwardedCount: 0,
      notForwardedCount: 0,
      unknownCount: 0,
    });

    const savedJob = await this.jobRepository.save(job);

    // Start processing in background (don't await)
    this.processJob(savedJob.id, false).catch(error => {
      this.logger.error(`Reprocessing job ${savedJob.id} failed:`, error);
    });

    return savedJob;
  }

  /**
   * Get all reprocessing jobs
   */
  async findAll(): Promise<ReprocessingJob[]> {
    return this.jobRepository.find({
      order: { createdAt: 'DESC' },
      take: 50, // Last 50 jobs
    });
  }

  /**
   * Get a single reprocessing job
   */
  async findOne(id: string): Promise<ReprocessingJob> {
    const job = await this.jobRepository.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException(`Reprocessing job ${id} not found`);
    }
    return job;
  }

  /**
   * Get the current active job (if any)
   */
  async getCurrentJob(): Promise<ReprocessingJob | null> {
    return this.jobRepository.findOne({
      where: [
        { status: ReprocessingJobStatus.PENDING },
        { status: ReprocessingJobStatus.RUNNING },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Process a reprocessing job in the background with parallel workers
   * @param jobId The job ID to process
   * @param isResume Whether this is resuming an interrupted job (don't reset records)
   */
  private async processJob(jobId: string, isResume: boolean = false): Promise<void> {
    if (this.isProcessing) {
      this.logger.warn('Another job is already being processed');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      // Load job
      const job = await this.jobRepository.findOne({ where: { id: jobId } });
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      // Update job status to running
      job.status = ReprocessingJobStatus.RUNNING;
      if (!isResume) {
        job.startedAt = new Date();
      }
      await this.jobRepository.save(job);

      const resumeMsg = isResume ? ' (resuming interrupted job)' : '';
      this.logger.log(
        `Starting reprocessing job ${jobId}${resumeMsg} with ${this.WORKER_COUNT} parallel workers`
      );

      // Get all UNPROCESSED record IDs (where reprocessed = false)
      const allIds = await this.recordRepository
        .createQueryBuilder('record')
        .select('record.id')
        .where('record.reprocessed = :reprocessed', { reprocessed: false })
        .orderBy('record.id', 'ASC')
        .getMany();

      const recordIds = allIds.map(r => r.id);
      const totalRecords = recordIds.length;

      if (totalRecords === 0) {
        this.logger.log('No records to process, marking job as completed');
        job.status = ReprocessingJobStatus.COMPLETED;
        job.completedAt = new Date();
        await this.jobRepository.save(job);
        return;
      }

      this.logger.log(`Found ${totalRecords} unprocessed records to process`);

      // Calculate how many records were already processed (if resuming)
      const originalTotal = job.totalRecords || 0;
      const alreadyProcessed = isResume ? (originalTotal - totalRecords) : 0;
      
      if (isResume && alreadyProcessed > 0) {
        this.logger.log(
          `Already processed: ${alreadyProcessed} records (${((alreadyProcessed / originalTotal) * 100).toFixed(1)}%)`
        );
      }

      // Split IDs into chunks for parallel processing
      const chunkSize = Math.ceil(totalRecords / this.WORKER_COUNT);
      const workerChunks: string[][] = [];
      
      for (let i = 0; i < totalRecords; i += chunkSize) {
        workerChunks.push(recordIds.slice(i, i + chunkSize));
      }

      this.logger.log(
        `Split ${totalRecords} records into ${workerChunks.length} chunks of ~${chunkSize} records each`
      );

      // Shared counters (will be updated from worker results)
      // When resuming, start from the current counts
      let totalProcessed = alreadyProcessed;
      let forwardedCount = job.forwardedCount || 0;
      let notForwardedCount = job.notForwardedCount || 0;
      let unknownCount = job.unknownCount || 0;
      let lastProgressUpdate = Date.now();

      // Process chunks in parallel
      const workerPromises = workerChunks.map(async (chunk, workerIndex) => {
        return this.processChunk(chunk, workerIndex, async (stats) => {
          // Update shared counters
          totalProcessed += stats.processed;
          forwardedCount += stats.forwarded;
          notForwardedCount += stats.notForwarded;
          unknownCount += stats.unknown;

          // Update job progress (throttled to avoid too many DB writes)
          const now = Date.now();
          if (now - lastProgressUpdate > 2000) { // Update every 2 seconds
            lastProgressUpdate = now;
            job.processedRecords = totalProcessed;
            job.forwardedCount = forwardedCount;
            job.notForwardedCount = notForwardedCount;
            job.unknownCount = unknownCount;
            await this.jobRepository.save(job);

            // Use original total for progress calculation
            const progress = ((totalProcessed / originalTotal) * 100).toFixed(1);
            this.logger.log(
              `Reprocessing progress: ${progress}% (${totalProcessed}/${originalTotal}) - ` +
              `Forwarded: ${forwardedCount}, Not Forwarded: ${notForwardedCount}, Unknown: ${unknownCount}`
            );
          }
        });
      });

      // Wait for all workers to complete
      await Promise.all(workerPromises);

      // Mark job as completed
      job.status = ReprocessingJobStatus.COMPLETED;
      job.completedAt = new Date();
      job.processedRecords = totalProcessed;
      job.forwardedCount = forwardedCount;
      job.notForwardedCount = notForwardedCount;
      job.unknownCount = unknownCount;
      await this.jobRepository.save(job);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const recordsPerSecond = (totalProcessed / ((Date.now() - startTime) / 1000)).toFixed(1);
      this.logger.log(
        `Reprocessing job ${jobId} completed in ${elapsed}s (${recordsPerSecond} records/sec). ` +
        `Forwarded: ${forwardedCount}, Not Forwarded: ${notForwardedCount}, Unknown: ${unknownCount}`
      );

    } catch (error) {
      this.logger.error(`Reprocessing job ${jobId} failed:`, error);

      // Mark job as failed
      try {
        const job = await this.jobRepository.findOne({ where: { id: jobId } });
        if (job) {
          job.status = ReprocessingJobStatus.FAILED;
          job.errorMessage = error instanceof Error ? error.message : String(error);
          job.completedAt = new Date();
          await this.jobRepository.save(job);
        }
      } catch (updateError) {
        this.logger.error(`Failed to update job status:`, updateError);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a chunk of records (worker function)
   */
  private async processChunk(
    recordIds: string[],
    workerIndex: number,
    onProgress: (stats: { processed: number; forwarded: number; notForwarded: number; unknown: number }) => Promise<void>
  ): Promise<void> {
    let forwarded = 0;
    let notForwarded = 0;
    let unknown = 0;
    let processed = 0;

    // Process in smaller batches to avoid loading too much into memory
    const batchSize = this.BATCH_SIZE;
    
    for (let i = 0; i < recordIds.length; i += batchSize) {
      const batchIds = recordIds.slice(i, i + batchSize);
      
      // Fetch records with relations
      const records = await this.recordRepository.find({
        where: { id: In(batchIds) },
        relations: ['dkimResults', 'spfResults', 'policyOverrideReasons'],
      });

      // Process each record
      const updatePromises = records.map(async (record) => {
        try {
          const result = await this.forwardingDetectionService.detectForwarding(record);
          
          // Update record with new forwarding detection results
          record.isForwarded = result.isForwarded;
          record.forwardReason = result.reason;
          record.reprocessed = true; // Mark as reprocessed
          
          // Save asynchronously
          await this.recordRepository.save(record);

          // Update local counters
          if (result.isForwarded === true) {
            forwarded++;
          } else if (result.isForwarded === false) {
            notForwarded++;
          } else {
            unknown++;
          }
          
          processed++;
        } catch (error) {
          this.logger.error(`Worker ${workerIndex}: Failed to process record ${record.id}:`, error);
          // Still mark as processed to avoid infinite retries
          record.reprocessed = true;
          await this.recordRepository.save(record);
          processed++;
        }
      });

      // Wait for all records in this batch to complete
      await Promise.all(updatePromises);

      // Report progress
      await onProgress({ processed, forwarded, notForwarded, unknown });
      
      // Reset counters (they've been added to shared counters)
      forwarded = 0;
      notForwarded = 0;
      unknown = 0;
      processed = 0;
    }
  }
}
