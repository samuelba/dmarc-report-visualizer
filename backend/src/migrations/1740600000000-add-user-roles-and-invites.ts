import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddUserRolesAndInvites1740600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for user roles
    await queryRunner.query(`
      CREATE TYPE user_role AS ENUM ('user', 'administrator')
    `);

    // Add role column to users table
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'role',
        type: 'user_role',
        default: "'user'",
        isNullable: false,
      }),
    );

    // Set first user as administrator
    await queryRunner.query(`
      UPDATE users 
      SET role = 'administrator' 
      WHERE id = (SELECT id FROM users ORDER BY created_at LIMIT 1)
    `);

    // Create invite_tokens table
    await queryRunner.createTable(
      new Table({
        name: 'invite_tokens',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'token_hash',
            type: 'varchar',
            length: '255',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'role',
            type: 'user_role',
            isNullable: false,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
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
            name: 'used_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'created_by_id',
            type: 'uuid',
            isNullable: false,
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

    // Add foreign key constraint from invite_tokens.used_by to users
    await queryRunner.createForeignKey(
      'invite_tokens',
      new TableForeignKey({
        columnNames: ['used_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    // Add foreign key constraint from invite_tokens.created_by_id to users
    await queryRunner.createForeignKey(
      'invite_tokens',
      new TableForeignKey({
        columnNames: ['created_by_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Create indexes for performance
    await queryRunner.createIndex(
      'invite_tokens',
      new TableIndex({
        name: 'IDX_invite_tokens_token_hash',
        columnNames: ['token_hash'],
      }),
    );

    await queryRunner.createIndex(
      'invite_tokens',
      new TableIndex({
        name: 'IDX_invite_tokens_email',
        columnNames: ['email'],
      }),
    );

    await queryRunner.createIndex(
      'invite_tokens',
      new TableIndex({
        name: 'IDX_invite_tokens_expires_at',
        columnNames: ['expires_at'],
      }),
    );

    await queryRunner.createIndex(
      'invite_tokens',
      new TableIndex({
        name: 'IDX_invite_tokens_used',
        columnNames: ['used'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('invite_tokens', 'IDX_invite_tokens_used');
    await queryRunner.dropIndex(
      'invite_tokens',
      'IDX_invite_tokens_expires_at',
    );
    await queryRunner.dropIndex('invite_tokens', 'IDX_invite_tokens_email');
    await queryRunner.dropIndex(
      'invite_tokens',
      'IDX_invite_tokens_token_hash',
    );

    // Drop foreign keys
    const table = await queryRunner.getTable('invite_tokens');
    const foreignKeys = table?.foreignKeys || [];

    for (const foreignKey of foreignKeys) {
      await queryRunner.dropForeignKey('invite_tokens', foreignKey);
    }

    // Drop invite_tokens table
    await queryRunner.dropTable('invite_tokens');

    // Remove role column from users table
    await queryRunner.dropColumn('users', 'role');

    // Drop enum type
    await queryRunner.query(`DROP TYPE user_role`);
  }
}
