import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { DmarcRecord } from './dmarc-record.entity';

@Index('idx_dkim_result_domain', ['domain'])
@Index('idx_dkim_result_result', ['result'])
@Entity('dkim_results')
export class DkimResult {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  // Foreign key to DmarcRecord
  @Column({ type: 'uuid' })
  recordId: string;

  @ManyToOne(() => DmarcRecord, (record) => record.dkimResults, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'recordId' })
  record: DmarcRecord;

  // DKIM verification details
  @Column({ nullable: true })
  domain: string;

  @Column({ nullable: true })
  selector: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  result:
    | 'none'
    | 'pass'
    | 'fail'
    | 'policy'
    | 'neutral'
    | 'temperror'
    | 'permerror';

  @Column({ type: 'text', nullable: true })
  humanResult: string;
}
