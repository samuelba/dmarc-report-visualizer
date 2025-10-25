import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIpLookupTracking1739800000000 implements MigrationInterface {
  name = 'AddIpLookupTracking1739800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for geo lookup status
    await queryRunner.query(`
      CREATE TYPE "geo_lookup_status_enum" AS ENUM (
        'pending',
        'processing',
        'completed',
        'failed',
        'skipped'
      )
    `);

    // Add IP lookup tracking columns to dmarc_records
    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      ADD COLUMN "geoLookupStatus" "geo_lookup_status_enum" DEFAULT 'pending'
    `);

    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      ADD COLUMN "geoLookupAttempts" INTEGER DEFAULT 0 NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      ADD COLUMN "geoLookupLastAttempt" TIMESTAMP NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      ADD COLUMN "geoLookupCompletedAt" TIMESTAMP NULL
    `);

    // Create index for efficient querying of pending records
    await queryRunner.query(`
      CREATE INDEX "idx_dmarc_records_geo_lookup_status" 
      ON "dmarc_records" ("geoLookupStatus")
    `);

    // Update existing records that already have geo data
    await queryRunner.query(`
      UPDATE "dmarc_records" 
      SET "geoLookupStatus" = 'completed',
          "geoLookupCompletedAt" = NOW()
      WHERE "geoCountry" IS NOT NULL
    `);

    // Update records without source IP
    await queryRunner.query(`
      UPDATE "dmarc_records" 
      SET "geoLookupStatus" = 'skipped'
      WHERE "sourceIp" IS NULL
    `);

    // Set default for existing records with source IP but no geo data
    await queryRunner.query(`
      UPDATE "dmarc_records" 
      SET "geoLookupStatus" = 'pending'
      WHERE "sourceIp" IS NOT NULL 
        AND "geoCountry" IS NULL
        AND "geoLookupStatus" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_dmarc_records_geo_lookup_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      DROP COLUMN IF EXISTS "geoLookupCompletedAt"
    `);

    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      DROP COLUMN IF EXISTS "geoLookupLastAttempt"
    `);

    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      DROP COLUMN IF EXISTS "geoLookupAttempts"
    `);

    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      DROP COLUMN IF EXISTS "geoLookupStatus"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "geo_lookup_status_enum"
    `);
  }
}
