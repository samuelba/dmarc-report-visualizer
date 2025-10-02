import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSetup1734000000000 implements MigrationInterface {
  name = 'InitialSetup1734000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable UUID extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // Create dmarc_reports table
    await queryRunner.query(`
      CREATE TABLE "dmarc_reports" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "reportId" text NULL,
        "orgName" text NULL,
        "email" text NULL,
        "domain" text NULL,
        "policy" jsonb NULL,
        "originalXml" text NULL,
        "beginDate" timestamp NULL,
        "endDate" timestamp NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    // Create indexes for dmarc_reports
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_dmarc_report_report_id" ON "dmarc_reports" ("reportId") WHERE "reportId" IS NOT NULL;`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dmarc_report_domain" ON "dmarc_reports" ("domain");`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dmarc_report_begin_date" ON "dmarc_reports" ("beginDate");`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dmarc_report_end_date" ON "dmarc_reports" ("endDate");`,
    );

    // Create dmarc_records table
    await queryRunner.query(`
      CREATE TABLE "dmarc_records" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "reportId" uuid NOT NULL,
        "sourceIp" inet NULL,
        "count" integer NULL,
        "disposition" varchar(20) NULL,
        "dmarcDkim" varchar(10) NULL,
        "dmarcSpf" varchar(10) NULL,
        "envelopeTo" text NULL,
        "envelopeFrom" text NULL,
        "headerFrom" text NULL,
        "reasonType" text NULL,
        "reasonComment" text NULL,
        "geoCountry" varchar(2) NULL,
        "geoCountryName" varchar(100) NULL,
        "geoCity" varchar(100) NULL,
        "geoLatitude" decimal(10,8) NULL,
        "geoLongitude" decimal(11,8) NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_dmarc_records_report" FOREIGN KEY ("reportId") REFERENCES "dmarc_reports"("id") ON DELETE CASCADE
      );
    `);

    // Create indexes for dmarc_records
    await queryRunner.query(
      `CREATE INDEX "idx_dmarc_record_report_id" ON "dmarc_records" ("reportId");`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dmarc_record_source_ip" ON "dmarc_records" ("sourceIp");`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dmarc_record_header_from" ON "dmarc_records" ("headerFrom");`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dmarc_record_count" ON "dmarc_records" ("count");`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dmarc_record_disposition" ON "dmarc_records" ("disposition");`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dmarc_record_dmarc_dkim" ON "dmarc_records" ("dmarcDkim");`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dmarc_record_dmarc_spf" ON "dmarc_records" ("dmarcSpf");`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dmarc_record_envelope_to" ON "dmarc_records" ("envelopeTo");`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dmarc_record_envelope_from" ON "dmarc_records" ("envelopeFrom");`,
    );

    // Create dkim_results table
    await queryRunner.query(`
      CREATE TABLE "dkim_results" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "recordId" uuid NOT NULL,
        "domain" text NULL,
        "selector" text NULL,
        "result" text NULL,
        "humanResult" text NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_dkim_results_record" FOREIGN KEY ("recordId") REFERENCES "dmarc_records"("id") ON DELETE CASCADE
      );
    `);

    // Create spf_results table
    await queryRunner.query(`
      CREATE TABLE "spf_results" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "recordId" uuid NOT NULL,
        "domain" text NULL,
        "result" text NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_spf_results_record" FOREIGN KEY ("recordId") REFERENCES "dmarc_records"("id") ON DELETE CASCADE
      );
    `);

    // Create policy_override_reasons table
    await queryRunner.query(`
      CREATE TABLE "policy_override_reasons" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "recordId" uuid NOT NULL,
        "type" text NULL,
        "comment" text NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_policy_override_reasons_record" FOREIGN KEY ("recordId") REFERENCES "dmarc_records"("id") ON DELETE CASCADE
      );
    `);

    // Create ip_locations table
    await queryRunner.query(`
      CREATE TABLE "ip_locations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ip" inet NOT NULL UNIQUE,
        "country" varchar(2) NULL,
        "countryName" varchar(100) NULL,
        "region" varchar(10) NULL,
        "regionName" varchar(100) NULL,
        "city" varchar(100) NULL,
        "latitude" decimal(10,8) NULL,
        "longitude" decimal(11,8) NULL,
        "timezone" varchar(50) NULL,
        "isp" varchar(200) NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    // Create indexes for dkim_results
    await queryRunner.query(
      `CREATE INDEX "idx_dkim_result_domain" ON "dkim_results" ("domain");`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dkim_result_result" ON "dkim_results" ("result");`,
    );

    // Create indexes for spf_results
    await queryRunner.query(
      `CREATE INDEX "idx_spf_result_domain" ON "spf_results" ("domain");`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_spf_result_result" ON "spf_results" ("result");`,
    );

    // Create indexes for policy_override_reasons
    await queryRunner.query(
      `CREATE INDEX "idx_policy_override_type" ON "policy_override_reasons" ("type");`,
    );

    // Create indexes for ip_locations
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_ip_locations_ip" ON "ip_locations" ("ip");`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_ip_locations_country" ON "ip_locations" ("country");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "policy_override_reasons";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "spf_results";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dkim_results";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ip_locations";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dmarc_records";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dmarc_reports";`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp";`);
  }
}
