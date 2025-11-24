import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Third-party sender configuration entity.
 * Used to define regex patterns for identifying legitimate third-party email senders
 * (like SendGrid, Mailgun, etc.) that should NOT be marked as forwarded emails.
 */
@Entity('third_party_senders')
@Index(['enabled'])
export class ThirdPartySender {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  dkimPattern?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  spfPattern?: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Test if a domain matches the DKIM pattern
   */
  matchesDkim(domain: string | null | undefined): boolean {
    if (!this.enabled || !this.dkimPattern || !domain) {
      return false;
    }

    try {
      const regex = new RegExp(this.dkimPattern, 'i');
      return regex.test(domain);
    } catch (error) {
      console.error(`Invalid DKIM regex pattern for ${this.name}:`, error);
      return false;
    }
  }

  /**
   * Test if a domain matches the SPF pattern
   */
  matchesSpf(domain: string | null | undefined): boolean {
    if (!this.enabled || !this.spfPattern || !domain) {
      return false;
    }

    try {
      const regex = new RegExp(this.spfPattern, 'i');
      return regex.test(domain);
    } catch (error) {
      console.error(`Invalid SPF regex pattern for ${this.name}:`, error);
      return false;
    }
  }
}
