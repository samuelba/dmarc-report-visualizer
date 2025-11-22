import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DmarcReportService } from './dmarc-report.service';
import { minifyXml } from './utils/xml-minifier.util';

type GmailAuthConfig = {
  clientEmail: string;
  privateKey: string;
  delegatedUser: string;
};

type GmailOauthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  refreshToken: string;
};

@Injectable()
export class GmailDownloaderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GmailDownloaderService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private isRunning = false;
  private gmailClient: gmail_v1.Gmail | null = null;
  private processedLabelId: string | null = null;
  private sourceLabelId: string | null = null;
  private readonly instanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  constructor(
    private readonly config: ConfigService,
    private readonly dmarcReportService: DmarcReportService,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled =
      (
        this.config.get<string>('ENABLE_GMAIL_DOWNLOADER') || ''
      ).toLowerCase() === 'true';
    if (!enabled) {
      this.logger.log(
        'Gmail downloader disabled (ENABLE_GMAIL_DOWNLOADER!=true)',
      );
      return;
    }

    const mode = this.getAuthMode();
    if (mode === 'oauth') {
      const oauth = await this.loadOauthConfig();
      if (!oauth) {
        this.logger.error(
          'Gmail downloader not started due to missing/invalid OAuth configuration.',
        );
        return;
      }
      await this.initializeGmailClientOauth(oauth);
    } else {
      const svc = await this.loadServiceAccountConfig();
      if (!svc) {
        this.logger.error(
          'Gmail downloader not started due to missing/invalid service account configuration.',
        );
        return;
      }
      await this.initializeGmailClientServiceAccount(svc);
    }

    const processedLabelName = this.getProcessedLabelName();
    const sourceLabelName = this.getSourceLabelName();
    this.processedLabelId = await this.ensureLabel(processedLabelName);
    this.sourceLabelId = await this.resolveLabelId(sourceLabelName);

    const intervalMs = this.getPollIntervalMs();
    this.logger.log(
      `[${this.instanceId}] Starting Gmail downloader with interval ${intervalMs}ms`,
    );

    // Run immediately at startup, then on schedule
    void this.pollOnce();
    this.intervalHandle = setInterval(() => void this.pollOnce(), intervalMs);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.log('Gmail downloader stopped');
    }
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

  private getPollIntervalMs(): number {
    const raw = this.config.get<string>('GMAIL_POLL_INTERVAL_MS');
    const num = raw ? Number(raw) : Number.NaN;
    if (!Number.isNaN(num) && num > 0) {
      return num;
    }
    return 5 * 60 * 1000; // default 5 minutes
  }

  private getListPageSize(): number {
    const raw = this.config.get<string>('GMAIL_LIST_PAGE_SIZE');
    const n = raw ? Number(raw) : Number.NaN;
    if (Number.isFinite(n) && n >= 1 && n <= 500) {
      return Math.floor(n);
    }
    return 100; // Gmail max is 500
  }

  private getSourceLabelName(): string {
    const val = this.config.get<string>('GMAIL_LABEL');
    return val && val.trim().length > 0 ? val.trim() : 'DMARC Reports';
  }

  private getProcessedLabelName(): string {
    const val = this.config.get<string>('GMAIL_PROCESSED_LABEL');
    return val && val.trim().length > 0 ? val.trim() : 'DMARC Processed';
  }

  private getQueryString(): string {
    const fromEnv = this.config.get<string>('GMAIL_QUERY');
    if (fromEnv && fromEnv.trim().length > 0) {
      return fromEnv.trim();
    }
    // Default: messages with attachments from last 10 days. Label filtering is done via labelIds.
    // Exclude processed label by name in query as a safety net (if it exists).
    const processedName = this.getProcessedLabelName();
    // TODO: remove 10d limit
    return `has:attachment newer_than:5d -label:${JSON.stringify(processedName)}`;
  }

  private getAuthMode(): 'service_account' | 'oauth' {
    const raw = (
      this.config.get<string>('GMAIL_AUTH_MODE') || ''
    ).toLowerCase();
    return raw === 'oauth' ? 'oauth' : 'service_account';
  }

  private async loadServiceAccountConfig(): Promise<GmailAuthConfig | null> {
    const delegatedUser = this.config.get<string>('GMAIL_DELEGATED_USER') || '';
    const jsonPath =
      this.config.get<string>('GMAIL_CREDENTIALS_JSON_PATH') || '';
    let clientEmail = this.config.get<string>('GMAIL_CLIENT_EMAIL') || '';
    let privateKey = this.config.get<string>('GMAIL_PRIVATE_KEY') || '';

    if (jsonPath && jsonPath.trim().length > 0) {
      try {
        const abs = path.isAbsolute(jsonPath)
          ? jsonPath
          : path.resolve(process.cwd(), jsonPath);
        const raw = await fs.readFile(abs, 'utf8');
        const parsed = JSON.parse(raw) as {
          client_email?: string;
          private_key?: string;
        };
        clientEmail = parsed.client_email || clientEmail;
        privateKey = parsed.private_key || privateKey;
      } catch (err) {
        this.logger.error(
          `Failed to read credentials JSON at ${jsonPath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Handle escaped newlines in env-stored private keys
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    if (!clientEmail || !privateKey || !delegatedUser) {
      this.logger.error(
        'Missing GMAIL_CLIENT_EMAIL / GMAIL_PRIVATE_KEY / GMAIL_DELEGATED_USER (or credentials JSON)',
      );
      return null;
    }
    return { clientEmail, privateKey, delegatedUser };
  }

  private initializeGmailClientServiceAccount(
    auth: GmailAuthConfig,
  ): Promise<void> {
    const jwt = new google.auth.JWT({
      email: auth.clientEmail,
      key: auth.privateKey,
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
      subject: auth.delegatedUser,
    });
    this.gmailClient = google.gmail({ version: 'v1', auth: jwt });
    return Promise.resolve();
  }

  private loadOauthConfig(): Promise<GmailOauthConfig | null> {
    const clientId = this.config.get<string>('GMAIL_OAUTH_CLIENT_ID') || '';
    const clientSecret =
      this.config.get<string>('GMAIL_OAUTH_CLIENT_SECRET') || '';
    const refreshToken =
      this.config.get<string>('GMAIL_OAUTH_REFRESH_TOKEN') || '';
    const redirectUri =
      this.config.get<string>('GMAIL_OAUTH_REDIRECT_URI') || undefined;
    if (!clientId || !clientSecret || !refreshToken) {
      this.logger.error(
        'Missing GMAIL_OAUTH_CLIENT_ID / GMAIL_OAUTH_CLIENT_SECRET / GMAIL_OAUTH_REFRESH_TOKEN',
      );
      return Promise.resolve(null);
    }
    return Promise.resolve({
      clientId,
      clientSecret,
      refreshToken,
      redirectUri,
    });
  }

  private initializeGmailClientOauth(authCfg: GmailOauthConfig): Promise<void> {
    const oauth2Client: OAuth2Client = new google.auth.OAuth2(
      authCfg.clientId,
      authCfg.clientSecret,
      authCfg.redirectUri,
    );
    oauth2Client.setCredentials({ refresh_token: authCfg.refreshToken });
    this.gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });
    return Promise.resolve();
  }

  private async ensureLabel(name: string): Promise<string | null> {
    const existing = await this.resolveLabelId(name);
    if (existing) {
      return existing;
    }
    if (!this.gmailClient) {
      return null;
    }
    try {
      const res = await this.gmailClient.users.labels.create({
        userId: 'me',
        requestBody: { name },
      });
      return res.data.id || null;
    } catch (err) {
      this.logger.warn(
        `Failed to create label ${name}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async resolveLabelId(name: string): Promise<string | null> {
    if (!this.gmailClient) {
      return null;
    }
    try {
      const res = await this.gmailClient.users.labels.list({ userId: 'me' });
      const labels = res.data.labels || [];
      const found = labels.find((l) => l.name === name);
      return found?.id || null;
    } catch (err) {
      this.logger.warn(
        `Failed to list labels: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async pollOnce(): Promise<void> {
    if (this.isRunning) {
      this.logger.log(
        `[${this.instanceId}] Poll already running, skipping this tick`,
      );
      return;
    }
    if (!this.gmailClient) {
      return;
    }
    this.isRunning = true;
    const downloadDir = this.getDownloadDir();
    try {
      await fs.mkdir(downloadDir, { recursive: true }).catch(() => undefined);
      const q = this.getQueryString();
      let pageToken: string | undefined;
      let totalProcessed = 0;

      // Important: collect message IDs first, then process, to avoid pagination issues
      // when labels are modified during iteration.
      const idsToProcess: string[] = [];
      const pageSize = this.getListPageSize();

      do {
        const listRes = await this.gmailClient.users.messages.list({
          userId: 'me',
          q,
          labelIds: this.sourceLabelId ? [this.sourceLabelId] : undefined,
          maxResults: pageSize,
          pageToken,
        });
        const messages = listRes.data.messages || [];
        pageToken = listRes.data.nextPageToken || undefined;
        for (const msg of messages) {
          if (msg.id) {
            idsToProcess.push(msg.id);
          }
        }
      } while (pageToken);

      this.logger.log(
        `[${this.instanceId}] Messages matched=${idsToProcess.length} q=${JSON.stringify(q)} label=${this.getSourceLabelName()}`,
      );

      for (const id of idsToProcess) {
        const downloads = await this.handleMessage(id, downloadDir);
        totalProcessed += downloads;
      }

      this.logger.log(
        `[${this.instanceId}] Poll completed, attachments downloaded: ${totalProcessed}`,
      );
    } catch (err) {
      this.logger.error(
        `[${this.instanceId}] Poll failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    } finally {
      this.isRunning = false;
    }
  }

  private async handleMessage(
    messageId: string,
    downloadDir: string,
  ): Promise<number> {
    if (!this.gmailClient) {
      return 0;
    }
    try {
      const msgRes = await this.gmailClient.users.messages.get({
        userId: 'me',
        id: messageId,
      });
      const payload = msgRes.data.payload;
      if (!payload) {
        return 0;
      }
      const parts: gmail_v1.Schema$MessagePart[] = this.flattenParts(payload);
      const attachments = parts.filter(
        (p) => (p.filename || '').length > 0 && p.body && p.body.attachmentId,
      );
      let count = 0;
      for (const part of attachments) {
        const attachmentId = part.body!.attachmentId!;
        const filename = this.getSafeFilename(part.filename!);
        const attRes = await this.gmailClient.users.messages.attachments.get({
          userId: 'me',
          messageId,
          id: attachmentId,
        });
        const data = attRes.data.data || '';
        if (!data) {
          continue;
        }
        const buffer = this.decodeBase64Url(data);

        const processInline = this.getProcessInline();
        if (processInline) {
          const fileType = this.detectFileTypeByName(filename);
          try {
            const xmlContent = await this.dmarcReportService.unzipReport(
              buffer,
              fileType,
            );
            const parsed =
              await this.dmarcReportService.parseXmlReport(xmlContent);
            (parsed as any).originalXml = minifyXml(xmlContent);
            await this.dmarcReportService.createOrUpdateByReportId(parsed);
            count += 1;
            this.logger.log(
              `[${this.instanceId}] Inline processed ${filename}`,
            );
            const saveOriginal = this.shouldSaveOriginal();
            if (saveOriginal) {
              const successDir = this.getProcessedSuccessDir();
              await fs
                .mkdir(successDir, { recursive: true })
                .catch(() => undefined);
              const uniqueName = await this.uniquePath(
                successDir,
                filename,
                messageId,
                attachmentId,
              );
              await fs.writeFile(uniqueName, buffer);
            }
          } catch (err) {
            this.logger.warn(
              `Inline processing failed for ${filename}: ${err instanceof Error ? err.message : String(err)}`,
            );
            await this.handleFailure(messageId, filename, buffer, attachmentId);
          }
        } else {
          // Legacy path: just save into watch dir
          try {
            await fs
              .mkdir(downloadDir, { recursive: true })
              .catch(() => undefined);
            const uniqueName = await this.uniquePath(
              downloadDir,
              filename,
              messageId,
              attachmentId,
            );
            await fs.writeFile(uniqueName, buffer);
            count += 1;
            this.logger.log(
              `[${this.instanceId}] Saved attachment ${path.basename(uniqueName)} (${buffer.length} bytes)`,
            );
          } catch (err) {
            this.logger.warn(
              `Saving attachment failed for ${filename}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
      if (attachments.length > 0 && count === attachments.length) {
        await this.markMessageProcessed(messageId);
      }
      return count;
    } catch (err) {
      this.logger.warn(
        `Failed to download attachments for message ${messageId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }

  private getProcessInline(): boolean {
    const raw = this.config.get<string>('GMAIL_PROCESS_INLINE');
    return raw ? raw.toLowerCase() === 'true' : true; // default true
  }

  private shouldSaveOriginal(): boolean {
    const raw = this.config.get<string>('GMAIL_SAVE_ORIGINAL');
    return raw ? raw.toLowerCase() === 'true' : false;
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

  private failureCounts: Map<string, number> = new Map();

  private getFailedLabelName(): string | null {
    const val = this.config.get<string>('GMAIL_FAILED_LABEL') || '';
    return val.trim().length > 0 ? val.trim() : null;
  }

  private getFailureThreshold(): number {
    const raw = this.config.get<string>('GMAIL_FAILURE_THRESHOLD') || '';
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 3;
  }

  private async handleFailure(
    messageId: string,
    filename: string,
    buffer: Buffer,
    attachmentId: string,
  ): Promise<void> {
    const key = messageId;
    const count = (this.failureCounts.get(key) || 0) + 1;
    this.failureCounts.set(key, count);
    const threshold = this.getFailureThreshold();

    // Optionally archive failure copy
    try {
      const dir = this.getProcessedFailureDir();
      await fs.mkdir(dir, { recursive: true }).catch(() => undefined);
      const uniqueName = await this.uniquePath(
        dir,
        filename,
        messageId,
        attachmentId,
      );
      await fs.writeFile(uniqueName, buffer);
    } catch {}

    if (count >= threshold) {
      // Add failed label to avoid infinite retries
      const failedName = this.getFailedLabelName();
      if (failedName) {
        const failedLabelId = await this.ensureLabel(failedName);
        if (failedLabelId && this.gmailClient) {
          try {
            await this.gmailClient.users.messages.modify({
              userId: 'me',
              id: messageId,
              requestBody: { addLabelIds: [failedLabelId] },
            });
          } catch {}
        }
      }
      // Reset counter to avoid growth
      this.failureCounts.delete(key);
    }
  }

  private flattenParts(
    root: gmail_v1.Schema$MessagePart,
  ): gmail_v1.Schema$MessagePart[] {
    const out: gmail_v1.Schema$MessagePart[] = [];
    const stack: gmail_v1.Schema$MessagePart[] = [root];
    while (stack.length > 0) {
      const current = stack.pop()!;
      out.push(current);
      const children = current.parts || [];
      for (const child of children) {
        stack.push(child);
      }
    }
    return out;
  }

  private getSafeFilename(name: string): string {
    const base = path
      .basename(name)
      .replace(/[\r\n]/g, '')
      .trim();
    return base.length > 0 ? base : 'attachment.bin';
  }

  private async uniquePath(
    dir: string,
    filename: string,
    messageId: string,
    attachmentId: string,
  ): Promise<string> {
    const base = path.basename(filename, path.extname(filename));
    const ext = path.extname(filename);
    const candidate = path.join(
      dir,
      `${base}-${messageId}-${attachmentId}${ext}`,
    );
    try {
      await fs.stat(candidate);
      // If exists, add timestamp suffix
      const timestamp = Date.now();
      return path.join(
        dir,
        `${base}-${messageId}-${attachmentId}-${timestamp}${ext}`,
      );
    } catch {
      return candidate;
    }
  }

  private decodeBase64Url(data: string): Buffer {
    const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4;
    const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
    return Buffer.from(padded, 'base64');
  }

  private async markMessageProcessed(messageId: string): Promise<void> {
    if (!this.gmailClient) {
      return;
    }
    const addLabelIds: string[] = [];
    const removeLabelIds: string[] = [];
    if (this.processedLabelId) {
      addLabelIds.push(this.processedLabelId);
    }
    const raw = this.config.get<string>('GMAIL_REMOVE_SOURCE_LABEL');
    const shouldRemoveSource = raw ? raw.toLowerCase() === 'true' : true; // default true
    if (shouldRemoveSource && this.sourceLabelId) {
      removeLabelIds.push(this.sourceLabelId);
    }
    if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
      return;
    }
    try {
      await this.gmailClient.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: { addLabelIds, removeLabelIds },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to mark message ${messageId} processed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
