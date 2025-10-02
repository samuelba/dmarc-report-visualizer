import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
  OneToMany,
} from 'typeorm';
import { DmarcRecord } from './dmarc-record.entity';

@Unique('uq_dmarc_report_report_id', ['reportId'])
@Index('idx_dmarc_report_domain', ['domain'])
@Index('idx_dmarc_report_begin_date', ['beginDate'])
@Index('idx_dmarc_report_end_date', ['endDate'])
@Entity('dmarc_reports')
export class DmarcReport {
  @PrimaryGeneratedColumn('uuid')
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

  @Column({ type: 'timestamp', nullable: true })
  beginDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  endDate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
