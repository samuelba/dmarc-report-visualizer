import { MigrationInterface, QueryRunner } from 'typeorm';

export class IncreaseRegionLength1740800000000 implements MigrationInterface {
  name = 'IncreaseRegionLength1740800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ip_locations" ALTER COLUMN "region" TYPE character varying(100)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ip_locations" ALTER COLUMN "region" TYPE character varying(10)`,
    );
  }
}
