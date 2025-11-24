import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum RevocationReason {
  ROTATION = 'rotation',
  LOGOUT = 'logout',
  PASSWORD_CHANGE = 'password_change',
  THEFT_DETECTED = 'theft_detected',
}

@Entity('refresh_tokens')
@Index('idx_refresh_tokens_user_id', ['userId'])
@Index('idx_refresh_tokens_token', ['token'])
@Index('idx_refresh_tokens_expires_at', ['expiresAt'])
@Index('idx_refresh_tokens_family_id', ['familyId'])
export class RefreshToken {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column()
  token: string;

  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  @Column({
    name: 'revocation_reason',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  revocationReason: RevocationReason | null;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ default: false })
  revoked: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
