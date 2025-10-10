import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add 'cancelled' status to the reprocessing_jobs status enum
 */
export class AddCancelledStatus1739300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add 'cancelled' to the enum type
    await queryRunner.query(`
      ALTER TYPE reprocessing_jobs_status_enum ADD VALUE IF NOT EXISTS 'cancelled'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: PostgreSQL doesn't support removing enum values directly
    // This would require recreating the enum type, which is complex and risky
    // For now, we'll leave the cancelled value in the enum even on rollback
    console.log('Warning: Cannot remove enum value "cancelled" in PostgreSQL. Manual intervention required if needed.');
  }
}
