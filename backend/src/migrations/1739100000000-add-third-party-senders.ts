import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddThirdPartySenders1739100000000 implements MigrationInterface {
  name = 'AddThirdPartySenders1739100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create third_party_senders table
    await queryRunner.createTable(
      new Table({
        name: 'third_party_senders',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false,
            comment: 'Human-readable name for the third-party sender (e.g., "SendGrid", "Mailgun")',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
            comment: 'Optional description explaining when this sender is used',
          },
          {
            name: 'dkimPattern',
            type: 'varchar',
            length: '500',
            isNullable: true,
            comment: 'Regex pattern to match DKIM domains (e.g., ".*\\.sendgrid\\.net$")',
          },
          {
            name: 'spfPattern',
            type: 'varchar',
            length: '500',
            isNullable: true,
            comment: 'Regex pattern to match SPF domains (e.g., ".*\\.sendgrid\\.net$")',
          },
          {
            name: 'enabled',
            type: 'boolean',
            default: true,
            isNullable: false,
            comment: 'Whether this third-party sender filter is currently active',
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create index on enabled column for faster lookups
    await queryRunner.createIndex(
      'third_party_senders',
      new TableIndex({
        name: 'IDX_third_party_senders_enabled',
        columnNames: ['enabled'],
      }),
    );

    // Insert some common third-party senders as examples
    await queryRunner.query(`
      INSERT INTO third_party_senders (name, description, "dkimPattern", "spfPattern", enabled)
      VALUES
        (
          'SendGrid',
          'SendGrid email delivery service',
          '.*\\.sendgrid\\.(net|info)$',
          '.*\\.sendgrid\\.(net|info)$',
          true
        ),
        (
          'Mailgun',
          'Mailgun transactional email service',
          '.*\\.mailgun\\.(org|com)$',
          '.*\\.mailgun\\.(org|com)$',
          true
        ),
        (
          'Amazon SES',
          'Amazon Simple Email Service',
          '.*\\.amazonses\\.com$',
          '.*\\.amazonses\\.com$',
          true
        ),
        (
          'Postmark',
          'Postmark transactional email service',
          '.*\\.postmarkapp\\.com$',
          '.*\\.postmarkapp\\.com$',
          true
        ),
        (
          'SparkPost',
          'SparkPost email delivery platform',
          '.*\\.sparkpostmail\\.com$',
          '.*\\.sparkpostmail\\.com$',
          true
        ),
        (
          'Mandrill',
          'Mandrill by Mailchimp transactional email',
          '.*\\.mandrillapp\\.com$',
          '.*\\.mandrillapp\\.com$',
          true
        ),
        (
          'HubSpot',
          'HubSpot email marketing platform',
          '.*\\.(hubspotemail|hubspotservicehub|hs-inbox)\\.(net|com)$',
          '.*\\.(hubspotemail|hubspotservicehub|hs-inbox)\\.(net|com)$',
          true
        )
    `);

    // Create a reprocessing_jobs table to track background reprocessing
    await queryRunner.createTable(
      new Table({
        name: 'reprocessing_jobs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'running', 'completed', 'failed'],
            default: "'pending'",
            isNullable: false,
          },
          {
            name: 'totalRecords',
            type: 'integer',
            isNullable: true,
            comment: 'Total number of records to process',
          },
          {
            name: 'processedRecords',
            type: 'integer',
            default: 0,
            isNullable: false,
            comment: 'Number of records processed so far',
          },
          {
            name: 'forwardedCount',
            type: 'integer',
            default: 0,
            isNullable: false,
          },
          {
            name: 'notForwardedCount',
            type: 'integer',
            default: 0,
            isNullable: false,
          },
          {
            name: 'unknownCount',
            type: 'integer',
            default: 0,
            isNullable: false,
          },
          {
            name: 'startedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'completedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create index on status for faster job lookups
    await queryRunner.createIndex(
      'reprocessing_jobs',
      new TableIndex({
        name: 'IDX_reprocessing_jobs_status',
        columnNames: ['status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('reprocessing_jobs', true);
    await queryRunner.dropTable('third_party_senders', true);
  }
}
