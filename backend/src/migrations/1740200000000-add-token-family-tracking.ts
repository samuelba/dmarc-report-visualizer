import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTokenFamilyTracking1740200000000 implements MigrationInterface {
  name = 'AddTokenFamilyTracking1740200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add family_id column (nullable initially for backfill)
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens" 
      ADD COLUMN "family_id" uuid NULL;
    `);

    // Add revocation_reason column (nullable)
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens" 
      ADD COLUMN "revocation_reason" VARCHAR(50) NULL;
    `);

    // Create index on family_id for efficient family queries
    await queryRunner.query(`
      CREATE INDEX "idx_refresh_tokens_family_id" ON "refresh_tokens"("family_id");
    `);

    // Backfill existing tokens: set family_id = id (each token is its own family)
    await queryRunner.query(`
      UPDATE "refresh_tokens" 
      SET "family_id" = "id" 
      WHERE "family_id" IS NULL;
    `);

    // Verify backfill - this query should return 0
    const result = (await queryRunner.query(`
      SELECT COUNT(*) as count 
      FROM "refresh_tokens" 
      WHERE "family_id" IS NULL;
    `)) as { count: string }[];

    const nullCount = parseInt(String(result[0]?.count ?? '0'), 10);
    if (nullCount > 0) {
      throw new Error(
        `Backfill verification failed: ${nullCount} tokens still have NULL family_id`,
      );
    }

    // Make family_id NOT NULL after successful backfill
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens" 
      ALTER COLUMN "family_id" SET NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_refresh_tokens_family_id";`,
    );

    // Drop columns
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens" 
      DROP COLUMN IF EXISTS "revocation_reason";
    `);

    await queryRunner.query(`
      ALTER TABLE "refresh_tokens" 
      DROP COLUMN IF EXISTS "family_id";
    `);
  }
}
