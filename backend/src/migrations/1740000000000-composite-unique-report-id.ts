import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompositeUniqueReportId1740000000000
  implements MigrationInterface
{
  name = 'CompositeUniqueReportId1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the old unique index on reportId alone
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_dmarc_report_report_id";`,
    );

    // Create a new composite unique index on reportId, orgName, and email
    // Using COALESCE to handle NULL values properly
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_dmarc_report_composite" 
      ON "dmarc_reports" (
        "reportId", 
        COALESCE("orgName", ''), 
        COALESCE("email", '')
      ) 
      WHERE "reportId" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the composite unique index
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_dmarc_report_composite";`,
    );

    // Restore the old unique index on reportId alone
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_dmarc_report_report_id" ON "dmarc_reports" ("reportId") WHERE "reportId" IS NOT NULL;`,
    );
  }
}
