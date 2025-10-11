import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDateRangeColumns1739400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'reprocessing_jobs',
      new TableColumn({
        name: 'dateFrom',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'reprocessing_jobs',
      new TableColumn({
        name: 'dateTo',
        type: 'timestamp',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('reprocessing_jobs', 'dateTo');
    await queryRunner.dropColumn('reprocessing_jobs', 'dateFrom');
  }
}
