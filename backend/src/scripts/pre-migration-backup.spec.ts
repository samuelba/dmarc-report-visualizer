import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';

jest.mock('child_process', () => ({ spawn: jest.fn() }));

import { spawn } from 'child_process';
import { createBackup } from './pre-migration-backup';

interface FakeProcess extends EventEmitter {
  stdin: PassThrough;
  stdout: PassThrough;
}

function fakeProcess(): FakeProcess {
  return Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
  });
}

describe('createBackup', () => {
  let backupDir: string;
  let pgDump: FakeProcess;
  let gzip: FakeProcess;

  beforeEach(async () => {
    backupDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'backup-'));
    pgDump = fakeProcess();
    gzip = fakeProcess();
    (spawn as jest.Mock).mockImplementation((command: string) =>
      command === 'pg_dump' ? pgDump : gzip,
    );
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.promises.rm(backupDir, { recursive: true, force: true });
  });

  const config = () => ({
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: 'secret',
    database: 'dmarc',
    backupDir,
  });

  it('removes the partial file and rejects when pg_dump fails', async () => {
    const backup = createBackup(config());

    gzip.stdout.write('partial');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await fs.promises.readdir(backupDir)).toHaveLength(1);
    pgDump.emit('exit', 1);

    await expect(backup).rejects.toThrow('pg_dump exited with code 1');
    expect(await fs.promises.readdir(backupDir)).toEqual([]);
  });

  it('rejects when the file is written before pg_dump reports failure', async () => {
    const backup = createBackup(config());

    gzip.stdout.end('partial');
    gzip.emit('exit', 0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    pgDump.emit('exit', 1);

    await expect(backup).rejects.toThrow('pg_dump exited with code 1');
    expect(await fs.promises.readdir(backupDir)).toEqual([]);
  });

  it('keeps the file when pg_dump and gzip succeed', async () => {
    const backup = createBackup(config());

    gzip.stdout.end('dump');
    pgDump.emit('exit', 0);
    gzip.emit('exit', 0);

    const filePath = await backup;
    expect(path.basename(filePath)).toMatch(/^backup_dmarc_.*\.sql\.gz$/);
    expect(await fs.promises.readFile(filePath, 'utf8')).toBe('dump');
  });
});
