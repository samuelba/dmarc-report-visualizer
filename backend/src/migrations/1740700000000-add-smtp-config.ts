import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddSmtpConfig1740700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for security modes
    await queryRunner.query(`
      CREATE TYPE smtp_security_mode AS ENUM ('none', 'tls', 'starttls')
    `);

    // Create smtp_config table
    await queryRunner.createTable(
      new Table({
        name: 'smtp_config',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            default: 1,
          },
          {
            name: 'host',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'port',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'securityMode',
            type: 'smtp_security_mode',
            default: "'starttls'",
            isNullable: false,
          },
          {
            name: 'username',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'encrypted_password',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'from_email',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'from_name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'reply_to_email',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'enabled',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'updated_by_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Add unique constraint on id column to enforce singleton
    await queryRunner.createIndex(
      'smtp_config',
      new TableIndex({
        name: 'UQ_smtp_config_id',
        columnNames: ['id'],
        isUnique: true,
      }),
    );

    // Add foreign key constraint from smtp_config.updated_by_id to users
    await queryRunner.createForeignKey(
      'smtp_config',
      new TableForeignKey({
        columnNames: ['updated_by_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Add index on updated_by_id for performance
    await queryRunner.createIndex(
      'smtp_config',
      new TableIndex({
        name: 'IDX_smtp_config_updated_by_id',
        columnNames: ['updated_by_id'],
      }),
    );

    // Add check constraint to ensure id is always 1
    await queryRunner.query(`
      ALTER TABLE smtp_config 
      ADD CONSTRAINT CHK_smtp_config_singleton 
      CHECK (id = 1)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop check constraint
    await queryRunner.query(`
      ALTER TABLE smtp_config 
      DROP CONSTRAINT CHK_smtp_config_singleton
    `);

    // Drop indexes
    await queryRunner.dropIndex('smtp_config', 'IDX_smtp_config_updated_by_id');
    await queryRunner.dropIndex('smtp_config', 'UQ_smtp_config_id');

    // Drop foreign key
    const table = await queryRunner.getTable('smtp_config');
    const foreignKeys = table?.foreignKeys || [];

    for (const foreignKey of foreignKeys) {
      await queryRunner.dropForeignKey('smtp_config', foreignKey);
    }

    // Drop smtp_config table
    await queryRunner.dropTable('smtp_config');

    // Drop enum type
    await queryRunner.query(`DROP TYPE smtp_security_mode`);
  }
}
