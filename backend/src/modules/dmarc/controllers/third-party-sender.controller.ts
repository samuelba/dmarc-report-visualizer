import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UsePipes,
  UseGuards,
} from '@nestjs/common';
import {
  ThirdPartySenderService,
  CreateThirdPartySenderDto,
  UpdateThirdPartySenderDto,
} from '../services/third-party-sender.service';
import { ThirdPartySender } from '../entities/third-party-sender.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

/**
 * Controller for managing third-party sender configurations.
 * Provides endpoints for CRUD operations on third-party sender patterns.
 */
@Controller('settings/third-party-senders')
@UseGuards(JwtAuthGuard)
export class ThirdPartySenderController {
  constructor(
    private readonly thirdPartySenderService: ThirdPartySenderService,
  ) {}

  /**
   * GET /settings/third-party-senders
   * Get all third-party sender configurations
   */
  @Get()
  async findAll(): Promise<ThirdPartySender[]> {
    return this.thirdPartySenderService.findAll();
  }

  /**
   * GET /settings/third-party-senders/:id
   * Get a single third-party sender by ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ThirdPartySender> {
    return this.thirdPartySenderService.findOne(id);
  }

  /**
   * POST /settings/third-party-senders
   * Create a new third-party sender configuration
   */
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async create(
    @Body() dto: CreateThirdPartySenderDto,
  ): Promise<ThirdPartySender> {
    return this.thirdPartySenderService.create(dto);
  }

  /**
   * PUT /settings/third-party-senders/:id
   * Update an existing third-party sender configuration
   */
  @Put(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateThirdPartySenderDto,
  ): Promise<ThirdPartySender> {
    return this.thirdPartySenderService.update(id, dto);
  }

  /**
   * DELETE /settings/third-party-senders/:id
   * Delete a third-party sender configuration
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    return this.thirdPartySenderService.delete(id);
  }
}
