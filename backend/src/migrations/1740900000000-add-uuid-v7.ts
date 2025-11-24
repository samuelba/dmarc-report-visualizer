import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUuidV7174090000000 implements MigrationInterface {
  name = 'AddUuidV7174090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create uuid_generate_v7 function
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION uuid_generate_v7()
      RETURNS uuid
      AS $$
      DECLARE
        unix_ts_ms bytea;
        uuid_bytes bytea;
      BEGIN
        unix_ts_ms = substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);

        -- use random v4 uuid as starting point (which has the version bits, so we need to override them)
        uuid_bytes = uuid_send(gen_random_uuid());

        -- overlay timestamp
        uuid_bytes = overlay(uuid_bytes placing unix_ts_ms from 1 for 6);

        -- set version 7 (0111)
        uuid_bytes = set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & x'0f'::int) | x'70'::int);

        return encode(uuid_bytes, 'hex')::uuid;
      END
      $$
      LANGUAGE plpgsql
      VOLATILE;
    `);

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
