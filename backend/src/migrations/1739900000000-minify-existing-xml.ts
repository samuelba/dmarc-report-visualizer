import { MigrationInterface, QueryRunner } from 'typeorm';

// Import xml-formatter at module level for better performance
// Using require() for CommonJS compatibility in migration context
const xmlFormatter = require('xml-formatter');

export class MinifyExistingXml1739900000000 implements MigrationInterface {
  name = 'MinifyExistingXml1739900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // This migration minifies existing originalXml in dmarc_reports to save storage space
    // The minification process removes unnecessary whitespace while preserving XML structure

    // Get total count first
    const countResult = (await queryRunner.query(`
      SELECT COUNT(*) as total 
      FROM dmarc_reports 
      WHERE "originalXml" IS NOT NULL AND "originalXml" != ''
    `)) as { total: string }[];
    const totalRecords = parseInt(String(countResult[0]?.total ?? '0'), 10);
    console.log(`Found ${totalRecords} reports with XML data to minify`);

    if (totalRecords === 0) {
      console.log('No records to process, skipping migration');
      return;
    }

    // Process in batches to avoid memory issues with large datasets
    const batchSize = 100;
    let processedCount = 0;
    let errorCount = 0;
    let spaceSavedBytes = 0;

    for (let offset = 0; offset < totalRecords; offset += batchSize) {
      const reports = (await queryRunner.query(
        `
        SELECT id, "originalXml"
        FROM dmarc_reports 
        WHERE "originalXml" IS NOT NULL AND "originalXml" != ''
        ORDER BY id
        LIMIT $1 OFFSET $2
      `,
        [batchSize, offset],
      )) as { id: string; originalXml: string }[];

      for (const report of reports) {
        try {
          const originalXml: string = report.originalXml;
          const originalSize = originalXml.length;

          // Minify the XML using xml-formatter's built-in minify function
          const minifiedXml = xmlFormatter.minify(originalXml, {
            collapseContent: true,
          });

          const minifiedSize = minifiedXml.length;
          const savedBytes = originalSize - minifiedSize;

          // Only update if we actually saved space
          if (savedBytes > 0) {
            await queryRunner.query(
              `UPDATE dmarc_reports SET "originalXml" = $1 WHERE id = $2`,
              [minifiedXml, report.id],
            );
            spaceSavedBytes += savedBytes;
            processedCount++;
          }
        } catch (error) {
          errorCount++;
          console.warn(
            `Failed to minify XML for report ${report.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Continue processing other records even if one fails
        }
      }

      // Log progress every batch
      const progress = Math.min(offset + batchSize, totalRecords);
      const percentage = ((progress / totalRecords) * 100).toFixed(1);
      console.log(
        `Progress: ${progress}/${totalRecords} (${percentage}%) - Processed: ${processedCount}, Errors: ${errorCount}, Space saved: ${(spaceSavedBytes / 1024 / 1024).toFixed(2)} MB`,
      );
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total reports processed: ${processedCount}`);
    console.log(`Errors encountered: ${errorCount}`);
    console.log(
      `Total space saved: ${(spaceSavedBytes / 1024 / 1024).toFixed(2)} MB`,
    );
    if (processedCount > 0) {
      console.log(
        `Average space saved per report: ${(spaceSavedBytes / processedCount / 1024).toFixed(2)} KB`,
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // There's no way to restore the original formatting after minification
    // The XML content is preserved, just the formatting is lost
    // This is intentional as the minified XML is functionally equivalent
    console.log(
      'This migration cannot be reversed. The XML content is preserved in minified form.',
    );
    await Promise.resolve();
  }
}
