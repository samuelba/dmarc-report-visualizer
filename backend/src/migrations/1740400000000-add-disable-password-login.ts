import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDisablePasswordLogin1740400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add disablePasswordLogin column to saml_configs table
    await queryRunner.addColumn(
      'saml_configs',
      new TableColumn({
        name: 'disable_password_login',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove disablePasswordLogin column from saml_configs table
    await queryRunner.dropColumn('saml_configs', 'disable_password_login');
  }
}
