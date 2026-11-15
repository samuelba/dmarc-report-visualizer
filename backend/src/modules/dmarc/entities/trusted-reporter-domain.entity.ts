import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';

/**
 * Admin approval that reports claiming `claimedDomain` (organizational
 * domain of their `<email>`) are genuine when authenticated as exactly
 * `authDomain`.
 */
@Entity('trusted_reporter_domains')
@Unique('uq_trusted_reporter_pair', ['claimedDomain', 'authDomain'])
export class TrustedReporterDomain {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  claimedDomain: string;

  @Column({ type: 'varchar', length: 255 })
  authDomain: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  createdByEmail: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
