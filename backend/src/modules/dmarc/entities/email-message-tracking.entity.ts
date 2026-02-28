import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum EmailSource {
  IMAP = 'imap',
  POP3 = 'pop3',
  GMAIL = 'gmail',
}

export enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
}

@Entity('email_message_tracking')
@Index(
  'idx_email_tracking_message_source_account',
  ['messageId', 'source', 'accountIdentifier'],
  { unique: true },
)
@Index('idx_email_tracking_message_id', ['messageId'])
@Index('idx_email_tracking_processed_at', ['processedAt'])
@Index('idx_email_tracking_status', ['status'])
export class EmailMessageTracking {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ type: 'varchar', length: 500 })
  messageId: string;

  @Column({ type: 'varchar', length: 200 })
  accountIdentifier: string;

  @Column({
    type: 'varchar',
    length: 20,
    enum: EmailSource,
    default: EmailSource.IMAP,
  })
  source: EmailSource;

  @Column({
    type: 'varchar',
    length: 20,
    enum: ProcessingStatus,
    default: ProcessingStatus.PENDING,
  })
  status: ProcessingStatus;

  @Column({ type: 'int', default: 0 })
  attemptCount: number;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'uuid', nullable: true })
  reportId: string;

  @CreateDateColumn()
  firstSeenAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastAttemptAt: Date;
}
