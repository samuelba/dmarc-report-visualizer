import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { IsBoolean, IsString, IsUUID, IsDate } from 'class-validator';
import { User } from './user.entity';

@Entity('recovery_codes')
@Index('idx_recovery_codes_user_id', ['userId'])
export class RecoveryCode {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  @IsUUID()
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @IsUUID()
  userId: string;

  @ManyToOne(() => User, (user) => user.recoveryCodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'code_hash', type: 'text' })
  @IsString()
  codeHash: string;

  @Column({ name: 'used', default: false })
  @IsBoolean()
  used: boolean;

  @Column({ name: 'used_at', type: 'timestamp', nullable: true })
  @IsDate()
  usedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  @IsDate()
  createdAt: Date;
}
