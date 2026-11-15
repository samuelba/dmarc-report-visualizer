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
import { ApiTokenScope } from '../enums/api-token-scope.enum';

/**
 * Personal API token for the MCP endpoint. Only the SHA-256 hash of the
 * token is stored; the plaintext is shown to the user once at creation.
 */
@Entity('api_tokens')
@Index('IDX_api_tokens_user_id', ['userId'])
export class ApiToken {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 32 })
  prefix: string;

  @Column({ type: 'text', array: true })
  scopes: ApiTokenScope[];

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'last_used_ip', type: 'varchar', length: 64, nullable: true })
  lastUsedIp: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
