import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { DmarcRecord } from './dmarc-record.entity';
import { DmarcReportDelivery } from './dmarc-report-delivery.entity';
import type { AuthStatus } from '../utils/report-provenance';

// Composite unique constraint handled by migration with COALESCE for NULL handling
@Index('idx_dmarc_report_domain', ['domain'])
@Index('idx_dmarc_report_begin_date', ['beginDate'])
@Index('idx_dmarc_report_end_date', ['endDate'])
@Index('idx_dmarc_report_auth_status', ['authStatus'])
@Index('idx_dmarc_report_claimed_auth_domain', ['claimedDomain', 'authDomain'])
@Entity('dmarc_reports')
export class DmarcReport {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ nullable: true })
  reportId: string;

  @Column({ nullable: true })
  orgName: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  domain: string;

  @Column({ type: 'jsonb', nullable: true })
  policy: Record<string, any>;

  // Store original XML for traceability and debugging
  @Column({ type: 'text', nullable: true })
  originalXml?: string;

  // Relationship to normalized records
  @OneToMany(() => DmarcRecord, (record) => record.report, { cascade: true })
  records: DmarcRecord[];

  @OneToMany(() => DmarcReportDelivery, (delivery) => delivery.report)
  deliveries?: DmarcReportDelivery[];

  @Column({ type: 'varchar', length: 64, nullable: true })
  contentHash: string | null;

  @Column({ type: 'varchar', length: 16, default: 'legacy' })
  authStatus: AuthStatus;

  /** Exact authenticated sender domain, e.g. `dmarc.yahoo.com`. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  authDomain: string | null;

  /** Organizational domain of the report's `<email>`. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  claimedDomain: string | null;

  @Column({ type: 'timestamp', nullable: true })
  beginDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  endDate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
