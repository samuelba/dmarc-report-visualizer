import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DmarcReport } from './dmarc-report.entity';
import type {
  AuthMethod,
  AuthStatus,
  DeliveryOutcome,
  DeliverySource,
} from '../utils/report-provenance';

/** One row per received copy of a report: the append-only ingest history. */
@Entity('dmarc_report_deliveries')
@Index('idx_report_delivery_report_received', ['reportId', 'receivedAt'])
export class DmarcReportDelivery {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ type: 'uuid' })
  reportId: string;

  @ManyToOne(() => DmarcReport, (report) => report.deliveries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'reportId' })
  report?: DmarcReport;

  @Column({ type: 'varchar', length: 16 })
  source: DeliverySource;

  @Column({ type: 'varchar', length: 500, nullable: true })
  sourceMessageId: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  receivedAt: Date;

  @Column({ type: 'varchar', length: 64, nullable: true })
  contentHash: string | null;

  @Column({ type: 'varchar', length: 16 })
  authStatus: AuthStatus;

  @Column({ type: 'varchar', length: 8, nullable: true })
  authMethod: AuthMethod | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  authDomain: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  claimedDomain: string | null;

  @Column({ type: 'jsonb', nullable: true })
  authDetails: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 16 })
  outcome: DeliveryOutcome;

  /** Only kept for `conflict` copies, so a dropped copy can be reviewed. */
  @Column({ type: 'text', nullable: true })
  rejectedXml: string | null;
}
