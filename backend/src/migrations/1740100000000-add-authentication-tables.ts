import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthenticationTables1740100000000
  implements MigrationInterface
{
  name = 'AddAuthenticationTables1740100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" VARCHAR(255) UNIQUE NOT NULL,
        "password_hash" VARCHAR(255) NOT NULL,
        "auth_provider" VARCHAR(50) DEFAULT 'local',
        "organization_id" uuid NULL,
        "created_at" TIMESTAMP DEFAULT NOW(),
        "updated_at" TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create refresh_tokens table
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "token" VARCHAR(500) NOT NULL,
        "user_id" uuid NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "revoked" BOOLEAN DEFAULT FALSE,
        "created_at" TIMESTAMP DEFAULT NOW(),
        CONSTRAINT "fk_refresh_tokens_user" FOREIGN KEY ("user_id") 
          REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens"("user_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_refresh_tokens_token" ON "refresh_tokens"("token");
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_refresh_tokens_expires_at" ON "refresh_tokens"("expires_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_refresh_tokens_expires_at";`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_token";`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_refresh_tokens_user_id";`,
    );

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users";`);
  }
}
