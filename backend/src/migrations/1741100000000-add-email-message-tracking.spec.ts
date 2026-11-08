import { QueryRunner } from 'typeorm';
import { AddEmailMessageTracking1741100000000 } from './1741100000000-add-email-message-tracking';
import { AddUuidV7174090000000 } from './1740900000000-add-uuid-v7';
import { UUID_GENERATE_V7_FUNCTION_SQL } from './utils/uuid-v7-function';

const createQueryRunner = (): { runner: QueryRunner; queries: string[] } => {
  const queries: string[] = [];
  const runner = {
    query: jest.fn((sql: string) => {
      queries.push(sql);
      return Promise.resolve([{ exists: false }]);
    }),
  } as unknown as QueryRunner;
  return { runner, queries };
};

describe('AddEmailMessageTracking1741100000000', () => {
  it('creates uuid_generate_v7() before the table that defaults to it', async () => {
    // AddUuidV7174090000000 has a 12-digit suffix, so TypeORM sorts it as
    // 7174090000000 and runs it LAST on fresh databases. This migration must
    // therefore not rely on it having created the function.
    const { runner, queries } = createQueryRunner();

    await new AddEmailMessageTracking1741100000000().up(runner);

    const functionIdx = queries.findIndex((q) =>
      q.includes('CREATE OR REPLACE FUNCTION uuid_generate_v7()'),
    );
    const tableIdx = queries.findIndex((q) =>
      q.includes('CREATE TABLE email_message_tracking'),
    );
    expect(functionIdx).toBeGreaterThanOrEqual(0);
    expect(functionIdx).toBeLessThan(tableIdx);
  });

  it('uses the same function definition as the uuid v7 migration', async () => {
    const tracking = createQueryRunner();
    const uuid = createQueryRunner();

    await new AddEmailMessageTracking1741100000000().up(tracking.runner);
    await new AddUuidV7174090000000().up(uuid.runner);

    expect(tracking.queries).toContain(UUID_GENERATE_V7_FUNCTION_SQL);
    expect(uuid.queries).toContain(UUID_GENERATE_V7_FUNCTION_SQL);
  });

  it('does not drop the shared uuid_generate_v7() function on down', async () => {
    const { runner, queries } = createQueryRunner();

    await new AddEmailMessageTracking1741100000000().down(runner);

    expect(queries.join('\n')).not.toContain('DROP FUNCTION');
    expect(queries.join('\n')).toContain(
      'DROP TABLE IF EXISTS email_message_tracking',
    );
  });
});
