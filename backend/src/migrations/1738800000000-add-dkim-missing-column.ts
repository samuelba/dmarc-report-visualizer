import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDkimMissingColumn1738800000000 implements MigrationInterface {
  name = 'AddDkimMissingColumn1738800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add dkimMissing column to dmarc_records table
    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      ADD COLUMN "dkimMissing" boolean NOT NULL DEFAULT false
    `);

    // Update existing records: set dkimMissing = true where there are no dkim_results
    await queryRunner.query(`
      UPDATE "dmarc_records" rec
      SET "dkimMissing" = true
      WHERE NOT EXISTS (
        SELECT 1 FROM "dkim_results" dk WHERE dk."recordId" = rec.id
      )
    `);

    console.log('Updated existing records with dkimMissing flag');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove dkimMissing column
    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      DROP COLUMN "dkimMissing"
    `);
  }
}
