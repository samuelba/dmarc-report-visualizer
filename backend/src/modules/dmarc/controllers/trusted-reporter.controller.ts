import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { TrustReporterDto } from '../dto/trusted-reporter.dto';
import { TrustedReporterDomain } from '../entities/trusted-reporter-domain.entity';
import {
  TrustedReporterService,
  UnalignedSender,
} from '../services/trusted-reporter.service';

type AuthenticatedRequest = Request & { user: { id: string; email: string } };

/** Admin review of reporters authenticated by another domain than they claim. */
@Controller('settings/trusted-reporters')
@UseGuards(AdminGuard)
export class TrustedReporterController {
  constructor(private readonly trustedReporters: TrustedReporterService) {}

  @Get('unaligned')
  listUnaligned(): Promise<UnalignedSender[]> {
    return this.trustedReporters.listUnaligned();
  }

  @Get()
  listTrusted(): Promise<TrustedReporterDomain[]> {
    return this.trustedReporters.listTrusted();
  }

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  trust(
    @Body() dto: TrustReporterDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ trusted: TrustedReporterDomain; upgradedReports: number }> {
    return this.trustedReporters.trust(dto, {
      id: request.user.id,
      email: request.user.email,
    });
  }

  @Delete(':id')
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ downgradedReports: number }> {
    return this.trustedReporters.revoke(id);
  }
}
