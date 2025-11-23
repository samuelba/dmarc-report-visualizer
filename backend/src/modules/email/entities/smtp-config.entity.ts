import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('smtp_config')
export class SmtpConfig {
  // Fixed ID to enforce singleton pattern - only one SMTP configuration allowed
  @PrimaryColumn({ default: 1 })
  id: number;

  @Column({ type: 'varchar' })
  host: string;

  @Column({ type: 'int' })
  port: number;

  @Column({
    type: 'enum',
    enum: ['none', 'tls', 'starttls'],
    default: 'starttls',
  })
  securityMode: string;

  @Column({ type: 'varchar', nullable: true })
  username: string | null;

  @Column({ type: 'text', name: 'encrypted_password', nullable: true })
  encryptedPassword: string | null;

  @Column({ type: 'varchar', name: 'from_email' })
  fromEmail: string;

  @Column({ type: 'varchar', name: 'from_name' })
  fromName: string;

  @Column({ type: 'varchar', name: 'reply_to_email', nullable: true })
  replyToEmail: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'uuid', name: 'updated_by_id' })
  updatedById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'updated_by_id' })
  updatedBy: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
