import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { UserRole } from '../enums/user-role.enum';

@Entity('invite_tokens')
@Index('IDX_invite_tokens_token_hash', ['tokenHash'])
@Index('IDX_invite_tokens_email', ['email'])
@Index('IDX_invite_tokens_expires_at', ['expiresAt'])
@Index('IDX_invite_tokens_used', ['used'])
export class InviteToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, name: 'token_hash' })
  tokenHash: string;

  @Column()
  email: string;

  @Column({
    type: 'enum',
    enum: UserRole,
  })
  role: UserRole;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ default: false })
  used: boolean;

  @Column({ name: 'used_at', type: 'timestamp', nullable: true })
  usedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'used_by' })
  usedByUser: User | null;

  @Column({ name: 'used_by', type: 'uuid', nullable: true })
  usedBy: string | null;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
