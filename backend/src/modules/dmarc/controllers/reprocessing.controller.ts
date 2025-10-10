import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ReprocessingService } from '../services/reprocessing.service';
import { ReprocessingJob } from '../entities/reprocessing-job.entity';

/**
 * Controller for managing reprocessing jobs.
 * Handles background reprocessing of DMARC records when third-party sender config changes.
 */
@Controller('reprocessing')
export class ReprocessingController {
  constructor(private readonly reprocessingService: ReprocessingService) {}

  /**
   * POST /reprocessing/start
   * Start a new reprocessing job
   */
  @Post('start')
  @HttpCode(HttpStatus.ACCEPTED)
  async startReprocessing(): Promise<ReprocessingJob> {
    return this.reprocessingService.startReprocessing();
  }

  /**
   * POST /reprocessing/cancel/:id
   * Cancel a running reprocessing job
   */
  @Post('cancel/:id')
  @HttpCode(HttpStatus.OK)
  async cancelReprocessing(@Param('id') id: string): Promise<ReprocessingJob> {
    return this.reprocessingService.cancelReprocessing(id);
  }

  /**
   * GET /reprocessing/current
   * Get the current active job (if any)
   */
  @Get('current')
  async getCurrentJob(): Promise<ReprocessingJob | null> {
    return this.reprocessingService.getCurrentJob();
  }

  /**
   * GET /reprocessing/jobs
   * Get all reprocessing jobs (last 50)
   */
  @Get('jobs')
  async findAll(): Promise<ReprocessingJob[]> {
    return this.reprocessingService.findAll();
  }

  /**
   * GET /reprocessing/jobs/:id
   * Get a single reprocessing job
   */
  @Get('jobs/:id')
  async findOne(@Param('id') id: string): Promise<ReprocessingJob> {
    return this.reprocessingService.findOne(id);
  }
}
