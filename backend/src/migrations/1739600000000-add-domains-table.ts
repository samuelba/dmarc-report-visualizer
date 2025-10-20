import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDomainsTable1739600000000 implements MigrationInterface {
  name = 'AddDomainsTable1739600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "domains" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "domain" character varying(255) NOT NULL,
        "notes" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_domains" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_domains_domain" ON "domains" ("domain")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_domains_domain"`);
    await queryRunner.query(`DROP TABLE "domains"`);
  }
}
