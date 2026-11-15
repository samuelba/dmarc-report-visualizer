import { QueryRunner } from 'typeorm';
import { AddReportProvenance1741200000000 } from './1741200000000-add-report-provenance';
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

const run = async (direction: 'up' | 'down'): Promise<string> => {
  const { runner, queries } = createQueryRunner();
  await new AddReportProvenance1741200000000()[direction](runner);
  return queries.join('\n');
};

describe('AddReportProvenance1741200000000', () => {
  it('adds the verdict columns, defaulting existing rows to legacy', async () => {
    const sql = await run('up');

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "contentHash" varchar(64)');
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS "authStatus" varchar\(16\) NOT NULL DEFAULT 'legacy'/,
    );
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "authDomain" varchar(255)');
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS "claimedDomain" varchar(255)',
    );
  });

  it('backfills contentHash with the same digest as hashReportXml', async () => {
    const sql = await run('up');

    expect(sql).toContain(
      `SET "contentHash" = encode(sha256(convert_to("originalXml", 'UTF8')), 'hex')`,
    );
  });

  it('creates the deliveries table after the uuid v7 function, cascading on report delete', async () => {
    const { runner, queries } = createQueryRunner();
    await new AddReportProvenance1741200000000().up(runner);

    const functionIdx = queries.indexOf(UUID_GENERATE_V7_FUNCTION_SQL);
    const tableIdx = queries.findIndex((q) =>
      q.includes('CREATE TABLE IF NOT EXISTS dmarc_report_deliveries'),
    );
    expect(functionIdx).toBeGreaterThanOrEqual(0);
    expect(functionIdx).toBeLessThan(tableIdx);
    expect(queries[tableIdx]).toMatch(
      /REFERENCES dmarc_reports\(id\) ON DELETE CASCADE/,
    );
  });

  it('reverts the table, indexes and columns on down', async () => {
    const sql = await run('down');

    expect(sql).toContain('DROP TABLE IF EXISTS dmarc_report_deliveries');
    expect(sql).toContain('DROP COLUMN IF EXISTS "authStatus"');
    expect(sql).toContain('DROP COLUMN IF EXISTS "contentHash"');
    expect(sql).not.toContain('DROP FUNCTION');
  });
});
