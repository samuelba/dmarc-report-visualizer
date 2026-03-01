import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmailMessageTrackingService } from './email-message-tracking.service';
import {
  EmailMessageTracking,
  EmailSource,
  ProcessingStatus,
} from '../entities/email-message-tracking.entity';

describe('EmailMessageTrackingService', () => {
  let service: EmailMessageTrackingService;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    execute: jest.fn(),
    getMany: jest.fn(),
  };

  const mockRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailMessageTrackingService,
        {
          provide: getRepositoryToken(EmailMessageTracking),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<EmailMessageTrackingService>(
      EmailMessageTrackingService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isProcessed', () => {
    const messageId = '123';
    const source = EmailSource.IMAP;
    const account = 'user@example.com';

    it('should return true when tracking exists with SUCCESS status', async () => {
      mockRepository.findOne.mockResolvedValue({
        messageId,
        source,
        accountIdentifier: account,
        status: ProcessingStatus.SUCCESS,
      });

      const result = await service.isProcessed(messageId, source, account);

      expect(result).toBe(true);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { messageId, source, accountIdentifier: account },
      });
    });

    it('should return false when tracking exists but status is not SUCCESS', async () => {
      mockRepository.findOne.mockResolvedValue({
        messageId,
        source,
        accountIdentifier: account,
        status: ProcessingStatus.FAILED,
      });

      const result = await service.isProcessed(messageId, source, account);

      expect(result).toBe(false);
    });

    it('should return false when tracking exists with PROCESSING status', async () => {
      mockRepository.findOne.mockResolvedValue({
        messageId,
        source,
        accountIdentifier: account,
        status: ProcessingStatus.PROCESSING,
      });

      const result = await service.isProcessed(messageId, source, account);

      expect(result).toBe(false);
    });

    it('should return false when no tracking record exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.isProcessed(messageId, source, account);

      expect(result).toBe(false);
    });
  });

  describe('exists', () => {
    const messageId = '456';
    const source = EmailSource.GMAIL;
    const account = 'user@gmail.com';

    it('should return true when count > 0', async () => {
      mockRepository.count.mockResolvedValue(1);

      const result = await service.exists(messageId, source, account);

      expect(result).toBe(true);
      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { messageId, source, accountIdentifier: account },
      });
    });

    it('should return false when count is 0', async () => {
      mockRepository.count.mockResolvedValue(0);

      const result = await service.exists(messageId, source, account);

      expect(result).toBe(false);
    });
  });

  describe('markProcessing', () => {
    const messageId = '789';
    const source = EmailSource.IMAP;
    const account = 'imap@example.com';

    it('should create a new tracking record if none exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      const created = {
        messageId,
        source,
        accountIdentifier: account,
        status: ProcessingStatus.PROCESSING,
        attemptCount: 1,
      };
      mockRepository.create.mockReturnValue(created);
      mockRepository.save.mockResolvedValue(created);

      const result = await service.markProcessing(messageId, source, account);

      expect(result).toEqual(created);
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId,
          source,
          accountIdentifier: account,
          status: ProcessingStatus.PROCESSING,
          attemptCount: 1,
        }),
      );
      expect(mockRepository.save).toHaveBeenCalledWith(created);
    });

    it('should update existing tracking record and increment attemptCount', async () => {
      const existing = {
        messageId,
        source,
        accountIdentifier: account,
        status: ProcessingStatus.FAILED,
        attemptCount: 2,
        lastAttemptAt: null as Date | null,
      };
      mockRepository.findOne.mockResolvedValue(existing);
      mockRepository.save.mockResolvedValue(existing);

      const result = await service.markProcessing(messageId, source, account);

      expect(result.status).toBe(ProcessingStatus.PROCESSING);
      expect(result.attemptCount).toBe(3);
      expect(result.lastAttemptAt).toBeInstanceOf(Date);
      expect(mockRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('markSuccess', () => {
    const messageId = '101';
    const source = EmailSource.IMAP;
    const account = 'user@example.com';

    it('should create a new tracking record with SUCCESS status if none exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      const created = {
        messageId,
        source,
        accountIdentifier: account,
        status: ProcessingStatus.SUCCESS,
        attemptCount: 1,
        reportId: 'report-uuid',
      };
      mockRepository.create.mockReturnValue(created);
      mockRepository.save.mockResolvedValue(created);

      const result = await service.markSuccess(
        messageId,
        source,
        account,
        'report-uuid',
      );

      expect(result.status).toBe(ProcessingStatus.SUCCESS);
      expect(result.reportId).toBe('report-uuid');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId,
          source,
          accountIdentifier: account,
          status: ProcessingStatus.SUCCESS,
          reportId: 'report-uuid',
        }),
      );
    });

    it('should update existing record to SUCCESS and set processedAt', async () => {
      const existing = {
        messageId,
        source,
        accountIdentifier: account,
        status: ProcessingStatus.PROCESSING,
        attemptCount: 1,
        processedAt: null as Date | null,
        errorMessage: 'old error',
        reportId: null as string | null,
      };
      mockRepository.findOne.mockResolvedValue(existing);
      mockRepository.save.mockResolvedValue(existing);

      const result = await service.markSuccess(
        messageId,
        source,
        account,
        'new-report-id',
      );

      expect(result.status).toBe(ProcessingStatus.SUCCESS);
      expect(result.processedAt).toBeInstanceOf(Date);
      expect(result.errorMessage).toBe('');
      expect(result.reportId).toBe('new-report-id');
    });

    it('should not overwrite reportId when not provided', async () => {
      const existing = {
        messageId,
        source,
        accountIdentifier: account,
        status: ProcessingStatus.PROCESSING,
        attemptCount: 1,
        processedAt: null as Date | null,
        errorMessage: '',
        reportId: 'existing-report-id',
      };
      mockRepository.findOne.mockResolvedValue(existing);
      mockRepository.save.mockResolvedValue(existing);

      const result = await service.markSuccess(messageId, source, account);

      expect(result.reportId).toBe('existing-report-id');
    });
  });

  describe('markFailed', () => {
    const messageId = '202';
    const source = EmailSource.IMAP;
    const account = 'user@example.com';
    const errorMessage = 'Parse error';

    it('should create a new FAILED tracking record if none exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      const created = {
        messageId,
        source,
        accountIdentifier: account,
        status: ProcessingStatus.FAILED,
        attemptCount: 1,
        errorMessage,
      };
      mockRepository.create.mockReturnValue(created);
      mockRepository.save.mockResolvedValue(created);

      const result = await service.markFailed(
        messageId,
        source,
        account,
        errorMessage,
      );

      expect(result.status).toBe(ProcessingStatus.FAILED);
      expect(result.errorMessage).toBe(errorMessage);
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ProcessingStatus.FAILED,
          errorMessage,
          attemptCount: 1,
        }),
      );
    });

    it('should update existing record to FAILED without incrementing attemptCount', async () => {
      const existing = {
        messageId,
        source,
        accountIdentifier: account,
        status: ProcessingStatus.PROCESSING,
        attemptCount: 1,
        lastAttemptAt: null as Date | null,
        errorMessage: '' as string,
      };
      mockRepository.findOne.mockResolvedValue(existing);
      mockRepository.save.mockResolvedValue(existing);

      const result = await service.markFailed(
        messageId,
        source,
        account,
        errorMessage,
      );

      expect(result.status).toBe(ProcessingStatus.FAILED);
      expect(result.attemptCount).toBe(1);
      expect(result.errorMessage).toBe(errorMessage);
      expect(result.lastAttemptAt).toBeInstanceOf(Date);
    });
  });

  describe('getTracking', () => {
    it('should return the tracking record', async () => {
      const tracking = {
        messageId: '303',
        source: EmailSource.IMAP,
        accountIdentifier: 'user@example.com',
        status: ProcessingStatus.SUCCESS,
      };
      mockRepository.findOne.mockResolvedValue(tracking);

      const result = await service.getTracking(
        '303',
        EmailSource.IMAP,
        'user@example.com',
      );

      expect(result).toEqual(tracking);
    });

    it('should return null when no record exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getTracking(
        'nonexistent',
        EmailSource.IMAP,
        'user@example.com',
      );

      expect(result).toBeNull();
    });
  });

  describe('getFailedMessages', () => {
    it('should return failed messages ordered by lastAttemptAt ASC', async () => {
      const failed = [
        { messageId: '1', status: ProcessingStatus.FAILED, attemptCount: 1 },
        { messageId: '2', status: ProcessingStatus.FAILED, attemptCount: 2 },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(failed);

      const result = await service.getFailedMessages();

      expect(result).toEqual(failed);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'tracking.status = :status',
        { status: ProcessingStatus.FAILED },
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'tracking.lastAttemptAt',
        'ASC',
      );
    });

    it('should filter by source when provided', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.getFailedMessages(EmailSource.IMAP);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'tracking.source = :source',
        { source: EmailSource.IMAP },
      );
    });

    it('should filter by maxAttempts when provided', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.getFailedMessages(undefined, 5);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'tracking.attemptCount < :maxAttempts',
        { maxAttempts: 5 },
      );
    });

    it('should filter by both source and maxAttempts', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.getFailedMessages(EmailSource.GMAIL, 3);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'tracking.source = :source',
        { source: EmailSource.GMAIL },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'tracking.attemptCount < :maxAttempts',
        { maxAttempts: 3 },
      );
    });
  });

  describe('cleanupOldRecords', () => {
    it('should delete old SUCCESS records and return count', async () => {
      mockQueryBuilder.execute.mockResolvedValue({ affected: 15 });

      const result = await service.cleanupOldRecords(90);

      expect(result).toBe(15);
      expect(mockQueryBuilder.delete).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('status = :status', {
        status: ProcessingStatus.SUCCESS,
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'processedAt < :cutoffDate',
        expect.objectContaining({ cutoffDate: expect.any(Date) }),
      );
    });

    it('should use default 90 days when not specified', async () => {
      mockQueryBuilder.execute.mockResolvedValue({ affected: 0 });

      await service.cleanupOldRecords();

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'processedAt < :cutoffDate',
        expect.objectContaining({ cutoffDate: expect.any(Date) }),
      );
    });

    it('should return 0 when no records affected', async () => {
      mockQueryBuilder.execute.mockResolvedValue({ affected: 0 });

      const result = await service.cleanupOldRecords(30);

      expect(result).toBe(0);
    });

    it('should handle undefined affected count', async () => {
      mockQueryBuilder.execute.mockResolvedValue({});

      const result = await service.cleanupOldRecords();

      expect(result).toBe(0);
    });
  });
});
