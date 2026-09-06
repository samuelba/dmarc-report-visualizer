import { MigrationInterface, QueryRunner } from 'typeorm';

export const EMPTY_PLACEHOLDER_RECORD_SQL = `
  "sourceIp" IS NULL
    AND (count = 0 OR count IS NULL)
    AND ("headerFrom" IS NULL OR "headerFrom" = '')
    AND disposition IS NULL
    AND "dmarcDkim" IS NULL
    AND "dmarcSpf" IS NULL
    AND ("envelopeTo" IS NULL OR "envelopeTo" = '')
    AND ("envelopeFrom" IS NULL OR "envelopeFrom" = '')
    AND ("reasonType" IS NULL OR "reasonType" = '')
    AND ("reasonComment" IS NULL OR "reasonComment" = '')
    AND NOT EXISTS (
      SELECT 1 FROM dkim_results dr
      WHERE dr."recordId" = dmarc_records.id
        AND ((dr.domain IS NOT NULL AND dr.domain != '') OR (dr.result IS NOT NULL AND dr.result != ''))
    )
    AND NOT EXISTS (
      SELECT 1 FROM spf_results sr
      WHERE sr."recordId" = dmarc_records.id
        AND ((sr.domain IS NOT NULL AND sr.domain != '') OR (sr.result IS NOT NULL AND sr.result != ''))
    )
    AND NOT EXISTS (
      SELECT 1 FROM policy_override_reasons por
      WHERE por."recordId" = dmarc_records.id
        AND ((por.type IS NOT NULL AND por.type != '') OR (por.comment IS NOT NULL AND por.comment != ''))
    )
`;

export function affectedRowCount(result: unknown): number {
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    if (typeof record.rowCount === 'number') {
      return record.rowCount;
    }
    if (typeof record.affected === 'number') {
      return record.affected;
    }
  }
  if (
    Array.isArray(result) &&
    result.length > 1 &&
    typeof result[1] === 'number'
  ) {
    return result[1];
  }
  return 0;
}

export class RemoveEmptyPlaceholderRecords1741000000000 implements MigrationInterface {
  name = 'RemoveEmptyPlaceholderRecords1741000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Some DMARC reporters (e.g. o2.pl) send reports with empty placeholder
    // records when they observed zero traffic for the reporting period.
    // These records have no source IP, count of 0, no header_from, no
    // disposition, and no auth results. They pollute analytics with
    // "Unknown" entries and carry no useful information.
    //
    // Step 1: Capture report IDs that contain placeholder records
    // Step 2: Delete empty placeholder records (checking child auth tables)
    // Step 3: Delete orphaned reports that lost all records in step 2

    // --- Step 1: Capture report IDs that will be affected ---
    const affectedReports = (await queryRunner.query(`
      SELECT DISTINCT "reportId" FROM dmarc_records
      WHERE ${EMPTY_PLACEHOLDER_RECORD_SQL}
    `)) as Array<{ reportId: string }>;
    const affectedReportIds = affectedReports.map((r) => r.reportId);

    // --- Step 2: Delete empty placeholder records ---
    const deleteRecordsResult = await queryRunner.query(
      `
      DELETE FROM dmarc_records
      WHERE ${EMPTY_PLACEHOLDER_RECORD_SQL}
    `,
      undefined,
      true,
    );
    const deletedRecords = affectedRowCount(deleteRecordsResult);
    console.log(`Deleted ${deletedRecords} empty placeholder record(s)`);

    // --- Step 3: Delete orphaned reports that lost all records in step 2 ---
    let deletedReports = 0;
    if (affectedReportIds.length > 0) {
      const deleteReportsResult = await queryRunner.query(
        `DELETE FROM dmarc_reports
         WHERE id = ANY($1::uuid[])
           AND NOT EXISTS (
             SELECT 1 FROM dmarc_records WHERE "reportId" = dmarc_reports.id
           )`,
        [affectedReportIds],
        true,
      );
      deletedReports = affectedRowCount(deleteReportsResult);
    }
    console.log(
      `Deleted ${deletedReports} orphaned report(s) with no remaining records`,
    );

    console.log('\n=== Migration Summary ===');
    console.log(`Empty placeholder records removed: ${deletedRecords}`);
    console.log(`Orphaned reports removed: ${deletedReports}`);
  }

  public down(_queryRunner: QueryRunner): Promise<void> {
    return Promise.reject(
      new Error(
        'Migration 1741000000000 is irreversible: deleted empty placeholder records and orphaned report metadata/original XML cannot be restored.',
      ),
    );
  }
}
