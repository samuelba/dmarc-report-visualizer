import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

interface BackupConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  backupDir: string;
}

async function ensureBackupDirectory(backupDir: string): Promise<void> {
  try {
    await fs.promises.access(backupDir);
  } catch {
    await fs.promises.mkdir(backupDir, { recursive: true });
    console.log(`Created backup directory: ${backupDir}`);
  }
}

async function checkPendingMigrations(
  dataSource: DataSource,
): Promise<boolean> {
  try {
    await dataSource.initialize();
    const pendingMigrations = await dataSource.showMigrations();
    await dataSource.destroy();
    return pendingMigrations;
  } catch (error) {
    console.error('Error checking pending migrations:', error);
    // If we can't check, assume there might be migrations and proceed with backup
    return true;
  }
}

async function createBackup(config: BackupConfig): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `backup_${config.database}_${timestamp}.sql.gz`;
  const backupFilePath = path.join(config.backupDir, backupFileName);

  console.log(`Creating database backup: ${backupFileName}`);

  // Set PGPASSWORD environment variable for pg_dump
  const env = {
    ...process.env,
    PGPASSWORD: config.password,
  };

  // Prepare pg_dump arguments safely
  const pgDumpArgs = [
    '-h',
    config.host,
    '-p',
    String(config.port),
    '-U',
    config.username,
    '-d',
    config.database,
    '-F',
    'p',
  ];

  // Use execFile for pg_dump and pipe to gzip
  const { spawn } = require('child_process');
  return new Promise<string>((resolve, reject) => {
    const pgDump = spawn('pg_dump', pgDumpArgs, { env });
    const gzip = spawn('gzip');
    const outStream = fs.createWriteStream(backupFilePath);

    pgDump.stdout.pipe(gzip.stdin);
    gzip.stdout.pipe(outStream);

    let settled = false;
    const safeReject = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    const safeResolve = (value: string) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    pgDump.on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error('✗ Failed to start pg_dump:', message);
      safeReject(new Error(message));
    });
    gzip.on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error('✗ Failed to start gzip:', message);
      safeReject(new Error(message));
    });
    outStream.on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error('✗ Failed to write backup file:', message);
      safeReject(new Error(message));
    });

    outStream.on('finish', () => {
      if (!settled) {
        void (async () => {
          try {
            console.log(`✓ Backup created successfully: ${backupFilePath}`);
            // Get file size asynchronously
            const stats = await fs.promises.stat(backupFilePath);
            const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
            console.log(`  Backup size: ${fileSizeInMB} MB (compressed)`);
            safeResolve(backupFilePath);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('✗ Failed to read backup file stats:', message);
            safeReject(new Error(message));
          }
        })();
      }
    });
    // Handle pg_dump exit code
    pgDump.on('exit', (code: number) => {
      if (code !== 0) {
        safeReject(new Error(`pg_dump exited with code ${code}`));
      }
    });
    // Handle gzip exit code
    gzip.on('exit', (code: number) => {
      if (code !== 0) {
        safeReject(new Error(`gzip exited with code ${code}`));
      }
    });
  });
}

async function cleanOldBackups(
  backupDir: string,
  keepCount: number = 10,
): Promise<void> {
  try {
    const allFiles = await fs.promises.readdir(backupDir);
    const filteredFiles = await Promise.all(
      allFiles
        .filter(
          (file) =>
            file.startsWith('backup_') &&
            (file.endsWith('.sql') || file.endsWith('.sql.gz')),
        )
        .map(async (file) => {
          const filePath = path.join(backupDir, file);
          const stats = await fs.promises.stat(filePath);
          return {
            name: file,
            path: filePath,
            time: stats.mtime.getTime(),
          };
        }),
    );
    const files = filteredFiles.sort((a, b) => b.time - a.time);

    if (files.length > keepCount) {
      console.log(`Cleaning old backups (keeping ${keepCount} most recent)...`);
      const filesToDelete = files.slice(keepCount);

      for (const file of filesToDelete) {
        await fs.promises.unlink(file.path);
        console.log(`  Deleted old backup: ${file.name}`);
      }

      console.log(`✓ Cleaned ${filesToDelete.length} old backup(s)`);
    }
  } catch (error) {
    console.error('Warning: Failed to clean old backups:', error);
    // Don't throw - this is not critical
  }
}

async function main() {
  const config: BackupConfig = {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'dmarc',
    backupDir: process.env.BACKUP_DIR || path.join(process.cwd(), 'backups'),
  };

  console.log('=== Pre-Migration Database Backup ===');
  console.log(`Database: ${config.database}@${config.host}:${config.port}`);
  console.log(`Backup directory: ${config.backupDir}`);

  try {
    // Ensure backup directory exists
    await ensureBackupDirectory(config.backupDir);

    // Create a temporary DataSource to check for pending migrations
    const dataSource = new DataSource({
      type: 'postgres',
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      database: config.database,
      entities: [path.join(process.cwd(), 'dist/**/*.entity.js')],
      migrations: [path.join(process.cwd(), 'dist/src/migrations/*.js')],
    });

    // Check if there are pending migrations
    console.log('Checking for pending migrations...');
    const hasPendingMigrations = await checkPendingMigrations(dataSource);

    if (!hasPendingMigrations) {
      console.log('✓ No pending migrations found. Skipping backup.');
      return;
    }

    console.log('⚠ Pending migrations detected. Creating backup...');

    // Create the backup
    await createBackup(config);

    // Clean old backups
    const keepBackups = parseInt(process.env.BACKUP_KEEP_COUNT || '10', 10);
    await cleanOldBackups(config.backupDir, keepBackups);

    console.log('=== Backup completed successfully ===\n');
  } catch (error: unknown) {
    console.error('=== Backup failed ===');
    console.error(error instanceof Error ? error.message : String(error));

    // Check if backup is mandatory
    const backupMandatory = process.env.BACKUP_MANDATORY !== 'false';
    if (backupMandatory) {
      console.error('Backup is mandatory. Exiting to prevent data loss.');
      process.exit(1);
    } else {
      console.warn('⚠ Backup failed but BACKUP_MANDATORY=false, continuing...');
    }
  }
}

// Run the backup if this script is executed directly
if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Fatal error:', message);
    process.exit(1);
  });
}

export { main as runPreMigrationBackup };
