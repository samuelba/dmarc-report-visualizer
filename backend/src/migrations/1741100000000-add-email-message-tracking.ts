import { MigrationInterface, QueryRunner } from 'typeorm';
import { UUID_GENERATE_V7_FUNCTION_SQL } from './utils/uuid-v7-function';

export class AddEmailMessageTracking1741100000000 implements MigrationInterface {
  name = 'AddEmailMessageTracking1741100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // AddUuidV7174090000000 sorts last on fresh databases (see util), so make
    // sure the default-value function exists before creating the table.
    await queryRunner.query(UUID_GENERATE_V7_FUNCTION_SQL);

    await queryRunner.query(`
      CREATE TABLE email_message_tracking (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
        "messageId" varchar(500) NOT NULL,
        "accountIdentifier" varchar(200) NOT NULL,
        "source" varchar(20) NOT NULL DEFAULT 'imap',
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "attemptCount" int NOT NULL DEFAULT 0,
        "errorMessage" text,
        "reportId" uuid,
        "firstSeenAt" timestamp NOT NULL DEFAULT now(),
        "processedAt" timestamp,
        "lastAttemptAt" timestamp,
        CONSTRAINT fk_email_tracking_report FOREIGN KEY ("reportId") REFERENCES dmarc_reports(id) ON DELETE SET NULL
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_email_tracking_message_source_account ON email_message_tracking("messageId", "source", "accountIdentifier");
    `);

    await queryRunner.query(`
      CREATE INDEX idx_email_tracking_message_id ON email_message_tracking("messageId");
    `);

    await queryRunner.query(`
      CREATE INDEX idx_email_tracking_processed_at ON email_message_tracking("processedAt");
    `);

    await queryRunner.query(`
      CREATE INDEX idx_email_tracking_status ON email_message_tracking("status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_tracking_status;`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_email_tracking_processed_at;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_email_tracking_message_id;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_email_tracking_message_source_account;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS email_message_tracking;`);
  }
}
