import { createHash } from 'crypto';

/**
 * Must stay byte-compatible with the migration backfill:
 * encode(sha256(convert_to("originalXml", 'UTF8')), 'hex')
 */
export function hashReportXml(xml: string | undefined | null): string | null {
  if (!xml) {
    return null;
  }
  return createHash('sha256').update(xml, 'utf8').digest('hex');
}
