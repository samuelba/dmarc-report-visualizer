import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddReprocessedColumn1739200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add reprocessed column to dmarc_records table
    // Default to TRUE for existing records (they've already been processed)
    // New records will have this set to FALSE initially
    await queryRunner.addColumn(
      'dmarc_records',
      new TableColumn({
        name: 'reprocessed',
        type: 'boolean',
        default: true,
        isNullable: false,
        comment: 'Whether this record has been processed by the latest forwarding detection algorithm',
      }),
    );

    // Create index for faster queries on unprocessed records
    await queryRunner.query(`
      CREATE INDEX "IDX_dmarc_records_reprocessed" ON "dmarc_records" ("reprocessed");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`
      DROP INDEX "IDX_dmarc_records_reprocessed";
    `);

    // Drop column
    await queryRunner.dropColumn('dmarc_records', 'reprocessed');
  }
}
