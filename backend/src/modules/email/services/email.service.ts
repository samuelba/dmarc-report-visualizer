import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { registerTemplateHelpers } from '../templates/helpers';
import { SmtpConfigService } from './smtp-config.service';
import { SmtpConfig } from '../entities/smtp-config.entity';

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: Buffer;
    cid?: string;
  }>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  diagnostics?: {
    host: string;
    port: number;
    secure: boolean;
    authUsed: boolean;
    responseTime: number;
    timestamp: string;
  };
}

export interface TemplateContext {
  [key: string]: any;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private readonly templateCache = new Map<
    string,
    HandlebarsTemplateDelegate
  >();
  private readonly templatesPath: string;
  private transporter: Transporter | null = null;
  private currentConfigHash: string | null = null;

  constructor(private readonly smtpConfigService: SmtpConfigService) {
    // Path to templates directory
    this.templatesPath = path.join(__dirname, '..', 'templates');
  }

  /**
   * Initialize the service and register Handlebars helpers
   */
  onModuleInit() {
    registerTemplateHelpers();
    this.logger.log('Email service initialized with template helpers');
  }

  /**
   * Create a hash of the SMTP configuration for change detection
   */
  private createConfigHash(config: SmtpConfig): string {
    return JSON.stringify({
      host: config.host,
      port: config.port,
      securityMode: config.securityMode,
      username: config.username,
      encryptedPassword: config.encryptedPassword,
    });
  }

  /**
   * Get or create the Nodemailer transporter
   * Recreates transporter if configuration has changed
   */
  private async getTransporter(): Promise<Transporter | null> {
    const config = await this.smtpConfigService.getConfig();

    if (!config || !config.enabled) {
      this.logger.warn('SMTP configuration not found or disabled');
      return null;
    }

    const configHash = this.createConfigHash(config);

    // Recreate transporter if config has changed
    if (this.transporter && this.currentConfigHash !== configHash) {
      this.logger.log('SMTP configuration changed, recreating transporter');
      this.transporter = null;
      this.currentConfigHash = null;
    }

    // Create new transporter if needed
    if (!this.transporter) {
      this.logger.log('Creating new Nodemailer transporter');

      const transportOptions: any = {
        host: config.host,
        port: config.port,
        secure: config.securityMode === 'tls', // true for port 465, false for other ports
        pool: true, // Enable connection pooling
        connectionTimeout: 10000, // 10 seconds
        greetingTimeout: 10000, // 10 seconds
        socketTimeout: 10000, // 10 seconds
      };

      // Add authentication if credentials are provided
      if (config.username && config.encryptedPassword) {
        const password = this.smtpConfigService.decryptPassword(
          config.encryptedPassword,
        );
        transportOptions.auth = {
          user: config.username,
          pass: password,
        };
      }

      // Handle STARTTLS
      if (config.securityMode === 'starttls') {
        transportOptions.requireTLS = true;
      }

      this.transporter = nodemailer.createTransport(
        transportOptions as nodemailer.TransportOptions,
      );
      this.currentConfigHash = configHash;

      this.logger.log(
        `Transporter created for ${config.host}:${config.port} (${config.securityMode})`,
      );
    }

    return this.transporter;
  }

  /**
   * Render a Handlebars template with the given context
   * @param templateName Name of the template file (without extension)
   * @param context Data to pass to the template
   * @param extension Template file extension (default: 'hbs')
   * @returns Rendered template string
   */
  async renderTemplate(
    templateName: string,
    context: TemplateContext,
    extension: string = 'hbs',
  ): Promise<string> {
    try {
      const cacheKey = `${templateName}.${extension}`;

      // Check if template is already compiled and cached
      let template = this.templateCache.get(cacheKey);

      if (!template) {
        // Load and compile template
        const templatePath = path.join(
          this.templatesPath,
          `${templateName}.${extension}`,
        );

        this.logger.debug(`Loading template from: ${templatePath}`);

        const templateSource = await fs.readFile(templatePath, 'utf-8');
        template = Handlebars.compile(templateSource);

        // Cache the compiled template
        this.templateCache.set(cacheKey, template);

        this.logger.debug(`Template ${cacheKey} compiled and cached`);
      }

      // Render the template with context
      const rendered = template(context);
      return rendered;
    } catch (error) {
      this.logger.error(
        `Failed to render template ${templateName}.${extension}`,
        error,
      );

      // Handle specific error types
      if (error.code === 'ENOENT') {
        throw new Error(
          `Template file not found: ${templateName}.${extension}`,
        );
      }

      if (error instanceof Error) {
        throw new Error(`Template rendering error: ${error.message}`);
      }

      throw new Error('Unknown template rendering error');
    }
  }

  /**
   * Clear the template cache (useful for development/testing)
   */
  clearTemplateCache(): void {
    this.templateCache.clear();
    this.logger.debug('Template cache cleared');
  }

  /**
   * Validate email address format
   */
  private isValidEmail(email: string): boolean {
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Send an email using the configured SMTP server
   */
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // Validate email address format
    if (!this.isValidEmail(options.to)) {
      return {
        success: false,
        error: `Invalid email address format: ${options.to}`,
        diagnostics: {
          host: 'N/A',
          port: 0,
          secure: false,
          authUsed: false,
          responseTime: Date.now() - startTime,
          timestamp,
        },
      };
    }

    try {
      // Get the transporter
      const transporter = await this.getTransporter();

      if (!transporter) {
        return {
          success: false,
          error: 'SMTP not configured or disabled',
          diagnostics: {
            host: 'N/A',
            port: 0,
            secure: false,
            authUsed: false,
            responseTime: Date.now() - startTime,
            timestamp,
          },
        };
      }

      // Get current config for diagnostics
      const config = await this.smtpConfigService.getConfig();
      if (!config) {
        return {
          success: false,
          error: 'SMTP configuration not found',
          diagnostics: {
            host: 'N/A',
            port: 0,
            secure: false,
            authUsed: false,
            responseTime: Date.now() - startTime,
            timestamp,
          },
        };
      }

      // Prepare email options
      const mailOptions = {
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: config.replyToEmail || undefined,
        attachments: options.attachments || undefined,
      };

      // Send the email
      this.logger.log(`Sending email to ${options.to}: ${options.subject}`);
      const info = await transporter.sendMail(mailOptions);

      const responseTime = Date.now() - startTime;
      this.logger.log(
        `Email sent successfully to ${options.to} (${responseTime}ms)`,
      );

      return {
        success: true,
        messageId: info.messageId,
        diagnostics: {
          host: config.host,
          port: config.port,
          secure: config.securityMode === 'tls',
          authUsed: !!config.username,
          responseTime,
          timestamp,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      // Get config for diagnostics (if available)
      const config = await this.smtpConfigService.getConfig();

      const diagnostics = {
        host: config?.host || 'N/A',
        port: config?.port || 0,
        secure: config?.securityMode === 'tls' || false,
        authUsed: !!config?.username,
        responseTime,
        timestamp,
      };

      // Handle different error types
      let errorMessage = 'Unknown error occurred';

      if (error instanceof Error) {
        errorMessage = error.message;

        // Log detailed error information
        this.logger.error(
          `Failed to send email to ${options.to}: ${errorMessage}`,
          error.stack,
        );
      } else {
        this.logger.error(
          `Failed to send email to ${options.to}: Unknown error`,
          error,
        );
      }

      return {
        success: false,
        error: errorMessage,
        diagnostics,
      };
    }
  }

  /**
   * Send an invitation email to a new user
   */
  async sendInviteEmail(
    email: string,
    token: string,
    inviterName: string,
  ): Promise<SendEmailResult> {
    try {
      // Build the invitation link
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      const invitationLink = `${baseUrl}/invite/${token}`;

      // Prepare template context
      const context = {
        recipientEmail: email,
        inviterName,
        invitationLink,
      };

      // Render HTML and text templates
      const html = await this.renderTemplate('invite', context, 'hbs');
      const text = await this.renderTemplate('invite.txt', context, 'hbs');

      // Prepare logo attachment
      const logoPath = path.join(
        this.templatesPath,
        'assets',
        'dmarc-logo.png',
      );

      // Send the email with logo attachment
      return await this.sendEmail({
        to: email,
        subject: `You've been invited to DMARC Dashboard`,
        text,
        html,
        attachments: [
          {
            filename: 'dmarc-logo.png',
            path: logoPath,
            cid: 'logo@dmarc-dashboard',
          },
        ],
      });
    } catch (error) {
      this.logger.error(
        `Failed to send invitation email to ${email}`,
        error instanceof Error ? error.stack : error,
      );

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to send invitation email',
      };
    }
  }

  /**
   * Send a test email to verify SMTP configuration
   * This is processed synchronously to provide immediate feedback
   */
  async sendTestEmail(to: string): Promise<SendEmailResult> {
    try {
      // Get current SMTP configuration
      const config = await this.smtpConfigService.getConfig();

      if (!config) {
        return {
          success: false,
          error: 'SMTP configuration not found',
        };
      }

      const context = {
        host: config.host,
        port: config.port,
        securityMode: config.securityMode.toUpperCase(),
        authStatus: config.username ? 'Enabled' : 'Disabled',
        fromName: config.fromName,
        fromEmail: config.fromEmail,
        replyToEmail: config.replyToEmail || null,
      };

      // Render HTML and text templates
      const html = await this.renderTemplate('test', context, 'hbs');
      const text = await this.renderTemplate('test.txt', context, 'hbs');

      // Prepare logo attachment
      const logoPath = path.join(
        this.templatesPath,
        'assets',
        'dmarc-logo.png',
      );

      // Send the test email synchronously with logo attachment
      const result = await this.sendEmail({
        to,
        subject: 'SMTP Test Email - DMARC Dashboard',
        text,
        html,
        attachments: [
          {
            filename: 'dmarc-logo.png',
            path: logoPath,
            cid: 'logo@dmarc-dashboard',
          },
        ],
      });

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to send test email to ${to}`,
        error instanceof Error ? error.stack : error,
      );

      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to send test email',
      };
    }
  }
}
