import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { DmarcReport } from './dmarc-report.entity';
import { DkimResult } from './dkim-result.entity';
import { SpfResult } from './spf-result.entity';
import { PolicyOverrideReason } from './policy-override-reason.entity';

@Index('idx_dmarc_record_source_ip', ['sourceIp'])
@Index('idx_dmarc_record_header_from', ['headerFrom'])
@Index('idx_dmarc_record_count', ['count'])
@Entity('dmarc_records')
export class DmarcRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Foreign key to DmarcReport
  @Column({ type: 'uuid' })
  reportId: string;

  @ManyToOne(() => DmarcReport, (report) => report.records, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'reportId' })
  report: DmarcReport;

  // Row information
  @Column({ type: 'inet', nullable: true })
  sourceIp: string;

  @Column({ type: 'integer', nullable: true })
  count: number;

  // Policy evaluated
  @Column({ type: 'varchar', length: 20, nullable: true })
  disposition: 'none' | 'quarantine' | 'reject';

  @Column({ type: 'varchar', length: 10, nullable: true })
  dmarcDkim: 'pass' | 'fail';

  @Column({ type: 'varchar', length: 10, nullable: true })
  dmarcSpf: 'pass' | 'fail';

  // Identifiers
  @Column({ nullable: true })
  envelopeTo: string;

  @Column({ nullable: true })
  envelopeFrom: string;

  @Column({ nullable: true })
  headerFrom: string;

  @Column({ nullable: true })
  reasonType: string;

  @Column({ nullable: true })
  reasonComment: string;

  // Geolocation data (cached from IP lookup)
  @Column({ type: 'varchar', length: 2, nullable: true })
  geoCountry: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  geoCountryName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  geoCity: string;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  geoLatitude: number;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  geoLongitude: number;

  // Relationships to authentication results
  @OneToMany(() => DkimResult, (dkimResult) => dkimResult.record, {
    cascade: true,
  })
  dkimResults: DkimResult[];

  @OneToMany(() => SpfResult, (spfResult) => spfResult.record, {
    cascade: true,
  })
  spfResults: SpfResult[];

  @OneToMany(() => PolicyOverrideReason, (reason) => reason.record, {
    cascade: true,
  })
  policyOverrideReasons: PolicyOverrideReason[];
}
