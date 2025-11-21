import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ReprocessingService } from '../services/reprocessing.service';
import { ReprocessingJob } from '../entities/reprocessing-job.entity';
import { StartReprocessingDto } from '../dto/start-reprocessing.dto';
import { AdminGuard } from '../../auth/guards/admin.guard';

/**
 * Controller for managing reprocessing jobs.
 * Handles background reprocessing of DMARC records when third-party sender config changes.
 */
@Controller('reprocessing')
@UseGuards(AdminGuard)
export class ReprocessingController {
  constructor(private readonly reprocessingService: ReprocessingService) {}

  /**
   * Make an ISO date string inclusive by setting time to end of day
   */
  private makeToDateInclusive(dateStr?: string): string | undefined {
    if (!dateStr) {
      return undefined;
    }
    const date = new Date(dateStr);
    date.setHours(23, 59, 59, 999);
    return date.toISOString();
  }

  /**
   * POST /reprocessing/start
   * Start a new reprocessing job
   */
  @Post('start')
  @HttpCode(HttpStatus.ACCEPTED)
  async startReprocessing(
    @Body() dto: StartReprocessingDto,
  ): Promise<ReprocessingJob> {
    const inclusiveTo = this.makeToDateInclusive(dto.dateTo);
    return this.reprocessingService.startReprocessing(
      dto.dateFrom,
      inclusiveTo,
    );
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
