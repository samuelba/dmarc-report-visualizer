import { MigrationInterface, QueryRunner } from 'typeorm';
import { UUID_GENERATE_V7_FUNCTION_SQL } from './utils/uuid-v7-function';

/**
 * Report provenance (audit H2): a current sender-auth verdict on each report,
 * and one delivery row per received copy so collisions never silently
 * overwrite data. Existing reports become `legacy`.
 */
export class AddReportProvenance1741200000000 implements MigrationInterface {
  name = 'AddReportProvenance1741200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dmarc_reports
        ADD COLUMN IF NOT EXISTS "contentHash" varchar(64),
        ADD COLUMN IF NOT EXISTS "authStatus" varchar(16) NOT NULL DEFAULT 'legacy',
        ADD COLUMN IF NOT EXISTS "authDomain" varchar(255),
        ADD COLUMN IF NOT EXISTS "claimedDomain" varchar(255);
    `);

    await queryRunner.query(`
      UPDATE dmarc_reports
      SET "contentHash" = encode(sha256(convert_to("originalXml", 'UTF8')), 'hex')
      WHERE "originalXml" IS NOT NULL AND "contentHash" IS NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_dmarc_report_auth_status
        ON dmarc_reports("authStatus");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_dmarc_report_claimed_auth_domain
        ON dmarc_reports("claimedDomain", "authDomain");
    `);

    // AddUuidV7174090000000 sorts last on fresh databases (see util).
    await queryRunner.query(UUID_GENERATE_V7_FUNCTION_SQL);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dmarc_report_deliveries (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
        "reportId" uuid NOT NULL,
        "source" varchar(16) NOT NULL,
        "sourceMessageId" varchar(500),
        "receivedAt" timestamp with time zone NOT NULL DEFAULT now(),
        "contentHash" varchar(64),
        "authStatus" varchar(16) NOT NULL,
        "authMethod" varchar(8),
        "authDomain" varchar(255),
        "claimedDomain" varchar(255),
        "authDetails" jsonb,
        "outcome" varchar(16) NOT NULL,
        "rejectedXml" text,
        CONSTRAINT fk_report_delivery_report FOREIGN KEY ("reportId") REFERENCES dmarc_reports(id) ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_report_delivery_report_received
        ON dmarc_report_deliveries("reportId", "receivedAt");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_report_delivery_report_received;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS dmarc_report_deliveries;`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_dmarc_report_claimed_auth_domain;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_dmarc_report_auth_status;`,
    );
    await queryRunner.query(`
      ALTER TABLE dmarc_reports
        DROP COLUMN IF EXISTS "claimedDomain",
        DROP COLUMN IF EXISTS "authDomain",
        DROP COLUMN IF EXISTS "authStatus",
        DROP COLUMN IF EXISTS "contentHash";
    `);
  }
}
