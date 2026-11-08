import { MigrationInterface, QueryRunner } from 'typeorm';
import { UUID_GENERATE_V7_FUNCTION_SQL } from './utils/uuid-v7-function';

export class AddUuidV7174090000000 implements MigrationInterface {
  name = 'AddUuidV7174090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create uuid_generate_v7 function
    await queryRunner.query(UUID_GENERATE_V7_FUNCTION_SQL);

    // List of tables to update
    const tables = [
      'dmarc_reports',
      'dmarc_records',
      'dkim_results',
      'spf_results',
      'policy_override_reasons',
      'ip_locations',
      'users',
      'refresh_tokens',
      'recovery_codes',
      'invite_tokens',
      'saml_configs',
      'third_party_senders',
      'reprocessing_jobs',
      'domains',
    ];

    // Update default value for each table
    for (const table of tables) {
      // Check if table exists first to avoid errors if some features aren't enabled/migrated yet
      const tableExists = await queryRunner.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '${table}')`,
      );

      if (tableExists[0].exists) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT uuid_generate_v7()`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'dmarc_reports',
      'dmarc_records',
      'dkim_results',
      'spf_results',
      'policy_override_reasons',
      'ip_locations',
      'users',
      'refresh_tokens',
      'recovery_codes',
      'invite_tokens',
      'saml_configs',
      'third_party_senders',
      'reprocessing_jobs',
      'domains',
    ];

    for (const table of tables) {
      const tableExists = await queryRunner.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '${table}')`,
      );

      if (tableExists[0].exists) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
        );
      }
    }

    await queryRunner.query(`DROP FUNCTION IF EXISTS uuid_generate_v7()`);
  }
}
