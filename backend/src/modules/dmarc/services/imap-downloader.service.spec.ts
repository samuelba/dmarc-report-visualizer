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

// Mock ImapFlow
jest.mock('imapflow', () => {
  return {
    ImapFlow: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
      getMailboxLock: jest.fn().mockResolvedValue({ release: jest.fn() }),
      search: jest.fn().mockResolvedValue([]),
      fetchOne: jest.fn(),
      messageMove: jest.fn().mockResolvedValue(undefined),
      messageFlagsAdd: jest.fn().mockResolvedValue(undefined),
      mailboxCreate: jest.fn().mockResolvedValue(undefined),
      usable: true,
    })),
  };
});

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
    getTracking: jest.fn(),
    getFailedMessages: jest.fn(),
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

      expect(service['imapClient']).not.toBeNull();
      expect(service['intervalHandle']).not.toBeNull();

      // Clean up interval
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
    it('should clear interval and close client', () => {
      // Set up a fake interval and client
      service['intervalHandle'] = setInterval(() => {}, 100000);
      const mockClient = {
        close: jest.fn(),
      };
      service['imapClient'] = mockClient as any;

      service.onModuleDestroy();

      expect(service['intervalHandle']).toBeNull();
      expect(mockClient.close).toHaveBeenCalled();
      expect(service['imapClient']).toBeNull();
    });

    it('should handle close errors gracefully', () => {
      service['intervalHandle'] = setInterval(() => {}, 100000);
      const mockClient = {
        close: jest.fn().mockImplementation(() => {
          throw new Error('Close failed');
        }),
      };
      service['imapClient'] = mockClient as any;

      // Should not throw
      service.onModuleDestroy();

      expect(service['intervalHandle']).toBeNull();
      expect(service['imapClient']).toBeNull();
    });

    it('should handle case when no interval or client exists', () => {
      service['intervalHandle'] = null;
      service['imapClient'] = null;

      // Should not throw
      service.onModuleDestroy();
    });
  });

  describe('pollOnce', () => {
    let mockImapClient: any;

    beforeEach(() => {
      mockImapClient = {
        usable: true,
        connect: jest.fn().mockResolvedValue(undefined),
        close: jest.fn(),
        getMailboxLock: jest.fn().mockResolvedValue({ release: jest.fn() }),
        search: jest.fn().mockResolvedValue([]),
        fetchOne: jest.fn(),
        messageMove: jest.fn().mockResolvedValue(undefined),
        messageFlagsAdd: jest.fn().mockResolvedValue(undefined),
        mailboxCreate: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      };
      service['imapClient'] = mockImapClient;
      mockConfigService.get.mockImplementation(
        (key: string) => defaultConfigValues[key],
      );
    });

    it('should skip if already running', async () => {
      service['isRunning'] = true;

      await service['pollOnce']();

      expect(mockImapClient.getMailboxLock).not.toHaveBeenCalled();
    });

    it('should skip if client not initialized', async () => {
      service['imapClient'] = null;

      await service['pollOnce']();

      expect(service['isRunning']).toBe(false);
    });

    it('should search for messages and skip already processed', async () => {
      mockImapClient.search.mockResolvedValue([1, 2, 3]);
      mockTrackingService.isProcessed.mockResolvedValue(true);

      await service['pollOnce']();

      expect(mockImapClient.search).toHaveBeenCalled();
      expect(mockTrackingService.isProcessed).toHaveBeenCalledTimes(3);
    });

    it('should handle messages that are not yet processed', async () => {
      mockImapClient.search.mockResolvedValue([42]);
      mockTrackingService.isProcessed.mockResolvedValue(false);

      // Mock the handleMessage to prevent full flow
      const handleMessageSpy = jest
        .spyOn(service as any, 'handleMessage')
        .mockResolvedValue(undefined);

      await service['pollOnce']();

      expect(handleMessageSpy).toHaveBeenCalledWith(
        42,
        expect.any(String),
        'dmarc@example.com',
      );
    });

    it('should reconnect if client is not usable', async () => {
      mockImapClient.usable = false;
      mockImapClient.search.mockResolvedValue([]);

      await service['pollOnce']();

      expect(mockImapClient.connect).toHaveBeenCalled();
    });

    it('should recreate client if reconnect fails', async () => {
      mockImapClient.usable = false;
      mockImapClient.connect.mockRejectedValue(new Error('Connection refused'));
      mockImapClient.search.mockResolvedValue([]);

      // After closeImapClient + initializeImapClient, a new mock client is needed
      const initSpy = jest
        .spyOn(service as any, 'initializeImapClient')
        .mockImplementation(() => {
          const newClient = {
            ...mockImapClient,
            usable: true,
            connect: jest.fn().mockResolvedValue(undefined),
            getMailboxLock: jest.fn().mockResolvedValue({ release: jest.fn() }),
            search: jest.fn().mockResolvedValue([]),
          };
          service['imapClient'] = newClient;
        });

      await service['pollOnce']();

      expect(initSpy).toHaveBeenCalled();
    });

    it('should handle search returning false', async () => {
      mockImapClient.search.mockResolvedValue(false);

      await service['pollOnce']();

      // Should not error, treats false as empty array
      expect(mockTrackingService.isProcessed).not.toHaveBeenCalled();
    });

    it('should always release the mailbox lock', async () => {
      const releaseFn = jest.fn();
      mockImapClient.getMailboxLock.mockResolvedValue({
        release: releaseFn,
      });
      mockImapClient.search.mockRejectedValue(new Error('Search failed'));

      await service['pollOnce']();

      expect(releaseFn).toHaveBeenCalled();
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

    beforeEach(() => {
      mockImapClient = {
        usable: true,
        fetchOne: jest.fn(),
        messageMove: jest.fn().mockResolvedValue(undefined),
        messageFlagsAdd: jest.fn().mockResolvedValue(undefined),
        mailboxCreate: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        close: jest.fn(),
      };
      service['imapClient'] = mockImapClient;
      mockConfigService.get.mockImplementation(
        (key: string) => defaultConfigValues[key],
      );
    });

    it('should mark message as processing', async () => {
      mockImapClient.fetchOne.mockResolvedValue({
        source: Buffer.from('raw email'),
        envelope: {},
        bodyStructure: {},
      });
      simpleParser.mockResolvedValue({ attachments: [] });
      mockTrackingService.markProcessing.mockResolvedValue({});

      await service['handleMessage'](1, '/tmp/download', 'user@example.com');

      expect(mockTrackingService.markProcessing).toHaveBeenCalledWith(
        '1',
        EmailSource.IMAP,
        'user@example.com',
      );
    });

    it('should skip messages with no attachments and mark as processed', async () => {
      mockImapClient.fetchOne.mockResolvedValue({
        source: Buffer.from('raw email'),
        envelope: {},
        bodyStructure: {},
      });
      simpleParser.mockResolvedValue({ attachments: [] });
      mockTrackingService.markProcessing.mockResolvedValue({});

      await service['handleMessage'](1, '/tmp/download', 'user@example.com');

      expect(mockImapClient.messageFlagsAdd).toHaveBeenCalledWith('1', [
        '\\Seen',
      ]);
    });

    it('should handle fetch returning no result', async () => {
      mockImapClient.fetchOne.mockResolvedValue(null);
      mockTrackingService.markProcessing.mockResolvedValue({});
      mockTrackingService.markFailed.mockResolvedValue({});

      await service['handleMessage'](1, '/tmp/download', 'user@example.com');

      // Should call handleFailure which eventually calls markFailed after threshold
    });

    it('should handle fetch returning no source', async () => {
      mockImapClient.fetchOne.mockResolvedValue({
        source: null,
        envelope: {},
      });
      mockTrackingService.markProcessing.mockResolvedValue({});
      mockTrackingService.markFailed.mockResolvedValue({});

      await service['handleMessage'](1, '/tmp/download', 'user@example.com');

      // Error handled internally
    });

    it('should process attachments inline and mark success', async () => {
      const attachment = {
        filename: 'report.xml',
        content: Buffer.from('<xml>data</xml>'),
      };
      mockImapClient.fetchOne.mockResolvedValue({
        source: Buffer.from('raw email'),
        envelope: {},
        bodyStructure: {},
      });
      simpleParser.mockResolvedValue({ attachments: [attachment] });
      mockTrackingService.markProcessing.mockResolvedValue({});
      mockDmarcReportService.unzipReport.mockResolvedValue('<xml>data</xml>');
      mockDmarcReportService.parseXmlReport.mockResolvedValue({
        reportId: 'rpt1',
      });
      mockDmarcReportService.createOrUpdateByReportId.mockResolvedValue({
        id: 'saved-report-id',
      });
      mockTrackingService.markSuccess.mockResolvedValue({});
      mockTrackingService.getTracking.mockResolvedValue({
        status: ProcessingStatus.SUCCESS,
      });

      await service['handleMessage'](1, '/tmp/download', 'user@example.com');

      expect(mockTrackingService.markSuccess).toHaveBeenCalledWith(
        '1',
        EmailSource.IMAP,
        'user@example.com',
        'saved-report-id',
      );
      expect(mockImapClient.messageFlagsAdd).toHaveBeenCalled();
    });

    it('should mark success when tracking status is not success after processing (legacy mode)', async () => {
      const configLegacy = {
        ...defaultConfigValues,
        IMAP_PROCESS_INLINE: 'false',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configLegacy[key],
      );

      const attachment = {
        filename: 'report.xml',
        content: Buffer.from('<xml>data</xml>'),
      };
      mockImapClient.fetchOne.mockResolvedValue({
        source: Buffer.from('raw email'),
        envelope: {},
        bodyStructure: {},
      });
      simpleParser.mockResolvedValue({ attachments: [attachment] });
      mockTrackingService.markProcessing.mockResolvedValue({});
      mockTrackingService.getTracking.mockResolvedValue({
        status: ProcessingStatus.PROCESSING,
      });
      mockTrackingService.markSuccess.mockResolvedValue({});

      await service['handleMessage'](1, '/tmp/download', 'user@example.com');

      // Should call markSuccess because status was still PROCESSING
      expect(mockTrackingService.markSuccess).toHaveBeenCalledWith(
        '1',
        EmailSource.IMAP,
        'user@example.com',
      );
    });

    it('should handle all attachment failures', async () => {
      const attachment = {
        filename: 'report.xml',
        content: Buffer.from('bad data'),
      };
      mockImapClient.fetchOne.mockResolvedValue({
        source: Buffer.from('raw email'),
        envelope: {},
        bodyStructure: {},
      });
      simpleParser.mockResolvedValue({ attachments: [attachment] });
      mockTrackingService.markProcessing.mockResolvedValue({});
      mockDmarcReportService.unzipReport.mockRejectedValue(
        new Error('Invalid XML'),
      );

      await service['handleMessage'](1, '/tmp/download', 'user@example.com');

      // handleFailure was called (internal failure count incremented)
      // Message is NOT moved/marked as processed since all attachments failed
      expect(mockImapClient.messageFlagsAdd).not.toHaveBeenCalled();
    });

    it('should throw when IMAP client is null', async () => {
      service['imapClient'] = null;
      mockTrackingService.markProcessing.mockResolvedValue({});
      mockTrackingService.markFailed.mockResolvedValue({});

      await service['handleMessage'](1, '/tmp/download', 'user@example.com');

      // Error should be handled by the catch block
    });
  });

  describe('markMessageProcessed', () => {
    let mockImapClient: any;

    beforeEach(() => {
      mockImapClient = {
        messageMove: jest.fn().mockResolvedValue(undefined),
        messageFlagsAdd: jest.fn().mockResolvedValue(undefined),
        mailboxCreate: jest.fn().mockResolvedValue(undefined),
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
      );
    });

    it('should mark as seen when no processed folder is configured', async () => {
      mockConfigService.get.mockImplementation(
        (key: string) => defaultConfigValues[key],
      );

      await service['markMessageProcessed'](42);

      expect(mockImapClient.messageFlagsAdd).toHaveBeenCalledWith('42', [
        '\\Seen',
      ]);
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
        .mockRejectedValueOnce(new Error('Folder not found'))
        .mockResolvedValueOnce(undefined);

      await service['markMessageProcessed'](42);

      expect(mockImapClient.mailboxCreate).toHaveBeenCalledWith('NewFolder');
      expect(mockImapClient.messageMove).toHaveBeenCalledTimes(2);
    });

    it('should fall back to mark as seen when folder creation and move fails', async () => {
      const configWithFolder = {
        ...defaultConfigValues,
        IMAP_PROCESSED_FOLDER: 'BadFolder',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configWithFolder[key],
      );
      mockImapClient.messageMove.mockRejectedValue(new Error('Move failed'));
      mockImapClient.mailboxCreate.mockRejectedValue(
        new Error('Create failed'),
      );

      await service['markMessageProcessed'](42);

      expect(mockImapClient.messageFlagsAdd).toHaveBeenCalledWith('42', [
        '\\Seen',
      ]);
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
        messageMove: jest.fn().mockResolvedValue(undefined),
      };
      service['imapClient'] = mockImapClient;
      service['failureCounts'] = new Map();
      mockConfigService.get.mockImplementation(
        (key: string) => defaultConfigValues[key],
      );
    });

    it('should increment failure count below threshold', async () => {
      await service['handleFailure']('msg1', 'user@example.com', 'Error');

      expect(service['failureCounts'].get('msg1')).toBe(1);
      expect(mockTrackingService.markFailed).not.toHaveBeenCalled();
    });

    it('should mark as permanently failed at threshold', async () => {
      const configThreshold = {
        ...defaultConfigValues,
        IMAP_FAILURE_THRESHOLD: '3',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configThreshold[key],
      );

      // Simulate 2 previous failures
      service['failureCounts'].set('msg1', 2);

      await service['handleFailure']('msg1', 'user@example.com', 'Parse error');

      expect(mockTrackingService.markFailed).toHaveBeenCalledWith(
        'msg1',
        EmailSource.IMAP,
        'user@example.com',
        'Parse error',
      );
      expect(service['failureCounts'].has('msg1')).toBe(false);
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

      await service['handleFailure']('msg1', 'user@example.com', 'Error');

      expect(mockImapClient.messageMove).toHaveBeenCalledWith(
        'msg1',
        'FailedMessages',
      );
    });

    it('should handle failed message move gracefully', async () => {
      const configWithFailedFolder = {
        ...defaultConfigValues,
        IMAP_FAILURE_THRESHOLD: '1',
        IMAP_FAILED_FOLDER: 'FailedMessages',
      };
      mockConfigService.get.mockImplementation(
        (key: string) => configWithFailedFolder[key],
      );
      mockImapClient.messageMove.mockRejectedValue(new Error('Move failed'));

      // Should not throw
      await service['handleFailure']('msg1', 'user@example.com', 'Error');

      expect(mockTrackingService.markFailed).toHaveBeenCalled();
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
        'msg1',
        'user@example.com',
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

      await service['processAttachment'](
        attachment,
        '/tmp/download',
        'msg1',
        'user@example.com',
      );

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
        'msg1',
        'user@example.com',
      );

      expect(result.success).toBe(true);
      expect(result.reportId).toBeUndefined();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should save failed attachment and rethrow on inline error', async () => {
      mockDmarcReportService.unzipReport.mockRejectedValue(
        new Error('Parse error'),
      );
      const fs = require('fs/promises');

      await expect(
        service['processAttachment'](
          attachment,
          '/tmp/download',
          'msg1',
          'user@example.com',
        ),
      ).rejects.toThrow('Parse error');

      // Failed attachment should be saved to failure dir
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });
});
