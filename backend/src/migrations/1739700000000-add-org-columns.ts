import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrgColumns1739700000000 implements MigrationInterface {
  name = 'AddOrgColumns1739700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add org column to ip_locations table
    await queryRunner.query(`
      ALTER TABLE "ip_locations" 
      ADD COLUMN "org" VARCHAR(200) NULL
    `);

    // Add isp and org columns to dmarc_records table
    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      ADD COLUMN "geoIsp" VARCHAR(200) NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      ADD COLUMN "geoOrg" VARCHAR(200) NULL
    `);

    // Create index on org for filtering
    await queryRunner.query(`
      CREATE INDEX "idx_ip_locations_org" ON "ip_locations" ("org")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_dmarc_records_geo_isp" ON "dmarc_records" ("geoIsp")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_dmarc_records_geo_org" ON "dmarc_records" ("geoOrg")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_dmarc_records_geo_org"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_dmarc_records_geo_isp"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_ip_locations_org"
    `);

    // Drop columns
    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      DROP COLUMN IF EXISTS "geoOrg"
    `);

    await queryRunner.query(`
      ALTER TABLE "dmarc_records" 
      DROP COLUMN IF EXISTS "geoIsp"
    `);

    await queryRunner.query(`
      ALTER TABLE "ip_locations" 
      DROP COLUMN IF EXISTS "org"
    `);
  }
}
