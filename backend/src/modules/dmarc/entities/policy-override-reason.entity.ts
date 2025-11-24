import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { DmarcRecord } from './dmarc-record.entity';

@Index('idx_policy_override_type', ['type'])
@Entity('policy_override_reasons')
export class PolicyOverrideReason {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  // Foreign key to DmarcRecord
  @Column({ type: 'uuid' })
  recordId: string;

  @ManyToOne(() => DmarcRecord, (record) => record.policyOverrideReasons, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'recordId' })
  record: DmarcRecord;

  // Policy override details
  @Column({ type: 'varchar', length: 30, nullable: true })
  type:
    | 'forwarded'
    | 'sampled_out'
    | 'trusted_forwarder'
    | 'mailing_list'
    | 'local_policy'
    | 'other';

  @Column({ type: 'text', nullable: true })
  comment: string;
}
