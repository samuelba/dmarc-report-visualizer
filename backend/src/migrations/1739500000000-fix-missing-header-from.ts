import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to fix missing headerFrom fields caused by XML reports using
 * <identities> instead of <identifiers> tag.
 *
 * This migration:
 * 1. Finds all reports with records that have missing headerFrom
 * 2. Re-parses those reports from stored XML using the updated parser
 * 3. Updates the affected records with correct headerFrom values
 */
export class FixMissingHeaderFrom1739500000000 implements MigrationInterface {
  name = 'FixMissingHeaderFrom1739500000000';

  // Typed shape of rows returned by initial affected records query
  private static readonly affectedRecordKeys = [
    'record_id',
    'report_id',
    'originalXml',
    'sourceIp',
  ] as const;
  private static isAffectedRecordRow(
    this: void,
    row: unknown,
  ): row is {
    record_id: string;
    report_id: string;
    originalXml: string;
    sourceIp: string | null;
  } {
    if (!row || typeof row !== 'object') {
      return false;
    }
    return FixMissingHeaderFrom1739500000000.affectedRecordKeys.every(
      (k) => k in (row as Record<string, unknown>),
    );
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Find all records with missing headerFrom that have stored XML in their parent report
    const affectedRecordsRaw = await queryRunner.query(`
      SELECT
        dr.id as record_id,
        dr."reportId" as report_id,
        r."originalXml",
        dr."sourceIp"
      FROM dmarc_records dr
      JOIN dmarc_reports r ON dr."reportId" = r.id
      WHERE (dr."headerFrom" IS NULL OR dr."headerFrom" = '')
        AND r."originalXml" IS NOT NULL
        AND r."originalXml" != ''
    `);

    const affectedRecords = Array.isArray(affectedRecordsRaw)
      ? affectedRecordsRaw.filter((r) =>
          FixMissingHeaderFrom1739500000000.isAffectedRecordRow(r),
        )
      : [];

    if (affectedRecords.length === 0) {
      console.log('No records with missing headerFrom found.');
      return;
    }

    console.log(
      `Found ${affectedRecords.length} records with missing headerFrom. Attempting to fix...`,
    );

    // We'll use a simple XML parser approach since we can't import the full service
    const { XMLParser } = await import('fast-xml-parser');
    const parser = new XMLParser({
      ignoreAttributes: false,
      parseAttributeValue: true,
      trimValues: true,
    });

    let fixedCount = 0;
    let skippedCount = 0;

    // Group records by report to avoid re-parsing the same XML multiple times
    const recordsByReport = new Map<
      string,
      Array<{
        record_id: string;
        report_id: string;
        originalXml: string;
        sourceIp: string | null;
      }>
    >();
    for (const record of affectedRecords) {
      if (!recordsByReport.has(record.report_id)) {
        recordsByReport.set(record.report_id, []);
      }
      recordsByReport.get(record.report_id)!.push(record);
    }

    for (const [reportId, records] of recordsByReport.entries()) {
      try {
        const xmlContent = records[0].originalXml;
        if (!xmlContent || typeof xmlContent !== 'string') {
          continue;
        }

        const parsed = parser.parse(xmlContent);
        const feedback = parsed.feedback || {};
        const recordsNode = feedback.record || [];
        const recordsArray = Array.isArray(recordsNode)
          ? recordsNode
          : [recordsNode];

        // Build a map of sourceIp -> headerFrom from parsed XML
        const headerFromMap = new Map<string, string>();
        for (const recordData of recordsArray) {
          if (!recordData || typeof recordData !== 'object') {
            continue;
          }

          const row = recordData.row || {};
          const sourceIp = row.source_ip;

          // Check both 'identifiers' and 'identities' (the fix!)
          const identifiers =
            recordData.identifiers || recordData.identities || {};
          const headerFrom = identifiers.header_from;

          if (
            sourceIp &&
            headerFrom &&
            typeof sourceIp === 'string' &&
            typeof headerFrom === 'string'
          ) {
            headerFromMap.set(sourceIp, headerFrom);
          }
        }

        // Update each record with the correct headerFrom
        for (const record of records) {
          const headerFrom = record.sourceIp
            ? headerFromMap.get(record.sourceIp)
            : undefined;
          if (headerFrom && typeof headerFrom === 'string') {
            await queryRunner.query(
              `
              UPDATE dmarc_records
              SET "headerFrom" = $1,
                  reprocessed = false
              WHERE id = $2
            `,
              [headerFrom, String(record.record_id)],
            );
            fixedCount++;
            console.log(
              `Fixed record ${record.record_id}: headerFrom set to '${headerFrom}'`,
            );
          } else {
            skippedCount++;
            console.log(
              `Skipped record ${record.record_id}: Could not find headerFrom in XML`,
            );
          }
        }
      } catch (error) {
        console.error(
          `Error processing report ${reportId}:`,
          error instanceof Error ? error.message : String(error),
        );
        skippedCount += records.length;
      }
    }

    console.log(`
Migration complete:
  - Fixed: ${fixedCount} records
  - Skipped: ${skippedCount} records
  - Records marked for reprocessing to update forwarding detection
`);

    // Mark all fixed records as needing reprocessing to update forwarding detection
    if (fixedCount > 0) {
      console.log(
        'Note: Fixed records have been marked as reprocessed=false to trigger forwarding detection update.',
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // This migration cannot be easily reversed since we don't store the previous state
    // The headerFrom fields were NULL/empty before, so reverting would lose data
    console.log(
      'This migration cannot be reversed. The headerFrom fields were NULL/empty before the fix.',
    );
    await Promise.resolve();
  }
}
