import { QueryRunner } from 'typeorm';
import { AddApiTokens1741400000000 } from './1741400000000-add-api-tokens';
import { UUID_GENERATE_V7_FUNCTION_SQL } from './utils/uuid-v7-function';

const createQueryRunner = (): { runner: QueryRunner; queries: string[] } => {
  const queries: string[] = [];
  const runner = {
    query: jest.fn((sql: string) => {
      queries.push(sql);
      return Promise.resolve([]);
    }),
  } as unknown as QueryRunner;
  return { runner, queries };
};

describe('AddApiTokens1741400000000', () => {
  it('creates the table after the uuid v7 function', async () => {
    const { runner, queries } = createQueryRunner();

    await new AddApiTokens1741400000000().up(runner);

    const functionIdx = queries.indexOf(UUID_GENERATE_V7_FUNCTION_SQL);
    const tableIdx = queries.findIndex((q) =>
      q.includes('CREATE TABLE IF NOT EXISTS api_tokens'),
    );
    expect(functionIdx).toBeGreaterThanOrEqual(0);
    expect(functionIdx).toBeLessThan(tableIdx);
  });

  it('stores only a unique token hash and cascades user deletion', async () => {
    const { runner, queries } = createQueryRunner();

    await new AddApiTokens1741400000000().up(runner);

    const sql = queries.join('\n');
    expect(sql).toMatch(/"token_hash" varchar\(64\) NOT NULL UNIQUE/);
    expect(sql).not.toMatch(/"token" /);
    expect(sql).toMatch(/"expires_at" timestamp with time zone NOT NULL/);
    expect(sql).toMatch(/REFERENCES users\(id\) ON DELETE CASCADE/);
    expect(sql).toContain('IDX_api_tokens_user_id');
  });

  it('drops only the table on down', async () => {
    const { runner, queries } = createQueryRunner();

    await new AddApiTokens1741400000000().down(runner);

    expect(queries.join('\n')).toContain('DROP TABLE IF EXISTS api_tokens');
    expect(queries.join('\n')).not.toContain('DROP FUNCTION');
  });
});
