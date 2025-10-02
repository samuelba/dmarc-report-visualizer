import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { DmarcRecord } from './dmarc-record.entity';

@Index('idx_spf_result_domain', ['domain'])
@Index('idx_spf_result_result', ['result'])
@Entity('spf_results')
export class SpfResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Foreign key to DmarcRecord
  @Column({ type: 'uuid' })
  recordId: string;

  @ManyToOne(() => DmarcRecord, (record) => record.spfResults, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'recordId' })
  record: DmarcRecord;

  // SPF verification details
  @Column({ nullable: true })
  domain: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  result:
    | 'none'
    | 'neutral'
    | 'pass'
    | 'fail'
    | 'softfail'
    | 'temperror'
    | 'permerror';
}
