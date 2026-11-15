import { MigrationInterface, QueryRunner } from 'typeorm';
import { UUID_GENERATE_V7_FUNCTION_SQL } from './utils/uuid-v7-function';

/**
 * Admin-approved (claimed domain, authenticated domain) pairs that make an
 * otherwise unaligned reporter, such as Yahoo, count as aligned.
 */
export class AddTrustedReporterDomains1741300000000 implements MigrationInterface {
  name = 'AddTrustedReporterDomains1741300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // AddUuidV7174090000000 sorts last on fresh databases (see util).
    await queryRunner.query(UUID_GENERATE_V7_FUNCTION_SQL);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS trusted_reporter_domains (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
        "claimedDomain" varchar(255) NOT NULL,
        "authDomain" varchar(255) NOT NULL,
        "note" text,
        "createdBy" uuid,
        "createdByEmail" varchar(255),
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT uq_trusted_reporter_pair UNIQUE ("claimedDomain", "authDomain"),
        CONSTRAINT fk_trusted_reporter_user FOREIGN KEY ("createdBy") REFERENCES users(id) ON DELETE SET NULL
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS trusted_reporter_domains;`);
  }
}
