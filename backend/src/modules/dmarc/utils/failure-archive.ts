import { Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ReportLimits } from '../config/report-limits.config';

export interface FailureArchiveRequest {
  dir: string;
  fileName: string;
  buffer: Buffer;
  limits: Pick<ReportLimits, 'maxFileBytes' | 'maxFailureArchiveFiles'>;
  logger: Logger;
}

/**
 * Keeps a copy of an attachment that could not be processed, for inspection.
 * Oversized attachments are never written, and once the directory holds
 * `maxFailureArchiveFiles` entries only existing names are overwritten, so a
 * flood of junk mail cannot fill the disk.
 * @returns true when the file was written
 */
export async function archiveFailedAttachment(
  request: FailureArchiveRequest,
): Promise<boolean> {
  const { dir, fileName, buffer, limits, logger } = request;
  const target = path.join(dir, fileName);

  if (buffer.length > limits.maxFileBytes) {
    logger.warn(
      `Not archiving ${fileName}: ${buffer.length} bytes exceeds ${limits.maxFileBytes}`,
    );
    return false;
  }

  try {
    await fs.mkdir(dir, { recursive: true });
    const existing = await fs.readdir(dir);
    if (
      !existing.includes(fileName) &&
      existing.length >= limits.maxFailureArchiveFiles
    ) {
      logger.warn(
        `Not archiving ${fileName}: ${dir} already holds ${existing.length} files (limit ${limits.maxFailureArchiveFiles})`,
      );
      return false;
    }
    await fs.writeFile(target, buffer);
    return true;
  } catch (err) {
    logger.error(
      `Failed to archive unparseable attachment to ${target}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
