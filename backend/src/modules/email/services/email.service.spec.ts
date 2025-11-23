import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailService } from './email.service';
import { SmtpConfigService } from './smtp-config.service';
import { SmtpConfig } from '../entities/smtp-config.entity';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('EmailService', () => {
  let service: EmailService;
  let mockRepository: Partial<Repository<SmtpConfig>>;

  beforeEach(async () => {
    // Create mock repository
    mockRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    // Create mock config service
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'SMTP_ENCRYPTION_KEY') {
          return 'test-encryption-key-32-bytes-long';
        }
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        SmtpConfigService,
        {
          provide: getRepositoryToken(SmtpConfig),
          useValue: mockRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('renderTemplate', () => {
    it('should render invite HTML template with context', async () => {
      const context = {
        inviterName: 'John Doe',
        recipientEmail: 'test@example.com',
        invitationLink: 'https://example.com/invite/abc123',
      };

      const result = await service.renderTemplate('invite', context);

      expect(result).toContain('John Doe');
      expect(result).toContain('test@example.com');
      expect(result).toContain('https://example.com/invite/abc123');
      expect(result).toContain("You're Invited!");
    });

    it('should render invite text template with context', async () => {
      const context = {
        inviterName: 'Jane Smith',
        recipientEmail: 'user@example.com',
        invitationLink: 'https://example.com/invite/xyz789',
      };

      const result = await service.renderTemplate('invite.txt', context, 'hbs');

      expect(result).toContain('Jane Smith');
      expect(result).toContain('user@example.com');
      expect(result).toContain('https://example.com/invite/xyz789');
      expect(result).toContain("You're Invited!");
    });

    it('should render test email HTML template with configuration', async () => {
      const context = {
        host: 'smtp.example.com',
        port: 587,
        securityMode: 'STARTTLS',
        authStatus: 'Enabled',
        fromName: 'DMARC Dashboard',
        fromEmail: 'noreply@example.com',
        replyToEmail: 'support@example.com',
      };

      const result = await service.renderTemplate('test', context);

      expect(result).toContain('smtp.example.com');
      expect(result).toContain('587');
      expect(result).toContain('STARTTLS');
      expect(result).toContain('Enabled');
      expect(result).toContain('DMARC Dashboard');
      expect(result).toContain('noreply@example.com');
      expect(result).toContain('support@example.com');
      expect(result).toContain('SMTP Test Successful!');
    });

    it('should render test email text template with configuration', async () => {
      const context = {
        host: 'smtp.gmail.com',
        port: 465,
        securityMode: 'TLS',
        authStatus: 'Enabled',
        fromName: 'Test Sender',
        fromEmail: 'test@gmail.com',
      };

      const result = await service.renderTemplate('test.txt', context, 'hbs');

      expect(result).toContain('smtp.gmail.com');
      expect(result).toContain('465');
      expect(result).toContain('TLS');
      expect(result).toContain('Enabled');
      expect(result).toContain('Test Sender');
      expect(result).toContain('test@gmail.com');
    });

    it('should handle conditional rendering in templates', async () => {
      const contextWithReplyTo = {
        host: 'smtp.example.com',
        port: 587,
        securityMode: 'STARTTLS',
        authStatus: 'Enabled',
        fromName: 'Test',
        fromEmail: 'test@example.com',
        replyToEmail: 'reply@example.com',
      };

      const resultWithReplyTo = await service.renderTemplate(
        'test',
        contextWithReplyTo,
      );
      expect(resultWithReplyTo).toContain('reply@example.com');

      const contextWithoutReplyTo = {
        host: 'smtp.example.com',
        port: 587,
        securityMode: 'STARTTLS',
        authStatus: 'Enabled',
        fromName: 'Test',
        fromEmail: 'test@example.com',
      };

      const resultWithoutReplyTo = await service.renderTemplate(
        'test',
        contextWithoutReplyTo,
      );
      // Should not contain reply-to section when not provided
      expect(resultWithoutReplyTo).not.toContain('Reply-To:');
    });

    it('should cache compiled templates', async () => {
      const context = {
        inviterName: 'Test User',
        recipientEmail: 'test@example.com',
        invitationLink: 'https://example.com/invite/test',
      };

      // First render
      const result1 = await service.renderTemplate('invite', context);

      // Second render (should use cached template)
      const result2 = await service.renderTemplate('invite', context);

      expect(result1).toBe(result2);
    });

    it('should throw error for non-existent template', async () => {
      await expect(service.renderTemplate('nonexistent', {})).rejects.toThrow(
        'Template file not found',
      );
    });

    it('should handle template rendering errors gracefully', async () => {
      // Create a template with invalid syntax temporarily
      const invalidTemplatePath = path.join(
        __dirname,
        '..',
        'templates',
        'invalid.hbs',
      );

      try {
        await fs.writeFile(invalidTemplatePath, '{{#if}}{{/if}}', 'utf-8');

        await expect(service.renderTemplate('invalid', {})).rejects.toThrow(
          'Template rendering error',
        );
      } finally {
        // Clean up
        try {
          await fs.unlink(invalidTemplatePath);
        } catch (_e) {
          // Ignore cleanup errors
        }
      }
    });
  });

  describe('clearTemplateCache', () => {
    it('should clear the template cache', async () => {
      const context = {
        inviterName: 'Test',
        recipientEmail: 'test@example.com',
        invitationLink: 'https://example.com/invite/test',
      };

      // Render to populate cache
      await service.renderTemplate('invite', context);

      // Clear cache
      service.clearTemplateCache();

      // Render again (should reload from file)
      const result = await service.renderTemplate('invite', context);
      expect(result).toContain('Test');
    });
  });
});
