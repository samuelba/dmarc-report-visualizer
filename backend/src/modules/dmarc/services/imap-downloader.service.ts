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

const IMAP_UID = { uid: true } as const;

/** File names DMARC aggregate reports are delivered as (RFC 7489 §7.2.1.1) */
const REPORT_FILENAME_PATTERN = /\.(xml|gz|zip)$/i;

/** MIME types DMARC aggregate reports are delivered as, for unnamed parts */
const REPORT_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'application/gzip',
  'application/x-gzip',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'application/xml',
  'text/xml',
]);

/**
 * imapflow's search compiler supports `unseen` at runtime (it compiles to
 * IMAP `UNSEEN`), but its type declarations omit it.
 */
type ImapSearchCriteria = SearchObject & { unseen?: boolean };

interface ImapConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  rejectUnauthorized: boolean;
}

interface AttachmentResult {
  success: boolean;
  filename: string;
  reportId?: string;
}

@Injectable()
export class ImapDownloaderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImapDownloaderService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private isRunning = false;
  /** Connection of the poll in progress; null between polls */
  private imapClient: ImapFlow | null = null;
  private readonly instanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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
      const conn = this.getConnectionConfig();
      this.logger.log(
        `IMAP downloader configured for ${conn.user} on ${conn.host}:${conn.port} (TLS: ${conn.tls})`,
      );
      if (!conn.rejectUnauthorized) {
        this.logger.warn(
          'TLS certificate verification is DISABLED (IMAP_TLS_REJECT_UNAUTHORIZED=false). ' +
            'Credentials are exposed to MITM attacks. Do NOT use in production.',
        );
      }
      this.warnOnRescanConfig();

      const intervalMs = this.getPollIntervalMs();
      this.logger.log(
        `[${this.instanceId}] Starting IMAP downloader with interval ${intervalMs}ms`,
      );

      // Run immediately at startup, then on schedule
      void this.pollOnce();
      this.intervalHandle = setInterval(() => void this.pollOnce(), intervalMs);
    } catch (err) {
      this.logger.error(
        `Failed to initialize IMAP downloader: ${this.formatError(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.log('IMAP downloader stopped');
    }
    await this.disconnect();
  }

  private getConnectionConfig(): ImapConnectionConfig {
    const host = this.config.get<string>('IMAP_HOST');
    const user = this.config.get<string>('IMAP_USER');
    const password = this.config.get<string>('IMAP_PASSWORD');

    if (!host || !user || !password) {
      throw new Error(
        'Missing required IMAP credentials: IMAP_HOST, IMAP_USER, IMAP_PASSWORD',
      );
    }

    return {
      host,
      user,
      password,
      port: parseInt(this.config.get<string>('IMAP_PORT') || '993', 10),
      tls:
        (this.config.get<string>('IMAP_TLS') || 'true').toLowerCase() ===
        'true',
      rejectUnauthorized:
        (
          this.config.get<string>('IMAP_TLS_REJECT_UNAUTHORIZED') || 'true'
        ).toLowerCase() === 'true',
    };
  }

  /**
   * ImapFlow instances cannot be reconnected once closed, so every poll
   * gets a fresh client which is logged out again at the end of the poll.
   */
  private createClient(): ImapFlow {
    const conn = this.getConnectionConfig();
    const client = new ImapFlow({
      host: conn.host,
      port: conn.port,
      secure: conn.tls,
      auth: {
        user: conn.user,
        pass: conn.password,
      },
      logger: false, // Use NestJS logger instead
      tls: {
        rejectUnauthorized: conn.rejectUnauthorized,
      },
    });

    // ImapFlow is an EventEmitter: an unhandled 'error' event would crash the process
    client.on('error', (err) => {
      this.logger.error(`IMAP connection error: ${this.formatError(err)}`);
    });

    return client;
  }

  private async disconnect(): Promise<void> {
    const client = this.imapClient;
    this.imapClient = null;
    if (!client) {
      return;
    }

    try {
      await client.logout();
    } catch (logoutErr) {
      this.logger.debug(
        `IMAP logout failed, closing connection: ${this.formatError(logoutErr)}`,
      );
      try {
        client.close();
      } catch (closeErr) {
        this.logger.warn(
          `Error closing IMAP connection: ${this.formatError(closeErr)}`,
        );
      }
    }
  }

  private async pollOnce(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug(`[${this.instanceId}] Poll already running, skipping`);
      return;
    }

    this.isRunning = true;
    const downloadDir = this.getDownloadDir();

    try {
      await fs.mkdir(downloadDir, { recursive: true });
      await fs.mkdir(this.getProcessedSuccessDir(), { recursive: true });
      await fs.mkdir(this.getProcessedFailureDir(), { recursive: true });

      this.imapClient = this.createClient();
      await this.imapClient.connect();
      await this.processMailbox(this.imapClient, downloadDir);
    } catch (err) {
      this.logger.error(
        `[${this.instanceId}] Poll failed: ${this.formatError(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    } finally {
      await this.disconnect();
      this.isRunning = false;
    }
  }

  private async processMailbox(
    client: ImapFlow,
    downloadDir: string,
  ): Promise<void> {
    const mailbox = this.getMailbox();
    const lock = await client.getMailboxLock(mailbox);

    try {
      // UIDs are only unique per mailbox and UIDVALIDITY (RFC 3501 §2.3.1.1)
      const uidValidity = client.mailbox
        ? String(client.mailbox.uidValidity)
        : '0';
      const searchResult = await client.search(
        this.getSearchCriteria(),
        IMAP_UID,
      );
      const messageUids = searchResult === false ? [] : searchResult;

      this.logger.log(
        `[${this.instanceId}] Found ${messageUids.length} messages in ${mailbox}`,
      );

      const accountIdentifier = this.getAccountIdentifier();
      for (const uid of messageUids) {
        const trackingKey = this.buildTrackingKey(mailbox, uidValidity, uid);
        await this.processUid(uid, trackingKey, downloadDir, accountIdentifier);
      }
    } finally {
      lock.release();
    }
  }

  private async processUid(
    uid: number,
    trackingKey: string,
    downloadDir: string,
    accountIdentifier: string,
  ): Promise<void> {
    const tracking = await this.trackingService.getTracking(
      trackingKey,
      EmailSource.IMAP,
      accountIdentifier,
    );

    if (
      tracking?.status === ProcessingStatus.SUCCESS ||
      tracking?.status === ProcessingStatus.SKIPPED
    ) {
      this.logger.debug(`Message UID ${uid} already handled, skipping`);
      return;
    }

    if (
      tracking?.status === ProcessingStatus.FAILED &&
      tracking.attemptCount >= this.getFailureThreshold()
    ) {
      this.logger.debug(
        `Message UID ${uid} permanently failed previously, skipping`,
      );
      // Mark as seen so it doesn't repeatedly show up in UNSEEN searches
      await this.markSeen(uid);
      return;
    }

    await this.handleMessage(uid, trackingKey, downloadDir, accountIdentifier);
  }

  private async handleMessage(
    uid: number,
    trackingKey: string,
    downloadDir: string,
    accountIdentifier: string,
  ): Promise<void> {
    try {
      await this.trackingService.markProcessing(
        trackingKey,
        EmailSource.IMAP,
        accountIdentifier,
      );

      if (!this.imapClient) {
        throw new Error('IMAP client not initialized');
      }

      // `source` is fetched with BODY.PEEK[], so the \Seen flag is not changed
      const fetchResult = await this.imapClient.fetchOne(
        String(uid),
        { source: true, envelope: true },
        IMAP_UID,
      );

      if (!fetchResult) {
        throw new Error(`Failed to fetch message UID ${uid}`);
      }
      if (!fetchResult.source) {
        throw new Error(`Message UID ${uid} has no source data`);
      }

      const parsed: ParsedMail = await simpleParser(fetchResult.source);
      const reportAttachments = (parsed.attachments ?? []).filter((a) =>
        this.isReportAttachment(a),
      );

      if (reportAttachments.length === 0) {
        // Not a DMARC report: leave the message exactly as it is
        this.logger.debug(
          `Message UID ${uid} has no DMARC report attachment, leaving it untouched`,
        );
        await this.trackingService.markSkipped(
          trackingKey,
          EmailSource.IMAP,
          accountIdentifier,
        );
        return;
      }

      await this.processReportAttachments(
        uid,
        trackingKey,
        reportAttachments,
        downloadDir,
        accountIdentifier,
      );
    } catch (err) {
      const errMsg = this.formatError(err);
      this.logger.error(`Failed to handle message UID ${uid}: ${errMsg}`);
      await this.handleFailure(uid, trackingKey, accountIdentifier, errMsg);
    }
  }

  private async processReportAttachments(
    uid: number,
    trackingKey: string,
    attachments: Attachment[],
    downloadDir: string,
    accountIdentifier: string,
  ): Promise<void> {
    let attachmentsProcessed = 0;
    const errors: string[] = [];
    let firstReportId: string | undefined;

    for (const attachment of attachments) {
      try {
        const result = await this.processAttachment(attachment, downloadDir);
        attachmentsProcessed++;
        this.logger.log(
          `[${this.instanceId}] Processed attachment ${result.filename} from UID ${uid}`,
        );
        // Keep the first reportId to associate with the tracking record
        firstReportId = firstReportId ?? result.reportId;
      } catch (err) {
        const errMsg = this.formatError(err);
        errors.push(errMsg);
        this.logger.warn(
          `Failed to process attachment ${attachment.filename || 'unknown'}: ${errMsg}`,
        );
      }
    }

    if (attachmentsProcessed > 0) {
      await this.markMessageProcessed(uid);
      await this.trackingService.markSuccess(
        trackingKey,
        EmailSource.IMAP,
        accountIdentifier,
        firstReportId,
      );
      return;
    }

    await this.handleFailure(
      uid,
      trackingKey,
      accountIdentifier,
      errors.join('; '),
    );
  }

  private async processAttachment(
    attachment: Attachment,
    downloadDir: string,
  ): Promise<AttachmentResult> {
    const filename = this.getAttachmentFilename(attachment);
    const buffer = attachment.content;

    if (!this.getProcessInline()) {
      // Legacy mode: save to watch directory for file watcher to process
      const savePath = path.join(downloadDir, `${Date.now()}-${filename}`);
      await fs.writeFile(savePath, buffer);
      this.logger.log(`Saved attachment to ${savePath} for file watcher`);
      return { success: true, filename };
    }

    // Inline processing: parse immediately and save to database
    try {
      const xmlContent = await this.dmarcReportService.unzipReport(
        buffer,
        this.detectFileTypeByName(filename),
      );
      const parsedReport =
        await this.dmarcReportService.parseXmlReport(xmlContent);
      (parsedReport as any).originalXml = minifyXml(xmlContent);
      const savedReport =
        await this.dmarcReportService.createOrUpdateByReportId(parsedReport);

      if (this.shouldSaveOriginal()) {
        const savePath = path.join(
          this.getProcessedSuccessDir(),
          `${Date.now()}-${filename}`,
        );
        await fs.writeFile(savePath, buffer);
      }

      if (!savedReport) {
        this.logger.log(
          `Skipped empty report ${filename} (no meaningful records)`,
        );
        return { success: true, filename };
      }

      return { success: true, filename, reportId: savedReport.id };
    } catch (err) {
      await this.saveFailedAttachment(filename, buffer);
      throw err;
    }
  }

  private async saveFailedAttachment(
    filename: string,
    buffer: Buffer,
  ): Promise<void> {
    const failPath = path.join(
      this.getProcessedFailureDir(),
      `${Date.now()}-${filename}`,
    );
    try {
      await fs.writeFile(failPath, buffer);
    } catch (writeErr) {
      this.logger.error(
        `Failed to write unparseable attachment to ${failPath}: ${this.formatError(writeErr)}`,
      );
    }
  }

  /**
   * True when an attachment looks like a DMARC aggregate report, by file name
   * or (for unnamed parts) by MIME type. Everything else is ignored.
   */
  private isReportAttachment(attachment: Attachment): boolean {
    const name = (attachment.filename || '').trim();
    if (name.length > 0 && REPORT_FILENAME_PATTERN.test(name)) {
      return true;
    }
    return REPORT_CONTENT_TYPES.has(this.getMimeType(attachment));
  }

  private getAttachmentFilename(attachment: Attachment): string {
    if (attachment.filename && attachment.filename.trim().length > 0) {
      return this.getSafeFilename(attachment.filename);
    }
    // Unnamed part: derive an extension from the MIME type so it is decoded correctly
    const mimeType = this.getMimeType(attachment);
    if (mimeType.includes('gzip')) {
      return 'report.xml.gz';
    }
    if (mimeType.includes('zip')) {
      return 'report.zip';
    }
    return 'report.xml';
  }

  private getMimeType(attachment: Attachment): string {
    return (attachment.contentType || '').split(';')[0].trim().toLowerCase();
  }

  private async markMessageProcessed(uid: number): Promise<void> {
    if (!this.imapClient) {
      this.logger.warn('IMAP client not available for marking message');
      return;
    }

    const processedFolder = (
      this.config.get<string>('IMAP_PROCESSED_FOLDER') || ''
    ).trim();
    if (processedFolder.length > 0) {
      const moved = await this.moveMessageToFolder(uid, processedFolder);
      if (moved) {
        this.logger.debug(`Moved message UID ${uid} to ${processedFolder}`);
        return;
      }
    }

    await this.markSeen(uid);
  }

  private async handleFailure(
    uid: number,
    trackingKey: string,
    accountIdentifier: string,
    errorMessage: string,
  ): Promise<void> {
    const tracking = await this.trackingService.markFailed(
      trackingKey,
      EmailSource.IMAP,
      accountIdentifier,
      this.sanitizeImapError(errorMessage),
    );

    const count = tracking.attemptCount;
    const threshold = this.getFailureThreshold();

    if (count < threshold) {
      this.logger.debug(
        `Message UID ${uid} failed attempt ${count}/${threshold}`,
      );
      return;
    }

    this.logger.warn(
      `Message UID ${uid} failed ${count} times (threshold: ${threshold}), marking as permanently failed`,
    );

    const failedFolder = (
      this.config.get<string>('IMAP_FAILED_FOLDER') || ''
    ).trim();
    if (failedFolder.length > 0 && this.imapClient) {
      const moved = await this.moveMessageToFolder(uid, failedFolder);
      if (moved) {
        this.logger.debug(`Moved failed message UID ${uid} to ${failedFolder}`);
        return;
      }
    }

    await this.markSeen(uid);
  }

  private async markSeen(uid: number): Promise<void> {
    if (!this.imapClient) {
      return;
    }
    try {
      // Resolves to false (does not reject) when the server refuses the STORE
      const stored = await this.imapClient.messageFlagsAdd(
        String(uid),
        ['\\Seen'],
        IMAP_UID,
      );
      if (stored) {
        this.logger.debug(`Marked message UID ${uid} as seen`);
      } else {
        this.logger.warn(`Could not mark message UID ${uid} as seen`);
      }
    } catch (err) {
      this.logger.warn(
        `Could not mark message UID ${uid} as seen: ${this.formatError(err)}`,
      );
    }
  }

  /**
   * Moves a message, creating the target folder on first use.
   * Note: imapflow's messageMove() resolves to `false` (it does not reject)
   * when the server refuses the move, e.g. because the folder does not exist.
   */
  private async moveMessageToFolder(
    uid: number,
    folder: string,
  ): Promise<boolean> {
    if (!this.imapClient) {
      return false;
    }

    if (await this.tryMove(uid, folder)) {
      return true;
    }

    try {
      await this.imapClient.mailboxCreate(folder);
      this.logger.log(`Created mailbox: ${folder}`);
    } catch (createErr) {
      this.logger.warn(
        `Could not create mailbox ${folder}: ${this.formatError(createErr)}. Falling back to mark as seen.`,
      );
      return false;
    }

    if (await this.tryMove(uid, folder)) {
      return true;
    }
    this.logger.warn(
      `Server refused to move message UID ${uid} to ${folder}. Falling back to mark as seen.`,
    );
    return false;
  }

  private async tryMove(uid: number, folder: string): Promise<boolean> {
    try {
      const result = await this.imapClient?.messageMove(
        String(uid),
        folder,
        IMAP_UID,
      );
      return Boolean(result);
    } catch (err) {
      this.logger.debug(
        `Move of UID ${uid} to ${folder} failed: ${this.formatError(err)}`,
      );
      return false;
    }
  }

  private buildTrackingKey(
    mailbox: string,
    uidValidity: string,
    uid: number,
  ): string {
    return `${mailbox}:${uidValidity}:${uid}`;
  }

  private formatError(err: unknown): string {
    return this.sanitizeImapError(
      err instanceof Error ? err.message : String(err),
    );
  }

  private sanitizeImapError(message: string): string {
    const password = this.config.get<string>('IMAP_PASSWORD') || '';
    let sanitized = message;
    if (password.length > 0) {
      sanitized = sanitized.split(password).join('[REDACTED]');
    }
    sanitized = sanitized.replace(
      /\bpass(?:word)?\s*[=:]\s*\S+/gi,
      'password=[REDACTED]',
    );
    return sanitized.slice(0, 500);
  }

  /**
   * Parses IMAP_SEARCH_CRITERIA. Supported tokens (case-insensitive, combinable):
   * `UNSEEN`, `SUBJECT "text"` / `SUBJECT word`, or `ALL` on its own.
   */
  private getSearchCriteria(): ImapSearchCriteria {
    const raw = (
      this.config.get<string>('IMAP_SEARCH_CRITERIA') || 'UNSEEN'
    ).trim();
    const criteria: ImapSearchCriteria = {};

    const subjectMatch = raw.match(/\bSUBJECT\s+(?:"([^"]+)"|(\S+))/i);
    if (subjectMatch) {
      criteria.subject = (subjectMatch[1] ?? subjectMatch[2]).trim();
    }
    const rest = subjectMatch ? raw.replace(subjectMatch[0], ' ') : raw;

    if (/\bUNSEEN\b/i.test(rest)) {
      criteria.unseen = true;
    }

    if (Object.keys(criteria).length > 0) {
      return criteria;
    }
    if (/^ALL$/i.test(rest.trim())) {
      return { all: true };
    }

    this.logger.warn(
      `Unrecognized IMAP_SEARCH_CRITERIA "${raw}", falling back to UNSEEN`,
    );
    return { unseen: true };
  }

  private warnOnRescanConfig(): void {
    const processedFolder = (
      this.config.get<string>('IMAP_PROCESSED_FOLDER') || ''
    ).trim();
    if (!this.getSearchCriteria().unseen && processedFolder.length === 0) {
      this.logger.warn(
        'IMAP_SEARCH_CRITERIA does not include UNSEEN and IMAP_PROCESSED_FOLDER is not set: ' +
          'every poll re-scans all matching messages. Set IMAP_PROCESSED_FOLDER to move handled reports away.',
      );
    }
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
