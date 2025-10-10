import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ReprocessingJobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Tracks background jobs that reprocess DMARC records for forwarding detection.
 * Created when third-party sender configuration changes.
 */
@Entity('reprocessing_jobs')
@Index(['status'])
export class ReprocessingJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ReprocessingJobStatus,
    default: ReprocessingJobStatus.PENDING,
  })
  status: ReprocessingJobStatus;

  @Column({ type: 'integer', nullable: true })
  totalRecords?: number;

  @Column({ type: 'integer', default: 0 })
  processedRecords: number;

  @Column({ type: 'integer', default: 0 })
  forwardedCount: number;

  @Column({ type: 'integer', default: 0 })
  notForwardedCount: number;

  @Column({ type: 'integer', default: 0 })
  unknownCount: number;

  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Calculate progress percentage
   */
  get progress(): number {
    if (!this.totalRecords || this.totalRecords === 0) {
      return 0;
    }
    return Math.round((this.processedRecords / this.totalRecords) * 100);
  }

  /**
   * Check if job is in a terminal state
   */
  get isFinished(): boolean {
    return (
      this.status === ReprocessingJobStatus.COMPLETED ||
      this.status === ReprocessingJobStatus.FAILED ||
      this.status === ReprocessingJobStatus.CANCELLED
    );
  }

  /**
   * Get elapsed time in seconds
   */
  get elapsedSeconds(): number | null {
    if (!this.startedAt) return null;
    
    const endTime = this.completedAt || new Date();
    return Math.round((endTime.getTime() - this.startedAt.getTime()) / 1000);
  }
}
