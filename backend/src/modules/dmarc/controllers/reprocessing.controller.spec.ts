import { Test, TestingModule } from '@nestjs/testing';
import { ReprocessingController } from './reprocessing.controller';
import { ReprocessingService } from '../services/reprocessing.service';
import {
  ReprocessingJob,
  ReprocessingJobStatus,
} from '../entities/reprocessing-job.entity';
import { StartReprocessingDto } from '../dto/start-reprocessing.dto';

describe('ReprocessingController', () => {
  let controller: ReprocessingController;
  let service: ReprocessingService;

  // Mock data
  const mockJob: ReprocessingJob = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    status: ReprocessingJobStatus.RUNNING,
    totalRecords: 1000,
    processedRecords: 500,
    forwardedCount: 100,
    notForwardedCount: 300,
    unknownCount: 100,
    startedAt: new Date('2025-01-01T10:00:00Z'),
    completedAt: undefined,
    errorMessage: undefined,
    dateFrom: new Date('2025-01-01'),
    dateTo: new Date('2025-01-31T23:59:59.999Z'),
    createdAt: new Date('2025-01-01T09:00:00Z'),
    updatedAt: new Date('2025-01-01T10:30:00Z'),
    get progress() {
      return Math.round((this.processedRecords / this.totalRecords) * 100);
    },
    get isFinished() {
      return false;
    },
    get elapsedSeconds() {
      const endTime = this.completedAt || new Date();
      return Math.round((endTime.getTime() - this.startedAt.getTime()) / 1000);
    },
  };

  const mockCompletedJob: ReprocessingJob = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    status: ReprocessingJobStatus.COMPLETED,
    totalRecords: 1000,
    processedRecords: 1000,
    forwardedCount: 250,
    notForwardedCount: 600,
    unknownCount: 150,
    startedAt: new Date('2025-01-01T10:00:00Z'),
    completedAt: new Date('2025-01-01T11:00:00Z'),
    errorMessage: undefined,
    dateFrom: new Date('2025-01-01'),
    dateTo: new Date('2025-01-31T23:59:59.999Z'),
    createdAt: new Date('2025-01-01T09:00:00Z'),
    updatedAt: new Date('2025-01-01T11:00:00Z'),
    get progress() {
      return 100;
    },
    get isFinished() {
      return true;
    },
    get elapsedSeconds() {
      return Math.round(
        (this.completedAt.getTime() - this.startedAt.getTime()) / 1000,
      );
    },
  };

  const mockCancelledJob: ReprocessingJob = {
    ...mockJob,
    status: ReprocessingJobStatus.CANCELLED,
    completedAt: new Date('2025-01-01T10:45:00Z'),
    get progress() {
      return Math.round((this.processedRecords / this.totalRecords) * 100);
    },
    get isFinished() {
      return true;
    },
    get elapsedSeconds() {
      const endTime = this.completedAt || new Date();
      return Math.round((endTime.getTime() - this.startedAt.getTime()) / 1000);
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReprocessingController],
      providers: [
        {
          provide: ReprocessingService,
          useValue: {
            startReprocessing: jest.fn(),
            cancelReprocessing: jest.fn(),
            getCurrentJob: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ReprocessingController>(ReprocessingController);
    service = module.get<ReprocessingService>(ReprocessingService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('startReprocessing', () => {
    it('should start a reprocessing job with date range', async () => {
      const dto: StartReprocessingDto = {
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
      };

      const startSpy = jest
        .spyOn(service, 'startReprocessing')
        .mockResolvedValue(mockJob);

      const result = await controller.startReprocessing(dto);

      expect(result).toEqual(mockJob);
      expect(startSpy).toHaveBeenCalledWith(
        '2025-01-01',
        expect.stringMatching(/2025-01-31T\d{2}:59:59\.999Z/), // Date should be made inclusive
      );
    });

    it('should start a reprocessing job without date range', async () => {
      const dto: StartReprocessingDto = {};

      const jobWithoutDates = {
        ...mockJob,
        dateFrom: undefined,
        dateTo: undefined,
      } as ReprocessingJob;
      const startSpy = jest
        .spyOn(service, 'startReprocessing')
        .mockResolvedValue(jobWithoutDates);

      const result = await controller.startReprocessing(dto);

      expect(result).toEqual(jobWithoutDates);
      expect(startSpy).toHaveBeenCalledWith(undefined, undefined);
    });

    it('should start a reprocessing job with only dateFrom', async () => {
      const dto: StartReprocessingDto = {
        dateFrom: '2025-01-01',
      };

      const jobWithFromOnly = {
        ...mockJob,
        dateTo: undefined,
      } as ReprocessingJob;
      const startSpy = jest
        .spyOn(service, 'startReprocessing')
        .mockResolvedValue(jobWithFromOnly);

      const result = await controller.startReprocessing(dto);

      expect(result).toEqual(jobWithFromOnly);
      expect(startSpy).toHaveBeenCalledWith('2025-01-01', undefined);
    });

    it('should start a reprocessing job with only dateTo', async () => {
      const dto: StartReprocessingDto = {
        dateTo: '2025-01-31',
      };

      const jobWithToOnly = {
        ...mockJob,
        dateFrom: undefined,
      } as ReprocessingJob;
      const startSpy = jest
        .spyOn(service, 'startReprocessing')
        .mockResolvedValue(jobWithToOnly);

      const result = await controller.startReprocessing(dto);

      expect(result).toEqual(jobWithToOnly);
      expect(startSpy).toHaveBeenCalledWith(
        undefined,
        expect.stringMatching(/2025-01-31T\d{2}:59:59\.999Z/), // Should still be made inclusive
      );
    });

    it('should make dateTo inclusive by setting time to end of day', async () => {
      const dto: StartReprocessingDto = {
        dateFrom: '2025-01-01T00:00:00Z',
        dateTo: '2025-01-31T00:00:00Z',
      };

      const startSpy = jest
        .spyOn(service, 'startReprocessing')
        .mockResolvedValue(mockJob);

      await controller.startReprocessing(dto);

      // Verify the dateTo was converted to end of day
      expect(startSpy).toHaveBeenCalledWith(
        '2025-01-01T00:00:00Z',
        expect.stringMatching(/2025-01-31T\d{2}:59:59\.999Z/),
      );
    });
  });

  describe('cancelReprocessing', () => {
    it('should cancel a reprocessing job', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';

      const cancelSpy = jest
        .spyOn(service, 'cancelReprocessing')
        .mockResolvedValue(mockCancelledJob);

      const result = await controller.cancelReprocessing(jobId);

      expect(result).toEqual(mockCancelledJob);
      expect(result.status).toBe(ReprocessingJobStatus.CANCELLED);
      expect(cancelSpy).toHaveBeenCalledWith(jobId);
    });

    it('should handle cancelling a job by id', async () => {
      const jobId = 'abc-123';

      const cancelSpy = jest
        .spyOn(service, 'cancelReprocessing')
        .mockResolvedValue(mockCancelledJob);

      await controller.cancelReprocessing(jobId);

      expect(cancelSpy).toHaveBeenCalledWith(jobId);
    });
  });

  describe('getCurrentJob', () => {
    it('should return the current active job', async () => {
      const currentSpy = jest
        .spyOn(service, 'getCurrentJob')
        .mockResolvedValue(mockJob);

      const result = await controller.getCurrentJob();

      expect(result).toEqual(mockJob);
      expect(result!.status).toBe(ReprocessingJobStatus.RUNNING);
      expect(currentSpy).toHaveBeenCalled();
    });

    it('should return null when no active job exists', async () => {
      const currentSpy = jest
        .spyOn(service, 'getCurrentJob')
        .mockResolvedValue(null);

      const result = await controller.getCurrentJob();

      expect(result).toBeNull();
      expect(currentSpy).toHaveBeenCalled();
    });

    it('should return current job with progress calculation', async () => {
      jest.spyOn(service, 'getCurrentJob').mockResolvedValue(mockJob);

      const result = await controller.getCurrentJob();

      expect(result!.progress).toBe(50); // 500/1000 = 50%
    });
  });

  describe('findAll', () => {
    it('should return all reprocessing jobs', async () => {
      const jobs = [mockJob, mockCompletedJob, mockCancelledJob];

      const findAllSpy = jest.spyOn(service, 'findAll').mockResolvedValue(jobs);

      const result = await controller.findAll();

      expect(result).toEqual(jobs);
      expect(result).toHaveLength(3);
      expect(findAllSpy).toHaveBeenCalled();
    });

    it('should return empty array when no jobs exist', async () => {
      const findAllSpy = jest.spyOn(service, 'findAll').mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual([]);
      expect(findAllSpy).toHaveBeenCalled();
    });

    it('should return jobs with different statuses', async () => {
      const jobs = [
        {
          ...mockJob,
          status: ReprocessingJobStatus.PENDING,
        } as ReprocessingJob,
        {
          ...mockJob,
          status: ReprocessingJobStatus.RUNNING,
        } as ReprocessingJob,
        {
          ...mockJob,
          status: ReprocessingJobStatus.COMPLETED,
        } as ReprocessingJob,
        { ...mockJob, status: ReprocessingJobStatus.FAILED } as ReprocessingJob,
        {
          ...mockJob,
          status: ReprocessingJobStatus.CANCELLED,
        } as ReprocessingJob,
      ];

      jest.spyOn(service, 'findAll').mockResolvedValue(jobs);

      const result = await controller.findAll();

      expect(result).toHaveLength(5);
      expect(result.map((j) => j.status)).toEqual([
        ReprocessingJobStatus.PENDING,
        ReprocessingJobStatus.RUNNING,
        ReprocessingJobStatus.COMPLETED,
        ReprocessingJobStatus.FAILED,
        ReprocessingJobStatus.CANCELLED,
      ]);
    });
  });

  describe('findOne', () => {
    it('should return a single reprocessing job by id', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';

      const findOneSpy = jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockJob);

      const result = await controller.findOne(jobId);

      expect(result).toEqual(mockJob);
      expect(findOneSpy).toHaveBeenCalledWith(jobId);
    });

    it('should return a completed job with full statistics', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174001';

      jest.spyOn(service, 'findOne').mockResolvedValue(mockCompletedJob);

      const result = await controller.findOne(jobId);

      expect(result).toEqual(mockCompletedJob);
      expect(result.status).toBe(ReprocessingJobStatus.COMPLETED);
      expect(result.progress).toBe(100);
      expect(result.forwardedCount).toBe(250);
      expect(result.notForwardedCount).toBe(600);
      expect(result.unknownCount).toBe(150);
    });

    it('should return a failed job with error message', async () => {
      const failedJob = {
        ...mockJob,
        status: ReprocessingJobStatus.FAILED,
        errorMessage: 'Database connection timeout',
        completedAt: new Date('2025-01-01T10:30:00Z'),
      } as ReprocessingJob;

      jest.spyOn(service, 'findOne').mockResolvedValue(failedJob);

      const result = await controller.findOne('failed-job-id');

      expect(result.status).toBe(ReprocessingJobStatus.FAILED);
      expect(result.errorMessage).toBe('Database connection timeout');
    });
  });

  describe('makeToDateInclusive (helper method)', () => {
    it('should convert date string to end of day', () => {
      // Access private method via reflection for testing
      const makeToDateInclusive = (controller as any).makeToDateInclusive.bind(
        controller,
      );

      const result = makeToDateInclusive('2025-01-15');
      const resultDate = new Date(result as string);

      expect(resultDate.getHours()).toBe(23);
      expect(resultDate.getMinutes()).toBe(59);
      expect(resultDate.getSeconds()).toBe(59);
      expect(resultDate.getMilliseconds()).toBe(999);
    });

    it('should return undefined for undefined input', () => {
      const makeToDateInclusive = (controller as any).makeToDateInclusive.bind(
        controller,
      );

      const result = makeToDateInclusive(undefined);

      expect(result).toBeUndefined();
    });

    it('should handle ISO datetime strings', () => {
      const makeToDateInclusive = (controller as any).makeToDateInclusive.bind(
        controller,
      );

      const result = makeToDateInclusive('2025-01-15T12:30:00Z');
      const resultDate = new Date(result as string);

      // Should still set to end of day regardless of input time
      expect(resultDate.getHours()).toBe(23);
      expect(resultDate.getMinutes()).toBe(59);
      expect(resultDate.getSeconds()).toBe(59);
      expect(resultDate.getMilliseconds()).toBe(999);
    });
  });
});
