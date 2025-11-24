import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { DmarcReport } from './dmarc-report.entity';
import { DkimResult } from './dkim-result.entity';
import { SpfResult } from './spf-result.entity';
import { PolicyOverrideReason } from './policy-override-reason.entity';

// Enum for IP lookup status
export enum GeoLookupStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

@Index('idx_dmarc_record_source_ip', ['sourceIp'])
@Index('idx_dmarc_record_header_from', ['headerFrom'])
@Index('idx_dmarc_record_count', ['count'])
@Index('idx_dmarc_record_is_forwarded', ['isForwarded'])
@Entity('dmarc_records')
export class DmarcRecord {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
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

  // DKIM missing indicator - true if auth_results has no dkim entry
  @Column({ type: 'boolean', default: false })
  dkimMissing: boolean;

  // Forwarding detection
  @Column({ type: 'boolean', nullable: true })
  isForwarded: boolean | null;

  @Column({ type: 'text', nullable: true })
  forwardReason: string | null;

  // Reprocessing tracking
  @Column({ type: 'boolean', default: true })
  @Index('idx_dmarc_record_reprocessed')
  reprocessed: boolean;

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

  @Column({ type: 'varchar', length: 200, nullable: true })
  @Index('idx_dmarc_records_geo_isp')
  geoIsp: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  @Index('idx_dmarc_records_geo_org')
  geoOrg: string;

  // IP Lookup tracking
  @Column({
    type: 'enum',
    enum: GeoLookupStatus,
    nullable: true,
    default: GeoLookupStatus.PENDING,
  })
  @Index('idx_dmarc_records_geo_lookup_status')
  geoLookupStatus: GeoLookupStatus | null;

  @Column({ type: 'integer', default: 0 })
  geoLookupAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  geoLookupLastAttempt: Date;

  @Column({ type: 'timestamp', nullable: true })
  geoLookupCompletedAt: Date;

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
