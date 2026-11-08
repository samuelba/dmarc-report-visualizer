import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ImapDownloaderService } from './imap-downloader.service';
import { DmarcReportService } from '../dmarc-report.service';
import { EmailMessageTrackingService } from './email-message-tracking.service';
import {
  EmailSource,
  ProcessingStatus,
} from '../entities/email-message-tracking.entity';
import type { Attachment } from 'mailparser';

// imapflow resolves messageMove() to a result object on success and to `false`
// on failure (it never rejects for a NO response).
const MOVE_OK = { path: 'INBOX', destination: 'Processed' };

// A fresh mock IMAP client. UIDVALIDITY 7 => tracking keys look like "INBOX:7:<uid>".
const createMockImapClient = (): any => ({
  on: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  logout: jest.fn().mockResolvedValue(undefined),
  close: jest.fn(),
  getMailboxLock: jest.fn().mockResolvedValue({ release: jest.fn() }),
  search: jest.fn().mockResolvedValue([]),
  fetchOne: jest.fn(),
  messageMove: jest.fn().mockResolvedValue(MOVE_OK),
  messageFlagsAdd: jest.fn().mockResolvedValue(true),
  mailboxCreate: jest.fn().mockResolvedValue({ path: 'x', created: true }),
  mailbox: { uidValidity: BigInt(7) },
  usable: true,
});

// Mock ImapFlow
jest.mock('imapflow', () => ({
  ImapFlow: jest.fn(),
}));

// Mock mailparser
jest.mock('mailparser', () => ({
  simpleParser: jest.fn(),
}));

// Mock fs/promises
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

// Mock xml-minifier
jest.mock('../utils/xml-minifier.util', () => ({
  minifyXml: jest.fn((xml: string) => xml),
}));

describe('ImapDownloaderService', () => {
  let service: ImapDownloaderService;
  let _configService: ConfigService;
  let _dmarcReportService: DmarcReportService;
  let _trackingService: EmailMessageTrackingService;

  const defaultConfigValues: Record<string, string | undefined> = {
    ENABLE_IMAP_DOWNLOADER: 'false',
    IMAP_HOST: 'imap.example.com',
    IMAP_PORT: '993',
    IMAP_USER: 'dmarc@example.com',
    IMAP_PASSWORD: 'password123',
    IMAP_TLS: 'true',
    IMAP_TLS_REJECT_UNAUTHORIZED: 'true',
    IMAP_MAILBOX: 'INBOX',
    IMAP_SEARCH_CRITERIA: 'UNSEEN',
    IMAP_PROCESSED_FOLDER: '',
    IMAP_FAILED_FOLDER: '',
    IMAP_POLL_INTERVAL_MS: '300000',
    IMAP_PROCESS_INLINE: 'true',
    IMAP_SAVE_ORIGINAL: 'false',
    IMAP_FAILURE_THRESHOLD: '3',
    FILE_WATCH_DIR: '',
  };

  const mockConfigService = {
    get: jest.fn((key: string) => defaultConfigValues[key]),
  };

  const mockDmarcReportService = {
    unzipReport: jest.fn(),
    parseXmlReport: jest.fn(),
    createOrUpdateByReportId: jest.fn(),
  };

  const mockTrackingService = {
    isProcessed: jest.fn(),
    exists: jest.fn(),
    markProcessing: jest.fn(),
    markSuccess: jest.fn(),
    markFailed: jest.fn(),
    markSkipped: jest.fn(),
    getTracking: jest.fn(),
    cleanupOldRecords: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImapDownloaderService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DmarcReportService, useValue: mockDmarcReportService },
        {
          provide: EmailMessageTrackingService,
          useValue: mockTrackingService,
        },
      ],
    }).compile();

    service = module.get<ImapDownloaderService>(ImapDownloaderService);
    _configService = module.get<ConfigService>(ConfigService);
    _dmarcReportService = module.get<DmarcReportService>(DmarcReportService);
    _trackingService = module.get<EmailMessageTrackingService>(
      EmailMessageTrackingService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    // clearAllMocks keeps queued *Once values; drop them so tests stay isolated
    mockTrackingService.getTracking.mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should not start when ENABLE_IMAP_DOWNLOADER is not true', () => {
      mockConfigService.get.mockImplementation(
        (key: string) => defaultConfigValues[key],
      );

      service.onModuleInit();

      // Should not throw, should just log and return
      expect(service['imapClient']).toBeNull();
      expect(service['intervalHandle']).toBeNull();
    });

    it('should initialize and start polling when enabled', () => {
      const configWithEnabled = {
        ...defaultConfigValues,
        ENABLE_IMAP_DOWNLOADER: 'true',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configWithEnabled[key],
      );
      // Prevent actual polling
      jest.spyOn(service as any, 'pollOnce').mockResolvedValue(undefined);

      service.onModuleInit();

      // Connections are opened per poll, not at startup
      expect(service['imapClient']).toBeNull();
      expect(service['intervalHandle']).not.toBeNull();

      // Clean up interval
      if (service['intervalHandle']) {
        clearInterval(service['intervalHandle']);
        service['intervalHandle'] = null;
      }
    });

    it('should warn when the search criteria would rescan already-read mail', () => {
      const configRescan = {
        ...defaultConfigValues,
        ENABLE_IMAP_DOWNLOADER: 'true',
        IMAP_SEARCH_CRITERIA: 'ALL',
        IMAP_PROCESSED_FOLDER: '',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configRescan[key],
      );
      jest.spyOn(service as any, 'pollOnce').mockResolvedValue(undefined);
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      service.onModuleInit();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('IMAP_PROCESSED_FOLDER'),
      );

      if (service['intervalHandle']) {
        clearInterval(service['intervalHandle']);
        service['intervalHandle'] = null;
      }
    });

    it('should warn when TLS certificate verification is disabled', () => {
      const configInsecureTls = {
        ...defaultConfigValues,
        ENABLE_IMAP_DOWNLOADER: 'true',
        IMAP_TLS_REJECT_UNAUTHORIZED: 'false',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configInsecureTls[key],
      );
      jest.spyOn(service as any, 'pollOnce').mockResolvedValue(undefined);
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      service.onModuleInit();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('TLS certificate verification is DISABLED'),
      );

      if (service['intervalHandle']) {
        clearInterval(service['intervalHandle']);
        service['intervalHandle'] = null;
      }
    });

    it('should handle initialization errors gracefully', () => {
      const configMissing = {
        ...defaultConfigValues,
        ENABLE_IMAP_DOWNLOADER: 'true',
        IMAP_HOST: undefined,
        IMAP_USER: undefined,
        IMAP_PASSWORD: undefined,
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configMissing[key],
      );

      // Should not throw
      service.onModuleInit();

      expect(service['intervalHandle']).toBeNull();
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear interval and log out an active client', async () => {
      service['intervalHandle'] = setInterval(() => {}, 100000);
      const mockClient = {
        logout: jest.fn().mockResolvedValue(undefined),
        close: jest.fn(),
      };
      service['imapClient'] = mockClient as any;

      await service.onModuleDestroy();

      expect(service['intervalHandle']).toBeNull();
      expect(mockClient.logout).toHaveBeenCalled();
      expect(service['imapClient']).toBeNull();
    });

    it('should force-close the client when logout fails', async () => {
      service['intervalHandle'] = setInterval(() => {}, 100000);
      const mockClient = {
        logout: jest.fn().mockRejectedValue(new Error('Logout failed')),
        close: jest.fn().mockImplementation(() => {
          throw new Error('Close failed');
        }),
      };
      service['imapClient'] = mockClient as any;

      // Should not throw
      await service.onModuleDestroy();

      expect(mockClient.close).toHaveBeenCalled();
      expect(service['intervalHandle']).toBeNull();
      expect(service['imapClient']).toBeNull();
    });

    it('should handle case when no interval or client exists', async () => {
      service['intervalHandle'] = null;
      service['imapClient'] = null;

      // Should not throw
      await service.onModuleDestroy();
    });
  });

  describe('pollOnce', () => {
    let mockImapClient: any;
    const { ImapFlow } = require('imapflow');

    beforeEach(() => {
      mockImapClient = createMockImapClient();
      ImapFlow.mockImplementation(() => mockImapClient);
      mockConfigService.get.mockImplementation(
        (key: string) => defaultConfigValues[key],
      );
    });

    it('should skip if already running', async () => {
      service['isRunning'] = true;

      await service['pollOnce']();

      expect(ImapFlow).not.toHaveBeenCalled();
      expect(mockImapClient.getMailboxLock).not.toHaveBeenCalled();
    });

    it('should open a fresh connection per poll and log out afterwards', async () => {
      await service['pollOnce']();
      await service['pollOnce']();

      expect(ImapFlow).toHaveBeenCalledTimes(2);
      expect(mockImapClient.connect).toHaveBeenCalledTimes(2);
      expect(mockImapClient.logout).toHaveBeenCalledTimes(2);
      expect(service['imapClient']).toBeNull();
    });

    it('should force-close the connection when logout fails', async () => {
      mockImapClient.logout.mockRejectedValue(new Error('Logout failed'));

      await service['pollOnce']();

      expect(mockImapClient.close).toHaveBeenCalled();
      expect(service['imapClient']).toBeNull();
    });

    it('should not search when the connection fails', async () => {
      mockImapClient.connect.mockRejectedValue(new Error('Connection refused'));

      await service['pollOnce']();

      expect(mockImapClient.getMailboxLock).not.toHaveBeenCalled();
      expect(service['isRunning']).toBe(false);
      expect(service['imapClient']).toBeNull();
    });

    it('should skip messages already processed or skipped', async () => {
      mockImapClient.search.mockResolvedValue([1, 2, 3]);
      mockTrackingService.getTracking
        .mockResolvedValueOnce({ status: ProcessingStatus.SUCCESS })
        .mockResolvedValueOnce({ status: ProcessingStatus.SKIPPED })
        .mockResolvedValueOnce({ status: ProcessingStatus.SUCCESS });
      const handleMessageSpy = jest.spyOn(service as any, 'handleMessage');

      await service['pollOnce']();

      expect(mockImapClient.search).toHaveBeenCalledWith(
        { unseen: true },
        { uid: true },
      );
      expect(mockTrackingService.getTracking).toHaveBeenCalledTimes(3);
      expect(handleMessageSpy).not.toHaveBeenCalled();
      expect(mockImapClient.messageFlagsAdd).not.toHaveBeenCalled();
    });

    it('should mark permanently failed messages as seen using UIDs', async () => {
      mockImapClient.search.mockResolvedValue([7]);
      mockTrackingService.getTracking.mockResolvedValue({
        status: ProcessingStatus.FAILED,
        attemptCount: 3,
      });

      await service['pollOnce']();

      expect(mockImapClient.messageFlagsAdd).toHaveBeenCalledWith(
        '7',
        ['\\Seen'],
        { uid: true },
      );
    });

    it('should handle messages that are not yet processed', async () => {
      mockImapClient.search.mockResolvedValue([42]);
      mockTrackingService.getTracking.mockResolvedValue(null);
      const handleMessageSpy = jest
        .spyOn(service as any, 'handleMessage')
        .mockResolvedValue(undefined);

      await service['pollOnce']();

      expect(handleMessageSpy).toHaveBeenCalledWith(
        42,
        'INBOX:7:42',
        expect.any(String),
        'dmarc@example.com',
      );
    });

    it('should scope the tracking key to mailbox and UIDVALIDITY', async () => {
      const configCustomMailbox = {
        ...defaultConfigValues,
        IMAP_MAILBOX: 'DMARC',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configCustomMailbox[key],
      );
      mockImapClient.mailbox = { uidValidity: BigInt(123) };
      mockImapClient.search.mockResolvedValue([5]);
      mockTrackingService.getTracking.mockResolvedValue({
        status: ProcessingStatus.SUCCESS,
      });

      await service['pollOnce']();

      expect(mockImapClient.getMailboxLock).toHaveBeenCalledWith('DMARC');
      expect(mockTrackingService.getTracking).toHaveBeenCalledWith(
        'DMARC:123:5',
        EmailSource.IMAP,
        'dmarc@example.com',
      );
    });

    it('should treat a reused UID under a new UIDVALIDITY as a new message', async () => {
      mockImapClient.mailbox = { uidValidity: BigInt(8) };
      mockImapClient.search.mockResolvedValue([5]);
      mockTrackingService.getTracking.mockImplementation((key: string) =>
        Promise.resolve(
          key === 'INBOX:7:5' ? { status: ProcessingStatus.SUCCESS } : null,
        ),
      );
      const handleMessageSpy = jest
        .spyOn(service as any, 'handleMessage')
        .mockResolvedValue(undefined);

      await service['pollOnce']();

      expect(handleMessageSpy).toHaveBeenCalledWith(
        5,
        'INBOX:8:5',
        expect.any(String),
        'dmarc@example.com',
      );
    });

    it('should handle search returning false', async () => {
      mockImapClient.search.mockResolvedValue(false);

      await service['pollOnce']();

      // Should not error, treats false as empty array
      expect(mockTrackingService.getTracking).not.toHaveBeenCalled();
    });

    it('should always release the mailbox lock', async () => {
      const releaseFn = jest.fn();
      mockImapClient.getMailboxLock.mockResolvedValue({
        release: releaseFn,
      });
      mockImapClient.search.mockRejectedValue(new Error('Search failed'));

      await service['pollOnce']();

      expect(releaseFn).toHaveBeenCalled();
      expect(mockImapClient.logout).toHaveBeenCalled();
    });

    it('should reset isRunning after poll completes', async () => {
      mockImapClient.search.mockResolvedValue([]);

      await service['pollOnce']();

      expect(service['isRunning']).toBe(false);
    });

    it('should reset isRunning even if poll fails', async () => {
      mockImapClient.getMailboxLock.mockRejectedValue(new Error('Lock failed'));

      await service['pollOnce']();

      expect(service['isRunning']).toBe(false);
    });
  });

  describe('handleMessage', () => {
    let mockImapClient: any;
    const { simpleParser } = require('mailparser');
    const KEY = 'INBOX:7:1';

    const fetchResult = {
      source: Buffer.from('raw email'),
      envelope: {},
    };

    const mockSuccessfulParse = (): void => {
      mockDmarcReportService.unzipReport.mockResolvedValue('<xml>data</xml>');
      mockDmarcReportService.parseXmlReport.mockResolvedValue({
        reportId: 'rpt1',
      });
      mockDmarcReportService.createOrUpdateByReportId.mockResolvedValue({
        id: 'saved-report-id',
      });
    };

    beforeEach(() => {
      mockImapClient = createMockImapClient();
      service['imapClient'] = mockImapClient;
      mockConfigService.get.mockImplementation(
        (key: string) => defaultConfigValues[key],
      );
      mockTrackingService.markProcessing.mockResolvedValue({});
      mockTrackingService.markSuccess.mockResolvedValue({});
      mockTrackingService.markSkipped.mockResolvedValue({});
      mockTrackingService.markFailed.mockResolvedValue({ attemptCount: 1 });
    });

    it('should mark message as processing using the tracking key', async () => {
      mockImapClient.fetchOne.mockResolvedValue(fetchResult);
      simpleParser.mockResolvedValue({ attachments: [] });

      await service['handleMessage'](
        1,
        KEY,
        '/tmp/download',
        'user@example.com',
      );

      expect(mockTrackingService.markProcessing).toHaveBeenCalledWith(
        KEY,
        EmailSource.IMAP,
        'user@example.com',
      );
    });

    it('should leave messages without attachments untouched and record them as skipped', async () => {
      mockImapClient.fetchOne.mockResolvedValue(fetchResult);
      simpleParser.mockResolvedValue({ attachments: [] });

      await service['handleMessage'](
        1,
        KEY,
        '/tmp/download',
        'user@example.com',
      );

      expect(mockImapClient.fetchOne).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ source: true }),
        { uid: true },
      );
      expect(mockTrackingService.markSkipped).toHaveBeenCalledWith(
        KEY,
        EmailSource.IMAP,
        'user@example.com',
      );
      expect(mockTrackingService.markSuccess).not.toHaveBeenCalled();
      expect(mockImapClient.messageFlagsAdd).not.toHaveBeenCalled();
      expect(mockImapClient.messageMove).not.toHaveBeenCalled();
    });

    it('should ignore messages whose attachments are not reports', async () => {
      const fs = require('fs/promises');
      mockImapClient.fetchOne.mockResolvedValue(fetchResult);
      simpleParser.mockResolvedValue({
        attachments: [
          {
            filename: 'invoice.pdf',
            contentType: 'application/pdf',
            content: Buffer.from('%PDF'),
          },
          {
            filename: 'photo.jpg',
            contentType: 'image/jpeg',
            content: Buffer.from('jpeg'),
          },
        ],
      });

      await service['handleMessage'](
        1,
        KEY,
        '/tmp/download',
        'user@example.com',
      );

      expect(mockDmarcReportService.unzipReport).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(mockTrackingService.markSkipped).toHaveBeenCalled();
      expect(mockTrackingService.markFailed).not.toHaveBeenCalled();
      expect(mockImapClient.messageFlagsAdd).not.toHaveBeenCalled();
      expect(mockImapClient.messageMove).not.toHaveBeenCalled();
    });

    it('should process only report attachments when mixed with other files', async () => {
      mockImapClient.fetchOne.mockResolvedValue(fetchResult);
      simpleParser.mockResolvedValue({
        attachments: [
          {
            filename: 'logo.png',
            contentType: 'image/png',
            content: Buffer.from('png'),
          },
          {
            filename: 'google.com!example.com!1!2.xml.gz',
            contentType: 'application/gzip',
            content: Buffer.from('gz'),
          },
        ],
      });
      mockSuccessfulParse();

      await service['handleMessage'](
        1,
        KEY,
        '/tmp/download',
        'user@example.com',
      );

      expect(mockDmarcReportService.unzipReport).toHaveBeenCalledTimes(1);
      expect(mockDmarcReportService.unzipReport).toHaveBeenCalledWith(
        Buffer.from('gz'),
        'gz',
      );
      expect(mockTrackingService.markSuccess).toHaveBeenCalledWith(
        KEY,
        EmailSource.IMAP,
        'user@example.com',
        'saved-report-id',
      );
    });

    it('should process inline attachments and mark success', async () => {
      mockImapClient.fetchOne.mockResolvedValue(fetchResult);
      simpleParser.mockResolvedValue({
        attachments: [
          { filename: 'report.xml', content: Buffer.from('<xml>data</xml>') },
        ],
      });
      mockSuccessfulParse();

      await service['handleMessage'](
        1,
        KEY,
        '/tmp/download',
        'user@example.com',
      );

      expect(mockTrackingService.markSuccess).toHaveBeenCalledWith(
        KEY,
        EmailSource.IMAP,
        'user@example.com',
        'saved-report-id',
      );
      expect(mockImapClient.messageFlagsAdd).toHaveBeenCalledWith(
        '1',
        ['\\Seen'],
        { uid: true },
      );
    });

    it('should mark success in legacy (file watcher) mode', async () => {
      const configLegacy = {
        ...defaultConfigValues,
        IMAP_PROCESS_INLINE: 'false',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configLegacy[key],
      );
      mockImapClient.fetchOne.mockResolvedValue(fetchResult);
      simpleParser.mockResolvedValue({
        attachments: [
          { filename: 'report.xml', content: Buffer.from('<xml>data</xml>') },
        ],
      });

      await service['handleMessage'](
        1,
        KEY,
        '/tmp/download',
        'user@example.com',
      );

      expect(mockTrackingService.markSuccess).toHaveBeenCalledWith(
        KEY,
        EmailSource.IMAP,
        'user@example.com',
        undefined,
      );
    });

    it('should mark success when createOrUpdateByReportId returns null', async () => {
      mockImapClient.fetchOne.mockResolvedValue(fetchResult);
      simpleParser.mockResolvedValue({
        attachments: [
          { filename: 'empty.xml', content: Buffer.from('<xml></xml>') },
        ],
      });
      mockDmarcReportService.unzipReport.mockResolvedValue('<xml></xml>');
      mockDmarcReportService.parseXmlReport.mockResolvedValue({
        reportId: 'empty-rpt',
      });
      mockDmarcReportService.createOrUpdateByReportId.mockResolvedValue(null);

      await service['handleMessage'](
        1,
        KEY,
        '/tmp/download',
        'user@example.com',
      );

      expect(mockTrackingService.markSuccess).toHaveBeenCalledWith(
        KEY,
        EmailSource.IMAP,
        'user@example.com',
        undefined,
      );
      expect(mockTrackingService.markFailed).not.toHaveBeenCalled();
      expect(mockImapClient.messageFlagsAdd).toHaveBeenCalledWith(
        '1',
        ['\\Seen'],
        { uid: true },
      );
    });

    it('should record a failure when all report attachments fail', async () => {
      mockImapClient.fetchOne.mockResolvedValue(fetchResult);
      simpleParser.mockResolvedValue({
        attachments: [{ filename: 'report.xml', content: Buffer.from('bad') }],
      });
      mockDmarcReportService.unzipReport.mockRejectedValue(
        new Error('Invalid XML'),
      );

      await service['handleMessage'](
        1,
        KEY,
        '/tmp/download',
        'user@example.com',
      );

      expect(mockTrackingService.markFailed).toHaveBeenCalledWith(
        KEY,
        EmailSource.IMAP,
        'user@example.com',
        expect.stringContaining('Invalid XML'),
      );
      // Below threshold: message is left for a retry
      expect(mockImapClient.messageFlagsAdd).not.toHaveBeenCalled();
    });

    it('should record a failure when fetch returns no result', async () => {
      mockImapClient.fetchOne.mockResolvedValue(null);

      await service['handleMessage'](
        1,
        KEY,
        '/tmp/download',
        'user@example.com',
      );

      expect(mockTrackingService.markFailed).toHaveBeenCalledWith(
        KEY,
        EmailSource.IMAP,
        'user@example.com',
        expect.stringContaining('Failed to fetch message UID 1'),
      );
    });

    it('should record a failure when fetch returns no source', async () => {
      mockImapClient.fetchOne.mockResolvedValue({ source: null, envelope: {} });

      await service['handleMessage'](
        1,
        KEY,
        '/tmp/download',
        'user@example.com',
      );

      expect(mockTrackingService.markFailed).toHaveBeenCalledWith(
        KEY,
        EmailSource.IMAP,
        'user@example.com',
        expect.stringContaining('has no source data'),
      );
    });

    it('should record a failure when IMAP client is null', async () => {
      service['imapClient'] = null;

      await service['handleMessage'](
        1,
        KEY,
        '/tmp/download',
        'user@example.com',
      );

      expect(mockTrackingService.markFailed).toHaveBeenCalledWith(
        KEY,
        EmailSource.IMAP,
        'user@example.com',
        expect.stringContaining('IMAP client not initialized'),
      );
    });
  });

  describe('isReportAttachment', () => {
    const att = (filename: string | undefined, contentType = '') =>
      ({
        filename,
        contentType,
        content: Buffer.from(''),
      }) as unknown as Attachment;

    it.each([
      'report.xml',
      'REPORT.XML',
      'google.com!example.com!1!2.xml.gz',
      'report.gz',
      'report.zip',
    ])('should accept report file name %s', (name) => {
      expect(service['isReportAttachment'](att(name))).toBe(true);
    });

    it.each([
      'application/gzip',
      'application/x-gzip',
      'application/zip',
      'application/x-zip-compressed',
      'application/xml',
      'text/xml',
    ])('should accept report content type %s without a usable name', (type) => {
      expect(service['isReportAttachment'](att(undefined, type))).toBe(true);
    });

    it.each([
      ['invoice.pdf', 'application/pdf'],
      ['photo.jpg', 'image/jpeg'],
      ['notes.txt', 'text/plain'],
      [undefined, 'image/png'],
    ])('should reject %s (%s)', (name, type) => {
      expect(service['isReportAttachment'](att(name, type))).toBe(false);
    });
  });

  describe('markMessageProcessed', () => {
    let mockImapClient: any;

    beforeEach(() => {
      mockImapClient = {
        messageMove: jest.fn().mockResolvedValue(MOVE_OK),
        messageFlagsAdd: jest.fn().mockResolvedValue(true),
        mailboxCreate: jest
          .fn()
          .mockResolvedValue({ path: 'x', created: true }),
      };
      service['imapClient'] = mockImapClient;
    });

    it('should move message to processed folder when configured', async () => {
      const configWithFolder = {
        ...defaultConfigValues,
        IMAP_PROCESSED_FOLDER: 'Processed',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configWithFolder[key],
      );

      await service['markMessageProcessed'](42);

      expect(mockImapClient.messageMove).toHaveBeenCalledWith(
        '42',
        'Processed',
        { uid: true },
      );
    });

    it('should mark as seen when no processed folder is configured', async () => {
      mockConfigService.get.mockImplementation(
        (key: string) => defaultConfigValues[key],
      );

      await service['markMessageProcessed'](42);

      expect(mockImapClient.messageFlagsAdd).toHaveBeenCalledWith(
        '42',
        ['\\Seen'],
        { uid: true },
      );
    });

    it('should create folder and retry move when folder does not exist', async () => {
      const configWithFolder = {
        ...defaultConfigValues,
        IMAP_PROCESSED_FOLDER: 'NewFolder',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configWithFolder[key],
      );
      mockImapClient.messageMove
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(MOVE_OK);

      await service['markMessageProcessed'](42);

      expect(mockImapClient.mailboxCreate).toHaveBeenCalledWith('NewFolder');
      expect(mockImapClient.messageMove).toHaveBeenCalledTimes(2);
      expect(mockImapClient.messageMove).toHaveBeenCalledWith(
        '42',
        'NewFolder',
        { uid: true },
      );
    });

    it('should fall back to mark as seen when folder creation and move fails', async () => {
      const configWithFolder = {
        ...defaultConfigValues,
        IMAP_PROCESSED_FOLDER: 'BadFolder',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configWithFolder[key],
      );
      mockImapClient.messageMove.mockResolvedValue(false);
      mockImapClient.mailboxCreate.mockRejectedValue(
        new Error('Create failed'),
      );

      await service['markMessageProcessed'](42);

      expect(mockImapClient.messageFlagsAdd).toHaveBeenCalledWith(
        '42',
        ['\\Seen'],
        { uid: true },
      );
    });

    it('should fall back to mark as seen when the server refuses the move after creating the folder', async () => {
      const configWithFolder = {
        ...defaultConfigValues,
        IMAP_PROCESSED_FOLDER: 'Processed',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configWithFolder[key],
      );
      mockImapClient.messageMove.mockResolvedValue(false);

      await service['markMessageProcessed'](42);

      expect(mockImapClient.mailboxCreate).toHaveBeenCalledWith('Processed');
      expect(mockImapClient.messageMove).toHaveBeenCalledTimes(2);
      expect(mockImapClient.messageFlagsAdd).toHaveBeenCalledWith(
        '42',
        ['\\Seen'],
        { uid: true },
      );
    });

    it('should create the folder and retry when the move throws', async () => {
      const configWithFolder = {
        ...defaultConfigValues,
        IMAP_PROCESSED_FOLDER: 'Processed',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configWithFolder[key],
      );
      mockImapClient.messageMove
        .mockRejectedValueOnce(new Error('Connection hiccup'))
        .mockResolvedValueOnce(MOVE_OK);

      await service['markMessageProcessed'](42);

      expect(mockImapClient.mailboxCreate).toHaveBeenCalledWith('Processed');
      expect(mockImapClient.messageFlagsAdd).not.toHaveBeenCalled();
    });

    it('should warn when the server refuses to set the Seen flag', async () => {
      mockConfigService.get.mockImplementation(
        (key: string) => defaultConfigValues[key],
      );
      mockImapClient.messageFlagsAdd.mockResolvedValue(false);
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      await service['markMessageProcessed'](42);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not mark message UID 42 as seen'),
      );
    });

    it('should handle missing IMAP client gracefully', async () => {
      service['imapClient'] = null;

      // Should not throw
      await service['markMessageProcessed'](42);
    });
  });

  describe('handleFailure', () => {
    let mockImapClient: any;

    beforeEach(() => {
      mockImapClient = {
        messageMove: jest.fn().mockResolvedValue(MOVE_OK),
        messageFlagsAdd: jest.fn().mockResolvedValue(true),
        mailboxCreate: jest
          .fn()
          .mockResolvedValue({ path: 'x', created: true }),
      };
      service['imapClient'] = mockImapClient;
      mockConfigService.get.mockImplementation(
        (key: string) => defaultConfigValues[key],
      );
    });

    it('should increment failure count below threshold', async () => {
      mockTrackingService.markFailed.mockResolvedValue({ attemptCount: 1 });
      await service['handleFailure'](1, 'msg1', 'user@example.com', 'Error');

      expect(mockTrackingService.markFailed).toHaveBeenCalledWith(
        'msg1',
        EmailSource.IMAP,
        'user@example.com',
        'Error',
      );
      expect(mockImapClient.messageMove).not.toHaveBeenCalled();
      expect(mockImapClient.messageFlagsAdd).not.toHaveBeenCalled();
    });

    it('should mark as permanently failed at threshold', async () => {
      const configThreshold = {
        ...defaultConfigValues,
        IMAP_FAILURE_THRESHOLD: '3',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configThreshold[key],
      );

      mockTrackingService.markFailed.mockResolvedValue({ attemptCount: 3 });

      await service['handleFailure'](
        1,
        'msg1',
        'user@example.com',
        'Parse error',
      );

      expect(mockTrackingService.markFailed).toHaveBeenCalledWith(
        'msg1',
        EmailSource.IMAP,
        'user@example.com',
        'Parse error',
      );
      expect(mockImapClient.messageFlagsAdd).toHaveBeenCalledWith(
        '1',
        ['\\Seen'],
        { uid: true },
      );
    });

    it('should move failed message to folder when configured', async () => {
      const configWithFailedFolder = {
        ...defaultConfigValues,
        IMAP_FAILURE_THRESHOLD: '1',
        IMAP_FAILED_FOLDER: 'FailedMessages',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configWithFailedFolder[key],
      );

      mockTrackingService.markFailed.mockResolvedValue({ attemptCount: 1 });

      await service['handleFailure'](1, 'msg1', 'user@example.com', 'Error');

      expect(mockImapClient.messageMove).toHaveBeenCalledWith(
        '1',
        'FailedMessages',
        { uid: true },
      );
    });

    it('should create failed folder and retry move when folder does not exist', async () => {
      const configWithFailedFolder = {
        ...defaultConfigValues,
        IMAP_FAILURE_THRESHOLD: '1',
        IMAP_FAILED_FOLDER: 'FailedMessages',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configWithFailedFolder[key],
      );
      mockTrackingService.markFailed.mockResolvedValue({ attemptCount: 1 });
      mockImapClient.messageMove
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(MOVE_OK);

      await service['handleFailure'](1, 'msg1', 'user@example.com', 'Error');

      expect(mockImapClient.mailboxCreate).toHaveBeenCalledWith(
        'FailedMessages',
      );
      expect(mockImapClient.messageMove).toHaveBeenCalledTimes(2);
      expect(mockImapClient.messageFlagsAdd).not.toHaveBeenCalled();
    });

    it('should fall back to mark as seen when failed folder create and move fail', async () => {
      const configWithFailedFolder = {
        ...defaultConfigValues,
        IMAP_FAILURE_THRESHOLD: '1',
        IMAP_FAILED_FOLDER: 'FailedMessages',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configWithFailedFolder[key],
      );
      mockTrackingService.markFailed.mockResolvedValue({ attemptCount: 1 });
      mockImapClient.messageMove.mockResolvedValue(false);
      mockImapClient.mailboxCreate.mockRejectedValue(
        new Error('Create failed'),
      );

      await service['handleFailure'](1, 'msg1', 'user@example.com', 'Error');

      expect(mockTrackingService.markFailed).toHaveBeenCalled();
      expect(mockImapClient.messageFlagsAdd).toHaveBeenCalledWith(
        '1',
        ['\\Seen'],
        { uid: true },
      );
    });

    it('should sanitize credential-bearing errors before storing them', async () => {
      mockTrackingService.markFailed.mockResolvedValue({ attemptCount: 1 });

      await service['handleFailure'](
        1,
        'msg1',
        'user@example.com',
        'Authentication failed for user dmarc@example.com with password password123',
      );

      expect(mockTrackingService.markFailed).toHaveBeenCalledWith(
        'msg1',
        EmailSource.IMAP,
        'user@example.com',
        expect.not.stringContaining('password123'),
      );
    });
  });

  describe('sanitizeImapError', () => {
    beforeEach(() => {
      mockConfigService.get.mockImplementation(
        (key: string) => defaultConfigValues[key],
      );
    });

    it('should redact the configured IMAP password', () => {
      const result = service['sanitizeImapError'](
        'LOGIN failed for password123',
      );

      expect(result).not.toContain('password123');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact password= assignments', () => {
      const result = service['sanitizeImapError'](
        'AUTH failed password=super-secret-token',
      );

      expect(result).not.toContain('super-secret-token');
      expect(result).toContain('password=[REDACTED]');
    });

    it('should not redact pass inside other words', () => {
      const result = service['sanitizeImapError']('bypass=ok surpass:token');

      expect(result).toBe('bypass=ok surpass:token');
    });

    it('should truncate long messages to 500 characters', () => {
      const result = service['sanitizeImapError']('x'.repeat(800));

      expect(result).toHaveLength(500);
    });
  });

  describe('getSearchCriteria', () => {
    it('should return unseen criteria by default', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const result = service['getSearchCriteria']();

      expect(result).toEqual({ unseen: true });
    });

    it('should return unseen criteria for UNSEEN', () => {
      mockConfigService.get.mockReturnValue('UNSEEN');

      const result = service['getSearchCriteria']();

      expect(result).toEqual({ unseen: true });
    });

    it('should return all criteria for ALL', () => {
      mockConfigService.get.mockReturnValue('ALL');

      const result = service['getSearchCriteria']();

      expect(result).toEqual({ all: true });
    });

    it('should parse SUBJECT criteria with quotes', () => {
      mockConfigService.get.mockReturnValue('SUBJECT "DMARC Report"');

      const result = service['getSearchCriteria']();

      expect(result).toEqual({ subject: 'DMARC Report' });
    });

    it('should parse SUBJECT criteria without quotes', () => {
      mockConfigService.get.mockReturnValue('SUBJECT DMARC');

      const result = service['getSearchCriteria']();

      expect(result).toEqual({ subject: 'DMARC' });
    });

    it('should combine UNSEEN with a quoted SUBJECT', () => {
      mockConfigService.get.mockReturnValue('UNSEEN SUBJECT "DMARC Report"');

      expect(service['getSearchCriteria']()).toEqual({
        unseen: true,
        subject: 'DMARC Report',
      });
    });

    it('should combine criteria regardless of order and case', () => {
      mockConfigService.get.mockReturnValue('subject Report unseen');

      expect(service['getSearchCriteria']()).toEqual({
        unseen: true,
        subject: 'Report',
      });
    });

    it('should fall back to unseen for unrecognized criteria', () => {
      mockConfigService.get.mockReturnValue('CUSTOM_CRITERIA');

      const result = service['getSearchCriteria']();

      expect(result).toEqual({ unseen: true });
    });
  });

  describe('getSafeFilename', () => {
    it('should return the basename of a valid filename', () => {
      const result = service['getSafeFilename']('report.xml');

      expect(result).toBe('report.xml');
    });

    it('should strip path components', () => {
      const result = service['getSafeFilename']('/path/to/report.xml');

      expect(result).toBe('report.xml');
    });

    it('should strip newlines', () => {
      const result = service['getSafeFilename']('report\r\n.xml');

      expect(result).toBe('report.xml');
    });

    it('should return attachment.bin for empty name', () => {
      const result = service['getSafeFilename']('');

      expect(result).toBe('attachment.bin');
    });

    it('should return attachment.bin for whitespace-only name', () => {
      const result = service['getSafeFilename']('   ');

      expect(result).toBe('attachment.bin');
    });
  });

  describe('detectFileTypeByName', () => {
    it('should detect xml files', () => {
      expect(service['detectFileTypeByName']('report.xml')).toBe('xml');
    });

    it('should detect XML files (case-insensitive)', () => {
      expect(service['detectFileTypeByName']('report.XML')).toBe('xml');
    });

    it('should detect gz files', () => {
      expect(service['detectFileTypeByName']('report.xml.gz')).toBe('gz');
    });

    it('should detect standalone gz files', () => {
      expect(service['detectFileTypeByName']('report.gz')).toBe('gz');
    });

    it('should detect zip files', () => {
      expect(service['detectFileTypeByName']('report.zip')).toBe('zip');
    });

    it('should default to xml for unknown extensions', () => {
      expect(service['detectFileTypeByName']('report')).toBe('xml');
    });

    it('should return extension for other types', () => {
      expect(service['detectFileTypeByName']('file.tar')).toBe('tar');
    });
  });

  describe('config helpers', () => {
    it('getProcessInline should default to true', () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(service['getProcessInline']()).toBe(true);
    });

    it('getProcessInline should return false when set', () => {
      mockConfigService.get.mockReturnValue('false');

      expect(service['getProcessInline']()).toBe(false);
    });

    it('shouldSaveOriginal should default to false', () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(service['shouldSaveOriginal']()).toBe(false);
    });

    it('shouldSaveOriginal should return true when set', () => {
      mockConfigService.get.mockReturnValue('true');

      expect(service['shouldSaveOriginal']()).toBe(true);
    });

    it('getPollIntervalMs should default to 5 minutes', () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(service['getPollIntervalMs']()).toBe(300000);
    });

    it('getPollIntervalMs should use configured value', () => {
      mockConfigService.get.mockReturnValue('60000');

      expect(service['getPollIntervalMs']()).toBe(60000);
    });

    it('getPollIntervalMs should fall back on invalid value', () => {
      mockConfigService.get.mockReturnValue('not-a-number');

      expect(service['getPollIntervalMs']()).toBe(300000);
    });

    it('getFailureThreshold should default to 3', () => {
      mockConfigService.get.mockReturnValue('');

      expect(service['getFailureThreshold']()).toBe(3);
    });

    it('getFailureThreshold should use configured value', () => {
      mockConfigService.get.mockReturnValue('5');

      expect(service['getFailureThreshold']()).toBe(5);
    });

    it('getMailbox should default to INBOX', () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(service['getMailbox']()).toBe('INBOX');
    });

    it('getAccountIdentifier should default to unknown', () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(service['getAccountIdentifier']()).toBe('unknown');
    });

    it('getAccountIdentifier should return IMAP_USER', () => {
      mockConfigService.get.mockReturnValue('user@mail.com');

      expect(service['getAccountIdentifier']()).toBe('user@mail.com');
    });
  });

  describe('processAttachment', () => {
    const attachment = {
      filename: 'report.xml',
      content: Buffer.from('<xml>data</xml>'),
    } as unknown as Attachment;

    beforeEach(() => {
      mockConfigService.get.mockImplementation(
        (key: string) => defaultConfigValues[key],
      );
    });

    it('should process inline and return reportId', async () => {
      mockDmarcReportService.unzipReport.mockResolvedValue('<xml>data</xml>');
      mockDmarcReportService.parseXmlReport.mockResolvedValue({
        reportId: 'r1',
      });
      mockDmarcReportService.createOrUpdateByReportId.mockResolvedValue({
        id: 'report-uuid',
      });

      const result = await service['processAttachment'](
        attachment,
        '/tmp/download',
      );

      expect(result).toEqual({
        success: true,
        filename: 'report.xml',
        reportId: 'report-uuid',
      });
    });

    it('should save original file when shouldSaveOriginal is true', async () => {
      const configSaveOriginal = {
        ...defaultConfigValues,
        IMAP_SAVE_ORIGINAL: 'true',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configSaveOriginal[key],
      );
      mockDmarcReportService.unzipReport.mockResolvedValue('<xml>data</xml>');
      mockDmarcReportService.parseXmlReport.mockResolvedValue({
        reportId: 'r1',
      });
      mockDmarcReportService.createOrUpdateByReportId.mockResolvedValue({
        id: 'report-uuid',
      });
      const fs = require('fs/promises');

      await service['processAttachment'](attachment, '/tmp/download');

      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should save to download dir in legacy mode', async () => {
      const configLegacy = {
        ...defaultConfigValues,
        IMAP_PROCESS_INLINE: 'false',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configLegacy[key],
      );
      const fs = require('fs/promises');

      const result = await service['processAttachment'](
        attachment,
        '/tmp/download',
      );

      expect(result.success).toBe(true);
      expect(result.reportId).toBeUndefined();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should treat empty reports as success without reading savedReport.id', async () => {
      mockDmarcReportService.unzipReport.mockResolvedValue('<xml>empty</xml>');
      mockDmarcReportService.parseXmlReport.mockResolvedValue({
        reportId: 'empty-rpt',
      });
      mockDmarcReportService.createOrUpdateByReportId.mockResolvedValue(null);

      const result = await service['processAttachment'](
        attachment,
        '/tmp/download',
      );

      expect(result).toEqual({
        success: true,
        filename: 'report.xml',
      });
      expect(result.reportId).toBeUndefined();
    });

    it('should decode unnamed gzip attachments using their MIME type', async () => {
      const unnamed = {
        filename: undefined,
        contentType: 'application/gzip',
        content: Buffer.from('gz'),
      } as unknown as Attachment;
      mockDmarcReportService.unzipReport.mockResolvedValue('<xml>data</xml>');
      mockDmarcReportService.parseXmlReport.mockResolvedValue({
        reportId: 'r1',
      });
      mockDmarcReportService.createOrUpdateByReportId.mockResolvedValue({
        id: 'report-uuid',
      });

      const result = await service['processAttachment'](
        unnamed,
        '/tmp/download',
      );

      expect(mockDmarcReportService.unzipReport).toHaveBeenCalledWith(
        Buffer.from('gz'),
        'gz',
      );
      expect(result.filename).toBe('report.xml.gz');
    });

    it('should save failed attachment and rethrow on inline error', async () => {
      mockDmarcReportService.unzipReport.mockRejectedValue(
        new Error('Parse error'),
      );
      const fs = require('fs/promises');

      await expect(
        service['processAttachment'](attachment, '/tmp/download'),
      ).rejects.toThrow('Parse error');

      // Failed attachment should be saved to failure dir
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });
});
