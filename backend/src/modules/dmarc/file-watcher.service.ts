import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DmarcReportService } from './dmarc-report.service';
import chokidar, { FSWatcher } from 'chokidar';
import * as path from 'path';
import * as fs from 'fs/promises';

@Injectable()
export class FileWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileWatcherService.name);
  private watcher: FSWatcher | null = null;
  private readonly processingPaths = new Set<string>();
  private readonly instanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  private isVerbose = false;

  constructor(
    private readonly config: ConfigService,
    private readonly dmarcReportService: DmarcReportService,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled =
      (this.config.get<string>('ENABLE_FILE_WATCHER') || '').toLowerCase() ===
      'true';
    if (!enabled) {
      this.logger.log('File watcher disabled (ENABLE_FILE_WATCHER!=true)');
      return;
    }

    const watchDir = this.resolveWatchDir();
    await fs.mkdir(watchDir, { recursive: true }).catch(() => undefined);

    // Verbose logs by default in non-production unless FILE_WATCH_VERBOSE=false
    const verboseEnv = (
      this.config.get<string>('FILE_WATCH_VERBOSE') || ''
    ).toLowerCase();
    this.isVerbose =
      verboseEnv === 'true' ||
      (!verboseEnv &&
        (process.env.NODE_ENV || '').toLowerCase() !== 'production');

    // Watch the entire directory and filter by extension in code.
    // This avoids case-sensitivity issues with globs on Linux (e.g., .XML, .GZ).
    const patterns = [watchDir];
    this.logger.log(
      `[${this.instanceId}] Starting file watcher on directory: ${watchDir}`,
    );
    this.logger.log(
      `[${this.instanceId}] Watching all files; filtering to .xml|.gz|.zip in handler`,
    );

    this.watcher = chokidar.watch(patterns, {
      persistent: true,
      ignoreInitial: false, // Process existing files
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      depth: 10,
      usePolling: true, // Required for Docker volume mounts
      interval: 1000, // Poll every second
      binaryInterval: 1000,
      followSymlinks: true,
      // Ignore common temporary files
      ignored: (p: string) => /(^|\/)\.[^\/]+$/.test(p),
    });

    if (this.isVerbose) {
      this.watcher.on('all', (event: string, eventPath: string) => {
        this.logger.log(
          `[${this.instanceId}] Event: ${event} path=${eventPath}`,
        );
      });
      // Low-level FS events
      // @ts-ignore - 'raw' event is supported by chokidar but may not be in types
      this.watcher.on(
        'raw',
        (eventName: string, pathRaw: string, details: unknown) => {
          try {
            this.logger.log(
              `[${this.instanceId}] Raw: ${eventName} path=${pathRaw} details=${JSON.stringify(details)}`,
            );
          } catch {
            this.logger.log(
              `[${this.instanceId}] Raw: ${eventName} path=${pathRaw}`,
            );
          }
        },
      );
    }

    this.watcher.on('add', (filePath: string) => {
      this.logger.log(`[${this.instanceId}] File added: ${filePath}`);
      void this.handleFileAdd(filePath);
    });
    if (this.isVerbose) {
      this.watcher.on('addDir', (dirPath: string) => {
        this.logger.log(`[${this.instanceId}] Directory added: ${dirPath}`);
      });
      this.watcher.on('change', (filePath: string) => {
        this.logger.log(`[${this.instanceId}] File changed: ${filePath}`);
      });
      this.watcher.on('unlink', (filePath: string) => {
        this.logger.log(`[${this.instanceId}] File removed: ${filePath}`);
      });
    }

    this.watcher.on('ready', () => {
      this.logger.log(
        `[${this.instanceId}] File watcher ready and watching for changes`,
      );
    });

    this.watcher.on('error', (err) => {
      this.logger.error(`[${this.instanceId}] Watcher error`, err as any);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.logger.log('File watcher stopped');
    }
  }

  private resolveWatchDir(): string {
    const fromEnv = this.config.get<string>('FILE_WATCH_DIR');
    if (fromEnv && fromEnv.trim().length > 0) {
      return path.isAbsolute(fromEnv)
        ? fromEnv
        : path.resolve(process.cwd(), fromEnv);
    }
    return path.resolve(process.cwd(), 'reports/incoming');
  }

  private getFileTypeFromPath(filePath: string): string {
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.xml')) return 'xml';
    if (lower.endsWith('.xml.gz') || lower.endsWith('.gz')) return 'gz';
    if (lower.endsWith('.zip')) return 'zip';
    return path.extname(lower).replace('.', '');
  }

  private async handleFileAdd(filePath: string): Promise<void> {
    if (this.processingPaths.has(filePath)) {
      if (this.isVerbose)
        this.logger.log(
          `[${this.instanceId}] Already processing ${filePath}, skipping duplicate event`,
        );
      return;
    }
    this.processingPaths.add(filePath);

    const deleteProcessed =
      (
        this.config.get<string>('FILE_WATCH_DELETE_PROCESSED') || ''
      ).toLowerCase() === 'true';

    try {
      this.logger.log(`[${this.instanceId}] Detected new file: ${filePath}`);
      const stat = await fs.stat(filePath).catch(() => null);
      if (stat) {
        this.logger.log(`[${this.instanceId}] File size: ${stat.size} bytes`);
      }
      const buffer = await fs.readFile(filePath);
      const fileType = this.getFileTypeFromPath(filePath);
      this.logger.log(`[${this.instanceId}] File type resolved: ${fileType}`);

      const xmlContent = await this.dmarcReportService.unzipReport(
        buffer,
        fileType,
      );
      this.logger.log(
        `[${this.instanceId}] Unzipped content length: ${xmlContent.length}`,
      );
      const parsed = await this.dmarcReportService.parseXmlReport(xmlContent);
      (parsed as any).originalXml = xmlContent;
      const recordsCount = Array.isArray((parsed as any).records)
        ? (parsed as any).records.length
        : Number((parsed as any).records?.length || 0);
      this.logger.log(
        `[${this.instanceId}] Parsed report summary: reportId=${(parsed as any).reportId ?? 'n/a'}, domain=${(parsed as any).domain ?? 'n/a'}, records=${recordsCount}, begin=${(parsed as any).beginDate ?? 'n/a'}, end=${(parsed as any).endDate ?? 'n/a'}`,
      );

      // Use service-level upsert that safely handles one-to-many relationships
      const saved =
        await this.dmarcReportService.createOrUpdateByReportId(parsed);
      const savedId = saved.id;
      if (parsed.reportId) {
        this.logger.log(
          `[${this.instanceId}] Upserted DMARC report (reportId=${parsed.reportId}) id=${savedId}`,
        );
      } else {
        this.logger.log(
          `[${this.instanceId}] Created DMARC report (no reportId) id=${savedId}`,
        );
      }

      if (deleteProcessed) {
        await fs
          .unlink(filePath)
          .catch((err) =>
            this.logger.warn(
              `[${this.instanceId}] Failed to delete ${filePath}: ${String(err)}`,
            ),
          );
      }
    } catch (err) {
      this.logger.error(
        `[${this.instanceId}] Failed to process file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    } finally {
      this.processingPaths.delete(filePath);
      if (this.isVerbose)
        this.logger.log(`[${this.instanceId}] Finished processing ${filePath}`);
    }
  }
}
