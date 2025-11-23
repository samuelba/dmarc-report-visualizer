import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as fc from 'fast-check';
import { SmtpConfigService } from './smtp-config.service';
import { SmtpConfig } from '../entities/smtp-config.entity';
import { SmtpConfigDto } from '../dto/smtp-config.dto';
import { BadRequestException } from '@nestjs/common';

describe('SmtpConfigService', () => {
  let service: SmtpConfigService;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'SMTP_ENCRYPTION_KEY') {
        return 'test-encryption-key-32-bytes-long';
      }
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
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

    service = module.get<SmtpConfigService>(SmtpConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Feature: smtp-email-service, Property 3: Credential encryption round trip
   * Validates: Requirements 1.3
   *
   * Property: For any SMTP password, encrypting then decrypting should produce the original password value
   */
  describe('Property 3: Credential encryption round trip', () => {
    it('should encrypt and decrypt passwords correctly for all valid strings', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 100 }), (password) => {
          // Execute: Encrypt the password
          const encrypted = service.encryptPassword(password);

          // Verify: Encrypted value is different from original
          expect(encrypted).not.toBe(password);

          // Verify: Encrypted value has expected format (iv:authTag:encryptedData)
          const parts = encrypted.split(':');
          expect(parts).toHaveLength(3);

          // Execute: Decrypt the password
          const decrypted = service.decryptPassword(encrypted);

          // Verify: Decrypted value matches original
          expect(decrypted).toBe(password);
        }),
        { numRuns: 100 },
      );
    });

    it('should handle special characters in passwords', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (password: string) => {
            // Execute: Encrypt and decrypt
            const encrypted = service.encryptPassword(password);
            const decrypted = service.decryptPassword(encrypted);

            // Verify: Round trip preserves the password
            expect(decrypted).toBe(password);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should produce different encrypted values for the same password', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 100 }), (password) => {
          // Execute: Encrypt the same password twice
          const encrypted1 = service.encryptPassword(password);
          const encrypted2 = service.encryptPassword(password);

          // Verify: Different encrypted values (due to random IV)
          expect(encrypted1).not.toBe(encrypted2);

          // Verify: Both decrypt to the same original password
          expect(service.decryptPassword(encrypted1)).toBe(password);
          expect(service.decryptPassword(encrypted2)).toBe(password);
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: smtp-email-service, Property 4: Configuration validation
   * Validates: Requirements 1.5
   *
   * Property: For any SMTP configuration with missing required fields, validation should fail with appropriate error messages
   */
  describe('Property 4: Configuration validation', () => {
    it('should reject configurations missing required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            host: fc.option(fc.string(), { nil: undefined }),
            fromEmail: fc.option(fc.emailAddress(), { nil: undefined }),
            fromName: fc.option(fc.string({ minLength: 1 }), {
              nil: undefined,
            }),
            securityMode: fc.constantFrom('none', 'tls', 'starttls'),
          }),
          async (partialDto) => {
            // Skip if all required fields are present
            if (
              partialDto.host &&
              partialDto.fromEmail &&
              partialDto.fromName
            ) {
              return;
            }

            const dto = partialDto as SmtpConfigDto;

            // Execute & Verify: Should throw BadRequestException
            await expect(
              service.createOrUpdateConfig(dto, 'test-user-id'),
            ).rejects.toThrow(BadRequestException);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should accept valid configurations with all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            host: fc.string({ minLength: 1, maxLength: 255 }),
            port: fc.option(fc.integer({ min: 1, max: 65535 }), {
              nil: undefined,
            }),
            securityMode: fc.constantFrom('none', 'tls', 'starttls'),
            username: fc.option(fc.string(), { nil: undefined }),
            password: fc.option(fc.string(), { nil: undefined }),
            fromEmail: fc.emailAddress(),
            fromName: fc.string({ minLength: 1, maxLength: 255 }),
            replyToEmail: fc.option(fc.emailAddress(), { nil: undefined }),
            enabled: fc.option(fc.boolean(), { nil: undefined }),
          }),
          async (dto) => {
            // Setup: Mock repository to return null (no existing config)
            mockRepository.findOne.mockResolvedValue(null);
            mockRepository.create.mockImplementation((data) => data);
            mockRepository.save.mockResolvedValue({
              ...dto,
              id: 1,
              updatedById: 'test-user-id',
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            // Execute: Should not throw
            await service.createOrUpdateConfig(
              dto as SmtpConfigDto,
              'test-user-id',
            );

            // Verify: Repository methods were called
            expect(mockRepository.findOne).toHaveBeenCalled();
            expect(mockRepository.create).toHaveBeenCalled();
            expect(mockRepository.save).toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('getConfig', () => {
    it('should retrieve config with singleton id=1', async () => {
      const mockConfig = {
        id: 1,
        host: 'smtp.example.com',
        port: 587,
        securityMode: 'starttls',
        username: 'user',
        encryptedPassword: 'encrypted',
        fromEmail: 'from@example.com',
        fromName: 'Test',
        replyToEmail: null,
        enabled: true,
        updatedById: 'user-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockConfig);

      const result = await service.getConfig();

      expect(result).toEqual(mockConfig);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['updatedBy'],
      });
    });

    it('should return null when no config exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getConfig();

      expect(result).toBeNull();
    });
  });

  describe('createOrUpdateConfig', () => {
    it('should apply default port 587 for STARTTLS when port not provided', async () => {
      const dto: SmtpConfigDto = {
        host: 'smtp.example.com',
        securityMode: 'starttls',
        fromEmail: 'from@example.com',
        fromName: 'Test',
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockImplementation((data) => data);
      mockRepository.save.mockResolvedValue({
        ...dto,
        id: 1,
        port: 587,
        updatedById: 'test-user-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.createOrUpdateConfig(dto, 'test-user-id');

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 587,
        }),
      );
    });

    it('should apply default port 465 for TLS when port not provided', async () => {
      const dto: SmtpConfigDto = {
        host: 'smtp.example.com',
        securityMode: 'tls',
        fromEmail: 'from@example.com',
        fromName: 'Test',
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockImplementation((data) => data);
      mockRepository.save.mockResolvedValue({
        ...dto,
        id: 1,
        port: 465,
        updatedById: 'test-user-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.createOrUpdateConfig(dto, 'test-user-id');

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 465,
        }),
      );
    });

    it('should update existing config instead of creating new one', async () => {
      const existingConfig = {
        id: 1,
        host: 'old.smtp.com',
        port: 587,
        securityMode: 'starttls',
        username: 'olduser',
        encryptedPassword: 'oldencrypted',
        fromEmail: 'old@example.com',
        fromName: 'Old',
        replyToEmail: null,
        enabled: true,
        updatedById: 'old-user-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const dto: SmtpConfigDto = {
        host: 'new.smtp.com',
        port: 465,
        securityMode: 'tls',
        fromEmail: 'new@example.com',
        fromName: 'New',
      };

      mockRepository.findOne
        .mockResolvedValueOnce(existingConfig)
        .mockResolvedValueOnce({
          ...existingConfig,
          ...dto,
          id: 1,
          updatedById: 'test-user-id',
        });

      await service.createOrUpdateConfig(dto, 'test-user-id');

      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: 1 },
        expect.objectContaining({
          host: 'new.smtp.com',
          port: 465,
          securityMode: 'tls',
        }),
      );
    });

    it('should preserve existing password when not provided in update', async () => {
      const existingConfig = {
        id: 1,
        host: 'smtp.example.com',
        port: 587,
        securityMode: 'starttls',
        username: 'user',
        encryptedPassword: 'existing-encrypted-password',
        fromEmail: 'from@example.com',
        fromName: 'Test',
        replyToEmail: null,
        enabled: true,
        updatedById: 'user-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const dto: SmtpConfigDto = {
        host: 'smtp.example.com',
        securityMode: 'starttls',
        fromEmail: 'from@example.com',
        fromName: 'Test Updated',
      };

      mockRepository.findOne
        .mockResolvedValueOnce(existingConfig)
        .mockResolvedValueOnce({
          ...existingConfig,
          fromName: 'Test Updated',
        });

      await service.createOrUpdateConfig(dto, 'test-user-id');

      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: 1 },
        expect.objectContaining({
          encryptedPassword: 'existing-encrypted-password',
        }),
      );
    });
  });
});
