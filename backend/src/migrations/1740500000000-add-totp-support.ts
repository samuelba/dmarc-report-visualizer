import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddTotpSupport1740500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add TOTP columns to users table
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'totp_secret',
        type: 'text',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'totp_enabled',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'totp_enabled_at',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'totp_last_used_at',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    // Create recovery_codes table
    await queryRunner.createTable(
      new Table({
        name: 'recovery_codes',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'code_hash',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'used',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'used_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Add foreign key constraint from recovery_codes to users with CASCADE delete
    await queryRunner.createForeignKey(
      'recovery_codes',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Add index on recovery_codes.user_id for performance
    await queryRunner.createIndex(
      'recovery_codes',
      new TableIndex({
        name: 'IDX_recovery_codes_user_id',
        columnNames: ['user_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.dropIndex('recovery_codes', 'IDX_recovery_codes_user_id');

    // Drop foreign key (TypeORM will find it by column names)
    const table = await queryRunner.getTable('recovery_codes');
    const foreignKey = table?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('user_id') !== -1,
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('recovery_codes', foreignKey);
    }

    // Drop recovery_codes table
    await queryRunner.dropTable('recovery_codes');

    // Remove TOTP columns from users table
    await queryRunner.dropColumn('users', 'totp_last_used_at');
    await queryRunner.dropColumn('users', 'totp_enabled_at');
    await queryRunner.dropColumn('users', 'totp_enabled');
    await queryRunner.dropColumn('users', 'totp_secret');
  }
}
