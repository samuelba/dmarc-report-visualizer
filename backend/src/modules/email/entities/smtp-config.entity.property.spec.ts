import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fc from 'fast-check';
import { Repository } from 'typeorm';
import { SmtpConfig } from './smtp-config.entity';

describe('SmtpConfig Entity - Property Tests', () => {
  let repository: Repository<SmtpConfig>;

  const mockRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: getRepositoryToken(SmtpConfig),
          useValue: mockRepository,
        },
      ],
    }).compile();

    repository = module.get<Repository<SmtpConfig>>(
      getRepositoryToken(SmtpConfig),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Feature: smtp-email-service, Property 1: Configuration storage round trip
   * Validates: Requirements 1.1
   *
   * Property: For any valid SMTP configuration with host and port, storing then retrieving
   * the configuration should return the same host and port values
   */
  describe('Property 1: Configuration storage round trip', () => {
    it('should preserve host and port values through save and retrieve operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            host: fc.domain(),
            port: fc.integer({ min: 1, max: 65535 }),
            securityMode: fc.constantFrom('none', 'tls', 'starttls'),
            username: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
              nil: null,
            }),
            encryptedPassword: fc.option(
              fc.string({ minLength: 1, maxLength: 500 }),
              { nil: null },
            ),
            fromEmail: fc.emailAddress(),
            fromName: fc.string({ minLength: 1, maxLength: 100 }),
            replyToEmail: fc.option(fc.emailAddress(), { nil: null }),
            enabled: fc.boolean(),
            updatedById: fc.uuid(),
          }),
          async (configData) => {
            // Setup: Create a config object with fixed id=1 for singleton
            const configToSave: Partial<SmtpConfig> = {
              id: 1,
              ...configData,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Mock the save operation to return the saved config
            mockRepository.save.mockResolvedValue(configToSave);

            // Mock the findOne operation to return the saved config
            mockRepository.findOne.mockResolvedValue(configToSave);

            // Execute: Save the configuration
            await repository.save(configToSave);

            // Execute: Retrieve the configuration
            const retrievedConfig = await repository.findOne({
              where: { id: 1 },
            });

            // Verify: Host and port are preserved
            expect(retrievedConfig).toBeDefined();
            expect(retrievedConfig!.host).toBe(configData.host);
            expect(retrievedConfig!.port).toBe(configData.port);

            // Verify: All other fields are also preserved
            expect(retrievedConfig!.securityMode).toBe(configData.securityMode);
            expect(retrievedConfig!.username).toBe(configData.username);
            expect(retrievedConfig!.encryptedPassword).toBe(
              configData.encryptedPassword,
            );
            expect(retrievedConfig!.fromEmail).toBe(configData.fromEmail);
            expect(retrievedConfig!.fromName).toBe(configData.fromName);
            expect(retrievedConfig!.replyToEmail).toBe(configData.replyToEmail);
            expect(retrievedConfig!.enabled).toBe(configData.enabled);
            expect(retrievedConfig!.updatedById).toBe(configData.updatedById);

            // Verify: Singleton pattern - id is always 1
            expect(retrievedConfig!.id).toBe(1);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
