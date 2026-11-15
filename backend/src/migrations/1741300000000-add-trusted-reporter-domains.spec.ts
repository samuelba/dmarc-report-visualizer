import { QueryRunner } from 'typeorm';
import { AddTrustedReporterDomains1741300000000 } from './1741300000000-add-trusted-reporter-domains';
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

describe('AddTrustedReporterDomains1741300000000', () => {
  it('creates the table after the uuid v7 function with a unique pair', async () => {
    const { runner, queries } = createQueryRunner();

    await new AddTrustedReporterDomains1741300000000().up(runner);

    const functionIdx = queries.indexOf(UUID_GENERATE_V7_FUNCTION_SQL);
    const tableIdx = queries.findIndex((q) =>
      q.includes('CREATE TABLE IF NOT EXISTS trusted_reporter_domains'),
    );
    expect(functionIdx).toBeGreaterThanOrEqual(0);
    expect(functionIdx).toBeLessThan(tableIdx);
    expect(queries[tableIdx]).toMatch(
      /UNIQUE \("claimedDomain", "authDomain"\)/,
    );
    expect(queries[tableIdx]).toMatch(
      /REFERENCES users\(id\) ON DELETE SET NULL/,
    );
  });

  it('drops only the table on down', async () => {
    const { runner, queries } = createQueryRunner();

    await new AddTrustedReporterDomains1741300000000().down(runner);

    expect(queries.join('\n')).toContain(
      'DROP TABLE IF EXISTS trusted_reporter_domains',
    );
    expect(queries.join('\n')).not.toContain('DROP FUNCTION');
  });
});
