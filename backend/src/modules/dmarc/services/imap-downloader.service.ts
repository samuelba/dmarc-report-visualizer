import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow, SearchObject } from 'imapflow';
import { simpleParser, ParsedMail, Attachment } from 'mailparser';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DmarcReportService } from '../dmarc-report.service';
import { EmailMessageTrackingService } from './email-message-tracking.service';
import {
  EmailSource,
  ProcessingStatus,
} from '../entities/email-message-tracking.entity';
import { minifyXml } from '../utils/xml-minifier.util';

@Injectable()
export class ImapDownloaderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImapDownloaderService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private isRunning = false;
  private imapClient: ImapFlow | null = null;
  private readonly instanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  private failureCounts: Map<string, number> = new Map();

  constructor(
    private readonly config: ConfigService,
    private readonly dmarcReportService: DmarcReportService,
    private readonly trackingService: EmailMessageTrackingService,
  ) {}

  onModuleInit(): void {
    const enabled =
      (
        this.config.get<string>('ENABLE_IMAP_DOWNLOADER') || ''
      ).toLowerCase() === 'true';
    if (!enabled) {
      this.logger.log(
        'IMAP downloader disabled (ENABLE_IMAP_DOWNLOADER!=true)',
      );
      return;
    }

    try {
      this.initializeImapClient();
      const intervalMs = this.getPollIntervalMs();
      this.logger.log(
        `[${this.instanceId}] Starting IMAP downloader with interval ${intervalMs}ms`,
      );

      // Run immediately at startup, then on schedule
      void this.pollOnce();
      this.intervalHandle = setInterval(() => void this.pollOnce(), intervalMs);
    } catch (err) {
      this.logger.error(
        `Failed to initialize IMAP downloader: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.log('IMAP downloader stopped');
    }
    this.closeImapClient();
  }

  private closeImapClient(): void {
    if (this.imapClient) {
      try {
        this.imapClient.close();
      } catch (err) {
        this.logger.warn(
          `Error closing IMAP connection: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      this.imapClient = null;
    }
  }

  private initializeImapClient(): void {
    const host = this.config.get<string>('IMAP_HOST');
    const port = parseInt(this.config.get<string>('IMAP_PORT') || '993');
    const user = this.config.get<string>('IMAP_USER');
    const password = this.config.get<string>('IMAP_PASSWORD');
    const tls =
      (this.config.get<string>('IMAP_TLS') || 'true').toLowerCase() === 'true';
    const rejectUnauthorized =
      (
        this.config.get<string>('IMAP_TLS_REJECT_UNAUTHORIZED') || 'true'
      ).toLowerCase() === 'true';

    if (!host || !user || !password) {
      throw new Error(
        'Missing required IMAP credentials: IMAP_HOST, IMAP_USER, IMAP_PASSWORD',
      );
    }

    this.imapClient = new ImapFlow({
      host,
      port,
      secure: tls,
      auth: {
        user,
        pass: password,
      },
      logger: false, // Use NestJS logger instead
      tls: {
        rejectUnauthorized,
      },
    });

    this.imapClient.on('error', (err) => {
      this.logger.error(
        `IMAP connection error: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    this.imapClient.on('close', () => {
      this.logger.debug('IMAP connection closed');
    });

    this.logger.log(
      `IMAP client configured for ${user}@${host}:${port} (TLS: ${tls})`,
    );
  }

  private async pollOnce(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug(`[${this.instanceId}] Poll already running, skipping`);
      return;
    }

    if (!this.imapClient) {
      this.logger.warn('IMAP client not initialized, skipping poll');
      return;
    }

    this.isRunning = true;
    const downloadDir = this.getDownloadDir();

    try {
      await fs.mkdir(downloadDir, { recursive: true });
      await fs.mkdir(this.getProcessedSuccessDir(), { recursive: true });
      await fs.mkdir(this.getProcessedFailureDir(), { recursive: true });

      // Connect if not connected, recreate client if needed
      if (!this.imapClient.usable) {
        try {
          await this.imapClient.connect();
          this.logger.log('IMAP connection established');
        } catch (connectErr) {
          this.logger.warn(
            `Failed to reconnect existing IMAP client, recreating: ${connectErr instanceof Error ? connectErr.message : String(connectErr)}`,
          );
          this.closeImapClient();
          this.initializeImapClient();
          await this.imapClient?.connect();
          this.logger.log('IMAP connection re-established with new client');
        }
      }

      const mailbox = this.getMailbox();
      const lock = await this.imapClient.getMailboxLock(mailbox);

      try {
        // Search for messages matching criteria
        const searchCriteria: SearchObject =
          this.getSearchCriteria() as SearchObject;
        const searchResult = await this.imapClient.search(searchCriteria);
        const messageUids = searchResult === false ? [] : searchResult;

        this.logger.log(
          `[${this.instanceId}] Found ${messageUids.length} messages in ${mailbox}`,
        );

        for (const uid of messageUids) {
          const uidString = String(uid);
          const accountIdentifier = this.getAccountIdentifier();

          // Check if already processed successfully
          const alreadyProcessed = await this.trackingService.isProcessed(
            uidString,
            EmailSource.IMAP,
            accountIdentifier,
          );

          if (alreadyProcessed) {
            this.logger.debug(`Message UID ${uid} already processed, skipping`);
            continue;
          }

          await this.handleMessage(uid, downloadDir, accountIdentifier);
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      this.logger.error(
        `[${this.instanceId}] Poll failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    } finally {
      this.isRunning = false;
    }
  }

  private async handleMessage(
    uid: number,
    downloadDir: string,
    accountIdentifier: string,
  ): Promise<void> {
    const uidString = String(uid);

    try {
      // Mark as processing
      await this.trackingService.markProcessing(
        uidString,
        EmailSource.IMAP,
        accountIdentifier,
      );

      // Fetch full message
      if (!this.imapClient) {
        throw new Error('IMAP client not initialized');
      }

      const fetchResult = await this.imapClient.fetchOne(String(uid), {
        source: true,
        envelope: true,
        bodyStructure: true,
      });

      if (!fetchResult) {
        throw new Error(`Failed to fetch message UID ${uid}`);
      }

      if (!fetchResult.source) {
        throw new Error(`Message UID ${uid} has no source data`);
      }

      // Parse email with mailparser
      const parsed: ParsedMail = await simpleParser(fetchResult.source);

      if (!parsed.attachments || parsed.attachments.length === 0) {
        this.logger.debug(`Message UID ${uid} has no attachments, skipping`);
        await this.markMessageProcessed(uid);
        return;
      }

      let attachmentsProcessed = 0;
      const errors: string[] = [];

      for (const attachment of parsed.attachments) {
        try {
          const result = await this.processAttachment(
            attachment,
            downloadDir,
            uidString,
            accountIdentifier,
          );
          if (result.success) {
            attachmentsProcessed++;
            this.logger.log(
              `[${this.instanceId}] Processed attachment ${result.filename} from UID ${uid}`,
            );

            // Mark tracking as successful and link to report
            if (result.reportId) {
              await this.trackingService.markSuccess(
                uidString,
                EmailSource.IMAP,
                accountIdentifier,
                result.reportId,
              );
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push(errMsg);
          this.logger.warn(
            `Failed to process attachment ${attachment.filename || 'unknown'}: ${errMsg}`,
          );
        }
      }

      if (attachmentsProcessed > 0) {
        // Successfully processed at least one attachment
        await this.markMessageProcessed(uid);
        // Clear failure count on success
        this.failureCounts.delete(uidString);

        // Ensure tracking is marked as success (handles legacy mode where reportId is absent)
        const currentTracking = await this.trackingService.getTracking(
          uidString,
          EmailSource.IMAP,
          accountIdentifier,
        );
        if (
          currentTracking &&
          currentTracking.status !== ProcessingStatus.SUCCESS
        ) {
          await this.trackingService.markSuccess(
            uidString,
            EmailSource.IMAP,
            accountIdentifier,
          );
        }
      } else if (errors.length > 0) {
        // All attachments failed
        await this.handleFailure(
          uidString,
          accountIdentifier,
          errors.join('; '),
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to handle message UID ${uid}: ${errMsg}`);
      await this.handleFailure(uidString, accountIdentifier, errMsg);
    }
  }

  private async processAttachment(
    attachment: Attachment,
    downloadDir: string,
    _messageId: string,
    _accountIdentifier: string,
  ): Promise<{ success: boolean; filename: string; reportId?: string }> {
    const filename = this.getSafeFilename(attachment.filename || 'report.xml');
    const buffer = attachment.content;

    const processInline = this.getProcessInline();

    if (processInline) {
      // Inline processing: parse immediately and save to database
      const fileType = this.detectFileTypeByName(filename);
      try {
        const xmlContent = await this.dmarcReportService.unzipReport(
          buffer,
          fileType,
        );
        const parsedReport =
          await this.dmarcReportService.parseXmlReport(xmlContent);
        (parsedReport as any).originalXml = minifyXml(xmlContent);
        const savedReport =
          await this.dmarcReportService.createOrUpdateByReportId(parsedReport);

        // Optionally save original file
        if (this.shouldSaveOriginal()) {
          const savePath = path.join(
            this.getProcessedSuccessDir(),
            `${Date.now()}-${filename}`,
          );
          await fs.writeFile(savePath, buffer);
        }

        return { success: true, filename, reportId: savedReport.id };
      } catch (err) {
        // Save failed attachment for inspection
        const failPath = path.join(
          this.getProcessedFailureDir(),
          `${Date.now()}-${filename}`,
        );
        await fs.writeFile(failPath, buffer);

        throw err;
      }
    } else {
      // Legacy mode: save to watch directory for file watcher to process
      const savePath = path.join(downloadDir, `${Date.now()}-${filename}`);
      await fs.writeFile(savePath, buffer);
      this.logger.log(`Saved attachment to ${savePath} for file watcher`);
      return { success: true, filename };
    }
  }

  private async markMessageProcessed(uid: number): Promise<void> {
    const processedFolder = this.config.get<string>('IMAP_PROCESSED_FOLDER');

    if (!this.imapClient) {
      this.logger.warn('IMAP client not available for marking message');
      return;
    }

    if (processedFolder && processedFolder.trim().length > 0) {
      // Move to processed folder
      try {
        await this.imapClient.messageMove(String(uid), processedFolder);
        this.logger.debug(`Moved message UID ${uid} to ${processedFolder}`);
      } catch (_err) {
        // Folder might not exist, try creating it
        try {
          await this.imapClient.mailboxCreate(processedFolder);
          this.logger.log(`Created mailbox: ${processedFolder}`);
          await this.imapClient.messageMove(String(uid), processedFolder);
          this.logger.debug(`Moved message UID ${uid} to ${processedFolder}`);
        } catch (_createErr) {
          this.logger.warn(
            `Could not move message to ${processedFolder}: ${_createErr instanceof Error ? _createErr.message : String(_createErr)}. Falling back to mark as seen.`,
          );
          // Fall back to marking as read
          await this.imapClient.messageFlagsAdd(String(uid), ['\\Seen']);
        }
      }
    } else {
      // Just mark as read
      await this.imapClient.messageFlagsAdd(String(uid), ['\\Seen']);
      this.logger.debug(`Marked message UID ${uid} as seen`);
    }
  }

  private async handleFailure(
    messageId: string,
    accountIdentifier: string,
    errorMessage: string,
  ): Promise<void> {
    const count = (this.failureCounts.get(messageId) || 0) + 1;
    this.failureCounts.set(messageId, count);

    const threshold = this.getFailureThreshold();

    if (count >= threshold) {
      this.logger.warn(
        `Message ${messageId} failed ${count} times (threshold: ${threshold}), marking as permanently failed`,
      );
      await this.trackingService.markFailed(
        messageId,
        EmailSource.IMAP,
        accountIdentifier,
        errorMessage,
      );
      this.failureCounts.delete(messageId);

      // Optionally move to failed folder
      const failedFolder = this.config.get<string>('IMAP_FAILED_FOLDER');
      if (failedFolder && failedFolder.trim().length > 0 && this.imapClient) {
        try {
          await this.imapClient.messageMove(messageId, failedFolder);
        } catch (err) {
          this.logger.warn(
            `Could not move failed message to ${failedFolder}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } else {
      this.logger.debug(
        `Message ${messageId} failed attempt ${count}/${threshold}`,
      );
    }
  }

  private getSearchCriteria(): any {
    const criteria =
      this.config.get<string>('IMAP_SEARCH_CRITERIA') || 'UNSEEN';

    // Support common patterns
    if (criteria === 'UNSEEN') {
      return { unseen: true };
    } else if (criteria === 'ALL') {
      return { all: true };
    } else if (criteria.toUpperCase().includes('SUBJECT')) {
      // Parse "SUBJECT DMARC" or similar
      const match = criteria.match(/SUBJECT\s+"?([^"]+)"?/i);
      if (match) {
        return { subject: match[1].trim() };
      }
    }

    // Default fallback
    return { unseen: true };
  }

  private getSafeFilename(name: string): string {
    const base = path
      .basename(name)
      .replace(/[\r\n]/g, '')
      .trim();
    return base.length > 0 ? base : 'attachment.bin';
  }

  private detectFileTypeByName(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.xml')) {
      return 'xml';
    }
    if (lower.endsWith('.xml.gz') || lower.endsWith('.gz')) {
      return 'gz';
    }
    if (lower.endsWith('.zip')) {
      return 'zip';
    }
    return path.extname(lower).replace('.', '') || 'xml';
  }

  private getProcessInline(): boolean {
    const raw = this.config.get<string>('IMAP_PROCESS_INLINE');
    return raw ? raw.toLowerCase() === 'true' : true; // default true
  }

  private shouldSaveOriginal(): boolean {
    const raw = this.config.get<string>('IMAP_SAVE_ORIGINAL');
    return raw ? raw.toLowerCase() === 'true' : false;
  }

  private getPollIntervalMs(): number {
    const raw = this.config.get<string>('IMAP_POLL_INTERVAL_MS');
    const num = raw ? Number(raw) : Number.NaN;
    if (!Number.isNaN(num) && num > 0) {
      return num;
    }
    return 5 * 60 * 1000; // default 5 minutes
  }

  private getFailureThreshold(): number {
    const raw = this.config.get<string>('IMAP_FAILURE_THRESHOLD') || '';
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 3;
  }

  private getMailbox(): string {
    return this.config.get<string>('IMAP_MAILBOX') || 'INBOX';
  }

  private getAccountIdentifier(): string {
    return this.config.get<string>('IMAP_USER') || 'unknown';
  }

  private getDownloadDir(): string {
    const fromEnv = this.config.get<string>('FILE_WATCH_DIR');
    if (fromEnv && fromEnv.trim().length > 0) {
      return path.isAbsolute(fromEnv)
        ? fromEnv
        : path.resolve(process.cwd(), fromEnv);
    }
    return path.resolve(process.cwd(), 'reports/incoming');
  }

  private getProcessedSuccessDir(): string {
    return path.resolve(process.cwd(), 'reports/processed/success');
  }

  private getProcessedFailureDir(): string {
    return path.resolve(process.cwd(), 'reports/processed/failure');
  }
}
