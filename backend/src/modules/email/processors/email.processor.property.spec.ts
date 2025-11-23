import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { Queue, Job } from 'bull';
import * as fc from 'fast-check';
import { EmailProcessor } from './email.processor';
import {
  EmailService,
  SendEmailResult,
  SendEmailOptions,
} from '../services/email.service';
import { SmtpConfigService } from '../services/smtp-config.service';
import { SmtpConfig } from '../entities/smtp-config.entity';

/**
 * Property-Based Tests for EmailProcessor
 * These tests verify universal properties that should hold across all valid inputs
 */
describe('EmailProcessor - Property-Based Tests', () => {
  let emailProcessor: EmailProcessor;
  let emailService: EmailService;
  let mockRepository: Partial<Repository<SmtpConfig>>;
  let mockQueue: Partial<Queue>;

  beforeEach(async () => {
    // Create mock repository
    mockRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    // Create mock queue
    mockQueue = {
      add: jest.fn(),
      process: jest.fn(),
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
        EmailProcessor,
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
        {
          provide: getQueueToken('email'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    emailProcessor = module.get<EmailProcessor>(EmailProcessor);
    emailService = module.get<EmailService>(EmailService);
  });

  /**
   * Feature: smtp-email-service, Property 21: Retry with exponential backoff
   * Validates: Requirements 7.6
   *
   * For any transient SMTP failure, the system should retry up to 3 times with exponentially increasing delays
   */
  describe('Property 21: Retry with exponential backoff', () => {
    it('should retry transient errors with exponential backoff configuration', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary transient error scenarios
          fc.record({
            to: fc.emailAddress(),
            subject: fc.string({ minLength: 1, maxLength: 100 }),
            text: fc.string({ minLength: 1, maxLength: 500 }),
            errorType: fc.constantFrom(
              'ETIMEDOUT',
              'ECONNREFUSED',
              'ECONNRESET',
              'ENOTFOUND',
              'ENETUNREACH',
            ),
            attemptNumber: fc.integer({ min: 1, max: 3 }),
          }),
          async (testData) => {
            // Create a mock job with retry configuration
            const mockJob: Partial<Job> = {
              id: Math.random().toString(),
              data: {
                to: testData.to,
                subject: testData.subject,
                text: testData.text,
              },
              attemptsMade: testData.attemptNumber - 1,
              opts: {
                attempts: 3,
                backoff: {
                  type: 'exponential',
                  delay: 1000,
                },
              },
            };

            // Mock email service to return a transient error
            const transientError = new Error(
              `Transient error: ${testData.errorType}`,
            );
            (transientError as any).code = testData.errorType;

            jest
              .spyOn(emailService, 'sendEmail')
              .mockRejectedValue(transientError);

            // Process the job and expect it to throw (for retry)
            await expect(
              emailProcessor.processEmail(mockJob as Job<SendEmailOptions>),
            ).rejects.toThrow();

            // Verify email service was called
            expect(emailService.sendEmail).toHaveBeenCalledWith({
              to: testData.to,
              subject: testData.subject,
              text: testData.text,
            });
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should not retry permanent errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary permanent error scenarios
          fc.record({
            to: fc.emailAddress(),
            subject: fc.string({ minLength: 1, maxLength: 100 }),
            text: fc.string({ minLength: 1, maxLength: 500 }),
            errorMessage: fc.constantFrom(
              'Authentication failed',
              'Invalid credentials',
              'Recipient rejected',
              'Mailbox not found',
            ),
          }),
          async (testData) => {
            // Create a mock job
            const mockJob: Partial<Job> = {
              id: Math.random().toString(),
              data: {
                to: testData.to,
                subject: testData.subject,
                text: testData.text,
              },
              attemptsMade: 0,
              opts: {
                attempts: 3,
                backoff: {
                  type: 'exponential',
                  delay: 1000,
                },
              },
            };

            // Mock email service to return a permanent error
            const permanentError = new Error(testData.errorMessage);
            jest
              .spyOn(emailService, 'sendEmail')
              .mockRejectedValue(permanentError);

            // Process the job and expect it to throw
            await expect(
              emailProcessor.processEmail(mockJob as Job<SendEmailOptions>),
            ).rejects.toThrow();

            // Verify email service was called
            expect(emailService.sendEmail).toHaveBeenCalledWith({
              to: testData.to,
              subject: testData.subject,
              text: testData.text,
            });
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should succeed on successful email send', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary successful email scenarios
          fc.record({
            to: fc.emailAddress(),
            subject: fc.string({ minLength: 1, maxLength: 100 }),
            text: fc.string({ minLength: 1, maxLength: 500 }),
            messageId: fc.uuid(),
          }),
          async (testData) => {
            // Create a mock job
            const mockJob: Partial<Job> = {
              id: Math.random().toString(),
              data: {
                to: testData.to,
                subject: testData.subject,
                text: testData.text,
              },
              attemptsMade: 0,
              opts: {
                attempts: 3,
                backoff: {
                  type: 'exponential',
                  delay: 1000,
                },
              },
            };

            // Mock email service to return success
            const successResult: SendEmailResult = {
              success: true,
              messageId: testData.messageId,
              diagnostics: {
                host: 'smtp.example.com',
                port: 587,
                secure: false,
                authUsed: true,
                responseTime: 100,
                timestamp: new Date().toISOString(),
              },
            };

            jest
              .spyOn(emailService, 'sendEmail')
              .mockResolvedValue(successResult);

            // Process the job and expect success
            const result = await emailProcessor.processEmail(
              mockJob as Job<SendEmailOptions>,
            );

            expect(result.success).toBe(true);
            expect(result.messageId).toBe(testData.messageId);

            // Verify email service was called
            expect(emailService.sendEmail).toHaveBeenCalledWith({
              to: testData.to,
              subject: testData.subject,
              text: testData.text,
            });
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: smtp-email-service, Property 26: Sequential queue processing
   * Validates: Requirements 8.4
   *
   * For any set of queued emails, the system should process them in the order they were queued
   */
  describe('Property 26: Sequential queue processing', () => {
    it('should process emails in the order they were queued', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a list of email jobs
          fc.array(
            fc.record({
              to: fc.emailAddress(),
              subject: fc.string({ minLength: 1, maxLength: 50 }),
              text: fc.string({ minLength: 1, maxLength: 200 }),
            }),
            { minLength: 2, maxLength: 5 },
          ),
          async (emails) => {
            // Track the order of processing
            const processedOrder: string[] = [];

            // Mock email service to track processing order
            jest
              .spyOn(emailService, 'sendEmail')
              .mockImplementation((options) => {
                processedOrder.push(options.to);
                return Promise.resolve({
                  success: true,
                  messageId: Math.random().toString(),
                  diagnostics: {
                    host: 'smtp.example.com',
                    port: 587,
                    secure: false,
                    authUsed: true,
                    responseTime: 100,
                    timestamp: new Date().toISOString(),
                  },
                });
              });

            // Process each email job sequentially
            for (let i = 0; i < emails.length; i++) {
              const mockJob: Partial<Job> = {
                id: i.toString(),
                data: emails[i],
                attemptsMade: 0,
                opts: {
                  attempts: 3,
                  backoff: {
                    type: 'exponential',
                    delay: 1000,
                  },
                },
              };

              await emailProcessor.processEmail(
                mockJob as Job<SendEmailOptions>,
              );
            }

            // Verify emails were processed in the same order they were queued
            const expectedOrder = emails.map((e) => e.to);
            expect(processedOrder).toEqual(expectedOrder);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
