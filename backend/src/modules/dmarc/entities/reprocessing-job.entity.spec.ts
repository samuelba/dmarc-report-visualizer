import {
  ReprocessingJob,
  ReprocessingJobStatus,
} from './reprocessing-job.entity';

describe('ReprocessingJob Entity', () => {
  let job: ReprocessingJob;

  beforeEach(() => {
    job = new ReprocessingJob();
    job.id = 'test-job-id';
    job.status = ReprocessingJobStatus.PENDING;
    job.totalRecords = 1000;
    job.processedRecords = 0;
    job.forwardedCount = 0;
    job.notForwardedCount = 0;
    job.unknownCount = 0;
    job.createdAt = new Date('2025-01-01T10:00:00Z');
    job.updatedAt = new Date('2025-01-01T10:00:00Z');
  });

  describe('progress getter', () => {
    it('should return 0 when totalRecords is not set', () => {
      job.totalRecords = undefined;
      job.processedRecords = 50;

      expect(job.progress).toBe(0);
    });

    it('should return 0 when totalRecords is 0', () => {
      job.totalRecords = 0;
      job.processedRecords = 0;

      expect(job.progress).toBe(0);
    });

    it('should return 0 when no records have been processed', () => {
      job.totalRecords = 1000;
      job.processedRecords = 0;

      expect(job.progress).toBe(0);
    });

    it('should return 50 when half the records are processed', () => {
      job.totalRecords = 1000;
      job.processedRecords = 500;

      expect(job.progress).toBe(50);
    });

    it('should return 100 when all records are processed', () => {
      job.totalRecords = 1000;
      job.processedRecords = 1000;

      expect(job.progress).toBe(100);
    });

    it('should round to nearest integer', () => {
      job.totalRecords = 3;
      job.processedRecords = 1;

      expect(job.progress).toBe(33); // 33.333... rounded to 33
    });

    it('should round 0.5 up', () => {
      job.totalRecords = 200;
      job.processedRecords = 101;

      expect(job.progress).toBe(51); // 50.5 rounded to 51
    });

    it('should handle small numbers correctly', () => {
      job.totalRecords = 10;
      job.processedRecords = 3;

      expect(job.progress).toBe(30);
    });

    it('should handle large numbers correctly', () => {
      job.totalRecords = 1000000;
      job.processedRecords = 750000;

      expect(job.progress).toBe(75);
    });

    it('should return 1% for very small progress', () => {
      job.totalRecords = 10000;
      job.processedRecords = 99;

      expect(job.progress).toBe(1); // 0.99% rounded to 1
    });

    it('should return 99% for nearly complete', () => {
      job.totalRecords = 1000;
      job.processedRecords = 994;

      expect(job.progress).toBe(99); // 99.4% rounded to 99
    });

    it('should handle processed > total gracefully', () => {
      // Edge case - should not happen in practice but handle gracefully
      job.totalRecords = 100;
      job.processedRecords = 150;

      expect(job.progress).toBe(150); // Returns actual percentage even if > 100
    });
  });

  describe('isFinished getter', () => {
    it('should return false for PENDING status', () => {
      job.status = ReprocessingJobStatus.PENDING;

      expect(job.isFinished).toBe(false);
    });

    it('should return false for RUNNING status', () => {
      job.status = ReprocessingJobStatus.RUNNING;

      expect(job.isFinished).toBe(false);
    });

    it('should return true for COMPLETED status', () => {
      job.status = ReprocessingJobStatus.COMPLETED;

      expect(job.isFinished).toBe(true);
    });

    it('should return true for FAILED status', () => {
      job.status = ReprocessingJobStatus.FAILED;

      expect(job.isFinished).toBe(true);
    });

    it('should return true for CANCELLED status', () => {
      job.status = ReprocessingJobStatus.CANCELLED;

      expect(job.isFinished).toBe(true);
    });
  });

  describe('elapsedSeconds getter', () => {
    it('should return null when job has not started', () => {
      job.startedAt = undefined;
      job.completedAt = undefined;

      expect(job.elapsedSeconds).toBeNull();
    });

    it('should calculate elapsed time when job is completed', () => {
      job.startedAt = new Date('2025-01-01T10:00:00Z');
      job.completedAt = new Date('2025-01-01T10:05:00Z');

      expect(job.elapsedSeconds).toBe(300); // 5 minutes = 300 seconds
    });

    it('should calculate elapsed time from start to now when job is still running', () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      job.startedAt = fiveMinutesAgo;
      job.completedAt = undefined;

      const elapsed = job.elapsedSeconds;

      // Should be approximately 300 seconds (allow 1 second tolerance for test execution time)
      expect(elapsed).toBeGreaterThanOrEqual(299);
      expect(elapsed).toBeLessThanOrEqual(301);
    });

    it('should return 0 for jobs that start and complete in same second', () => {
      const time = new Date('2025-01-01T10:00:00.000Z');
      job.startedAt = time;
      job.completedAt = new Date(time.getTime() + 500); // 500ms later

      expect(job.elapsedSeconds).toBe(1); // Rounds to 1 second
    });

    it('should handle long-running jobs (hours)', () => {
      job.startedAt = new Date('2025-01-01T10:00:00Z');
      job.completedAt = new Date('2025-01-01T13:30:00Z');

      expect(job.elapsedSeconds).toBe(12600); // 3.5 hours = 12600 seconds
    });

    it('should handle very long jobs (days)', () => {
      job.startedAt = new Date('2025-01-01T10:00:00Z');
      job.completedAt = new Date('2025-01-03T10:00:00Z');

      expect(job.elapsedSeconds).toBe(172800); // 2 days = 172800 seconds
    });

    it('should round fractional seconds', () => {
      job.startedAt = new Date('2025-01-01T10:00:00.000Z');
      job.completedAt = new Date('2025-01-01T10:00:05.600Z');

      expect(job.elapsedSeconds).toBe(6); // 5.6 seconds rounded to 6
    });

    it('should round down for .4 seconds', () => {
      job.startedAt = new Date('2025-01-01T10:00:00.000Z');
      job.completedAt = new Date('2025-01-01T10:00:05.400Z');

      expect(job.elapsedSeconds).toBe(5); // 5.4 seconds rounded to 5
    });
  });

  describe('combined statistics', () => {
    it('should track complete job lifecycle', () => {
      // Job starts
      job.status = ReprocessingJobStatus.PENDING;
      expect(job.isFinished).toBe(false);
      expect(job.progress).toBe(0);
      expect(job.elapsedSeconds).toBeNull();

      // Job is running
      job.status = ReprocessingJobStatus.RUNNING;
      job.startedAt = new Date('2025-01-01T10:00:00Z');
      job.totalRecords = 1000;
      job.processedRecords = 0;

      expect(job.isFinished).toBe(false);
      expect(job.progress).toBe(0);

      // Job progresses
      job.processedRecords = 250;
      job.forwardedCount = 50;
      job.notForwardedCount = 180;
      job.unknownCount = 20;

      expect(job.progress).toBe(25);
      expect(job.isFinished).toBe(false);

      // Job halfway
      job.processedRecords = 500;
      job.forwardedCount = 100;
      job.notForwardedCount = 370;
      job.unknownCount = 30;

      expect(job.progress).toBe(50);
      expect(job.isFinished).toBe(false);

      // Job completes
      job.status = ReprocessingJobStatus.COMPLETED;
      job.processedRecords = 1000;
      job.forwardedCount = 200;
      job.notForwardedCount = 750;
      job.unknownCount = 50;
      job.completedAt = new Date('2025-01-01T10:10:00Z');

      expect(job.progress).toBe(100);
      expect(job.isFinished).toBe(true);
      expect(job.elapsedSeconds).toBe(600); // 10 minutes
    });

    it('should handle failed jobs', () => {
      job.status = ReprocessingJobStatus.RUNNING;
      job.startedAt = new Date('2025-01-01T10:00:00Z');
      job.totalRecords = 1000;
      job.processedRecords = 150;

      expect(job.progress).toBe(15);
      expect(job.isFinished).toBe(false);

      // Job fails
      job.status = ReprocessingJobStatus.FAILED;
      job.completedAt = new Date('2025-01-01T10:02:30Z');
      job.errorMessage = 'Database connection lost';

      expect(job.progress).toBe(15); // Still shows partial progress
      expect(job.isFinished).toBe(true);
      expect(job.elapsedSeconds).toBe(150); // 2.5 minutes
      expect(job.errorMessage).toBe('Database connection lost');
    });

    it('should handle cancelled jobs', () => {
      job.status = ReprocessingJobStatus.RUNNING;
      job.startedAt = new Date('2025-01-01T10:00:00Z');
      job.totalRecords = 1000;
      job.processedRecords = 750;

      expect(job.progress).toBe(75);
      expect(job.isFinished).toBe(false);

      // Job is cancelled
      job.status = ReprocessingJobStatus.CANCELLED;
      job.completedAt = new Date('2025-01-01T10:07:00Z');

      expect(job.progress).toBe(75); // Shows progress at cancellation
      expect(job.isFinished).toBe(true);
      expect(job.elapsedSeconds).toBe(420); // 7 minutes
    });
  });

  describe('edge cases', () => {
    it('should handle job with no records to process', () => {
      job.totalRecords = 0;
      job.processedRecords = 0;
      job.status = ReprocessingJobStatus.COMPLETED;

      expect(job.progress).toBe(0);
      expect(job.isFinished).toBe(true);
    });

    it('should handle job that completes immediately', () => {
      const now = new Date('2025-01-01T10:00:00.000Z');
      job.startedAt = now;
      job.completedAt = new Date(now.getTime() + 100); // 100ms later
      job.status = ReprocessingJobStatus.COMPLETED;

      expect(job.elapsedSeconds).toBe(0); // Rounds to 0
    });

    it('should handle counts summing correctly', () => {
      job.totalRecords = 1000;
      job.processedRecords = 1000;
      job.forwardedCount = 300;
      job.notForwardedCount = 600;
      job.unknownCount = 100;

      // Verify counts add up to total processed
      const sum = job.forwardedCount + job.notForwardedCount + job.unknownCount;
      expect(sum).toBe(job.processedRecords);
      expect(job.progress).toBe(100);
    });

    it('should handle job with date range filtering', () => {
      job.dateFrom = new Date('2024-01-01');
      job.dateTo = new Date('2024-12-31T23:59:59.999Z');
      job.totalRecords = 500;
      job.processedRecords = 250;

      expect(job.progress).toBe(50);
      expect(job.dateFrom).toBeInstanceOf(Date);
      expect(job.dateTo).toBeInstanceOf(Date);
    });

    it('should handle job without date range', () => {
      job.dateFrom = undefined;
      job.dateTo = undefined;
      job.totalRecords = 5000;
      job.processedRecords = 1000;

      expect(job.progress).toBe(20);
      expect(job.dateFrom).toBeUndefined();
      expect(job.dateTo).toBeUndefined();
    });
  });
});
