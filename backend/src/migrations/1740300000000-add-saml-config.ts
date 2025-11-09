import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSamlConfig1740300000000 implements MigrationInterface {
  name = 'AddSamlConfig1740300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create saml_configs table
    await queryRunner.query(`
      CREATE TABLE "saml_configs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "enabled" BOOLEAN DEFAULT FALSE,
        "idp_entity_id" VARCHAR(500) NULL,
        "idp_sso_url" VARCHAR(500) NULL,
        "idp_certificate" TEXT NULL,
        "sp_entity_id" VARCHAR(255) NOT NULL,
        "sp_acs_url" VARCHAR(500) NOT NULL,
        "idp_metadata_xml" TEXT NULL,
        "created_at" TIMESTAMP DEFAULT NOW(),
        "updated_at" TIMESTAMP DEFAULT NOW(),
        "updated_by" uuid NULL,
        CONSTRAINT "fk_saml_configs_updated_by" FOREIGN KEY ("updated_by") 
          REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);

    // Create index on updated_by for foreign key performance
    await queryRunner.query(`
      CREATE INDEX "idx_saml_configs_updated_by" ON "saml_configs"("updated_by");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_saml_configs_updated_by";`,
    );

    // Drop table
    await queryRunner.query(`DROP TABLE IF EXISTS "saml_configs";`);
  }
}
