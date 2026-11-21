import { MigrationInterface, QueryRunner } from 'typeorm';
import { UUID_GENERATE_V7_FUNCTION_SQL } from './utils/uuid-v7-function';

/**
 * Personal API tokens for the MCP endpoint. The table exists whether or not
 * MCP_ENABLED is set, so the schema does not depend on the feature switch.
 */
export class AddApiTokens1741400000000 implements MigrationInterface {
  name = 'AddApiTokens1741400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // AddUuidV7174090000000 sorts last on fresh databases (see util).
    await queryRunner.query(UUID_GENERATE_V7_FUNCTION_SQL);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS api_tokens (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
        "token_hash" varchar(64) NOT NULL UNIQUE,
        "name" varchar(100) NOT NULL,
        "prefix" varchar(32) NOT NULL,
        "scopes" text[] NOT NULL,
        "user_id" uuid NOT NULL,
        "expires_at" timestamp with time zone NOT NULL,
        "last_used_at" timestamp with time zone,
        "last_used_ip" varchar(64),
        "revoked_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT fk_api_tokens_user FOREIGN KEY ("user_id") REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_api_tokens_user_id" ON api_tokens ("user_id");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS api_tokens;`);
  }
}
