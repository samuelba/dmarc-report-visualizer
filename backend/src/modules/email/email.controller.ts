import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminGuard } from '../auth/guards/admin.guard';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { SmtpConfigService } from './services/smtp-config.service';
import { EmailService, SendEmailResult } from './services/email.service';
import { SmtpConfigDto } from './dto/smtp-config.dto';
import { TestEmailDto } from './dto/test-email.dto';

export interface SmtpConfigResponse {
  configured: boolean;
  enabled: boolean;
  host?: string;
  port?: number;
  securityMode?: string;
  username?: string;
  hasPassword: boolean;
  fromEmail?: string;
  fromName?: string;
  replyToEmail?: string;
}

@Controller('email')
@UseGuards(AdminGuard)
export class EmailController {
  constructor(
    private readonly smtpConfigService: SmtpConfigService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Get SMTP configuration endpoint
   * Returns current SMTP configuration without password
   * Admin only
   */
  @Get('config')
  async getConfig(): Promise<SmtpConfigResponse> {
    const config = await this.smtpConfigService.getConfig();

    if (!config) {
      // No configuration exists yet
      return {
        configured: false,
        enabled: false,
        hasPassword: false,
      };
    }

    // Return configuration without password
    return {
      configured: true,
      enabled: config.enabled,
      host: config.host,
      port: config.port,
      securityMode: config.securityMode,
      username: config.username || undefined,
      hasPassword: !!config.encryptedPassword,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      replyToEmail: config.replyToEmail || undefined,
    };
  }

  /**
   * Update SMTP configuration endpoint
   * Validates input and applies port defaults based on security mode
   * Returns configuration without password
   * Admin only
   */
  @Post('config')
  @HttpCode(HttpStatus.OK)
  async updateConfig(
    @Body() dto: SmtpConfigDto,
    @Req() request: Request & { user: { id: string } },
  ): Promise<SmtpConfigResponse> {
    // Apply port defaults based on security mode if not provided
    if (!dto.port) {
      dto.port = dto.securityMode === 'tls' ? 465 : 587;
    }

    // Update configuration
    const config = await this.smtpConfigService.createOrUpdateConfig(
      dto,
      request.user.id,
    );

    if (!config) {
      throw new BadRequestException('Failed to update SMTP configuration');
    }

    // Return configuration without password
    return {
      configured: true,
      enabled: config.enabled,
      host: config.host,
      port: config.port,
      securityMode: config.securityMode,
      username: config.username || undefined,
      hasPassword: !!config.encryptedPassword,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      replyToEmail: config.replyToEmail || undefined,
    };
  }

  /**
   * Send test email endpoint
   * Validates recipient email and sends test email synchronously
   * Returns detailed diagnostic information
   * Admin only with rate limiting
   */
  @Post('test')
  @UseGuards(RateLimitGuard)
  @HttpCode(HttpStatus.OK)
  async sendTestEmail(@Body() dto: TestEmailDto): Promise<SendEmailResult> {
    // Validate recipient email address (done by class-validator in DTO)
    // Send test email synchronously
    const result = await this.emailService.sendTestEmail(dto.to);

    return result;
  }

  /**
   * Delete SMTP configuration endpoint
   * Removes the SMTP configuration from database
   * Admin only
   */
  @Delete('config')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConfig(): Promise<void> {
    await this.smtpConfigService.deleteConfig();
  }
}
