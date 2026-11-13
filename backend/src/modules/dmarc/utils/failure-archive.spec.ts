import { Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { archiveFailedAttachment } from './failure-archive';

describe('archiveFailedAttachment', () => {
  const logger = {
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
  const limits = { maxFileBytes: 100, maxFailureArchiveFiles: 2 };
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'failure-archive-'));
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const archive = (fileName: string, buffer = Buffer.from('data')) =>
    archiveFailedAttachment({ dir, fileName, buffer, limits, logger });

  it('should write the attachment and create the directory', async () => {
    const nested = path.join(dir, 'failure');

    const written = await archiveFailedAttachment({
      dir: nested,
      fileName: 'a.xml',
      buffer: Buffer.from('data'),
      limits,
      logger,
    });

    expect(written).toBe(true);
    await expect(fs.readFile(path.join(nested, 'a.xml'), 'utf8')).resolves.toBe(
      'data',
    );
  });

  it('should skip attachments larger than maxFileBytes', async () => {
    const written = await archive('big.xml', Buffer.alloc(101));

    expect(written).toBe(false);
    expect(await fs.readdir(dir)).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should stop adding files once the directory is full', async () => {
    await archive('a.xml');
    await archive('b.xml');

    const written = await archive('c.xml');

    expect(written).toBe(false);
    expect((await fs.readdir(dir)).sort()).toEqual(['a.xml', 'b.xml']);
  });

  it('should still overwrite an existing file when the directory is full', async () => {
    await archive('a.xml');
    await archive('b.xml');

    const written = await archive('a.xml', Buffer.from('retry'));

    expect(written).toBe(true);
    await expect(fs.readFile(path.join(dir, 'a.xml'), 'utf8')).resolves.toBe(
      'retry',
    );
  });

  it('should log and return false when writing fails', async () => {
    const fileAsDir = path.join(dir, 'not-a-dir');
    await fs.writeFile(fileAsDir, 'x');

    const written = await archiveFailedAttachment({
      dir: fileAsDir,
      fileName: 'a.xml',
      buffer: Buffer.from('data'),
      limits,
      logger,
    });

    expect(written).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });
});
