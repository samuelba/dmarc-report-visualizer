import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddForwardingDetection1739000000000 implements MigrationInterface {
  name = 'AddForwardingDetection1739000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add isForwarded column to dmarc_records table
    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      ADD COLUMN "isForwarded" boolean DEFAULT NULL
    `);

    // Add forwardReason column to store human-readable explanation
    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      ADD COLUMN "forwardReason" text DEFAULT NULL
    `);

    // Add index on isForwarded for efficient filtering
    await queryRunner.query(`
      CREATE INDEX "idx_dmarc_record_is_forwarded" 
      ON "dmarc_records" ("isForwarded")
    `);

    console.log(
      'Added isForwarded and forwardReason columns to dmarc_records table',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_dmarc_record_is_forwarded"
    `);

    // Remove forwardReason column
    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      DROP COLUMN "forwardReason"
    `);

    // Remove isForwarded column
    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      DROP COLUMN "isForwarded"
    `);
  }
}
