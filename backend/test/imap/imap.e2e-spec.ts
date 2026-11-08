/**
 * End-to-end test of the IMAP downloader against a real IMAP server.
 *
 * Boots the full AppModule (fresh database, all migrations) and polls a
 * GreenMail mailbox seeded with every report format plus mail that must be
 * ignored, then checks the database, the mailbox and the failure directory.
 *
 * Needs the test stack:  npm run imap-test:up && npm run test:e2e:imap
 * Environment: test/imap/imap-test.env + test/imap/setup-env.ts
 *
 * The app is loaded from dist/ (test:e2e:imap builds first): the TypeORM config
 * loads entities and migrations from dist/, so the compiled classes must be
 * the ones in use, exactly as in production.
 */
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import type { ImapDownloaderService } from '../../src/modules/dmarc/services/imap-downloader.service';
import {
  buildFixtureMails,
  buildGzipReportMail,
  FixtureMail,
  sendFixtureMails,
  smtpTargetFromEnv,
} from './fixtures';
import { imapTargetFromEnv, MailboxSnapshot, snapshotMailbox } from './mailbox';

const RUN_ID = process.env.IMAP_TEST_RUN_ID as string;
const PROCESSED = process.env.IMAP_PROCESSED_FOLDER as string;
const FAILED = process.env.IMAP_FAILED_FOLDER as string;
const THRESHOLD = Number(process.env.IMAP_FAILURE_THRESHOLD);
const FAILURE_DIR = path.resolve(process.cwd(), 'reports/processed/failure');
const DIST = path.resolve(__dirname, '../../dist/src');

function loadBuiltApp(): {
  AppModule: unknown;
  ImapDownloaderService: new (...args: never[]) => ImapDownloaderService;
} {
  if (!fs.existsSync(path.join(DIST, 'app.module.js'))) {
    throw new Error(
      'dist/ not found. Run `npm run build` (test:e2e:imap does this).',
    );
  }
  return {
    AppModule: require(path.join(DIST, 'app.module')).AppModule,
    ImapDownloaderService: require(
      path.join(DIST, 'modules/dmarc/services/imap-downloader.service'),
    ).ImapDownloaderService,
  };
}

interface TrackingRow {
  messageId: string;
  status: string;
  attemptCount: number;
}

async function waitForPort(
  host: string,
  port: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host, port }, () => {
        socket.end();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
      socket.setTimeout(2000, () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (open) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `${label} is not reachable on ${host}:${port}. ` +
          'Start the test stack first: cd backend && npm run imap-test:up',
      );
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** Drops and recreates the e2e database so every run starts from zero */
async function recreateDatabase(): Promise<void> {
  const name = process.env.DATABASE_NAME as string;
  const client = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: 'postgres',
  });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}

describe('IMAP downloader (e2e, GreenMail)', () => {
  const imap = imapTargetFromEnv();
  const mails = buildFixtureMails(RUN_ID);
  const reports = mails.filter((m) => m.kind === 'report');
  const ignored = mails.filter((m) => m.kind === 'ignored');
  const broken = mails.filter((m) => m.kind === 'broken');

  let app: INestApplication;
  let dataSource: DataSource;
  let downloader: ImapDownloaderService;
  let inboxUidValidity: string;
  const uidByKey = new Map<string, number>();

  const poll = (): Promise<void> => downloader['pollOnce']();

  const importedReportIds = async (): Promise<string[]> => {
    const rows: { reportId: string }[] = await dataSource.query(
      `SELECT "reportId" FROM dmarc_reports WHERE "reportId" LIKE $1 ORDER BY "reportId"`,
      [`imap-test-${RUN_ID}-%`],
    );
    return rows.map((r) => r.reportId);
  };

  const tracking = async (): Promise<Map<string, TrackingRow>> => {
    const rows: TrackingRow[] = await dataSource.query(
      `SELECT "messageId", status, "attemptCount" FROM email_message_tracking
       WHERE source = 'imap' AND "accountIdentifier" = $1`,
      [imap.user],
    );
    return new Map(rows.map((r) => [r.messageId, r]));
  };

  const trackingFor = async (
    mail: FixtureMail,
  ): Promise<TrackingRow | undefined> =>
    (await tracking()).get(
      `INBOX:${inboxUidValidity}:${uidByKey.get(mail.key)}`,
    );

  const subjects = (snapshot: MailboxSnapshot, folder: string): string[] =>
    (snapshot.folders[folder] ?? []).map((m) => m.subject);

  const failureFiles = (): string[] =>
    fs.existsSync(FAILURE_DIR)
      ? fs
          .readdirSync(FAILURE_DIR)
          .filter((f) => f.startsWith(`INBOX_${inboxUidValidity}_`))
      : [];

  beforeAll(async () => {
    const smtp = smtpTargetFromEnv();
    await waitForPort(smtp.host, smtp.port, 'GreenMail SMTP');
    await waitForPort(imap.host, imap.port, 'GreenMail IMAP');
    await waitForPort(
      process.env.DATABASE_HOST as string,
      Number(process.env.DATABASE_PORT),
      'Postgres',
    );
    await recreateDatabase();

    await sendFixtureMails(smtp, imap.user, mails);
    const seeded = await snapshotMailbox(imap);
    inboxUidValidity = seeded.uidValidity.INBOX;
    for (const msg of seeded.folders.INBOX) {
      const mail = mails.find((m) => m.subject === msg.subject);
      if (mail) {
        uidByKey.set(mail.key, msg.uid);
      }
    }
    expect(uidByKey.size).toBe(mails.length);

    const built = loadBuiltApp();
    const moduleRef = await Test.createTestingModule({
      imports: [built.AppModule as never],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init(); // runs all migrations on the empty database

    dataSource = app.get(DataSource);
    downloader = app.get(built.ImapDownloaderService);
  });

  afterAll(async () => {
    for (const file of inboxUidValidity ? failureFiles() : []) {
      fs.rmSync(path.join(FAILURE_DIR, file), { force: true });
    }
    await app?.close();
  });

  describe('first poll', () => {
    beforeAll(() => poll());

    it('imports every report format (xml, gzip, zip, unnamed part, next to an image)', async () => {
      expect(await importedReportIds()).toEqual(
        reports.map((m) => m.reportId).sort(),
      );
    });

    it('imports the records of each report', async () => {
      const [{ count }]: { count: string }[] = await dataSource.query(
        `SELECT count(*) FROM dmarc_records r
         JOIN dmarc_reports rep ON rep.id = r."reportId"
         WHERE rep."reportId" LIKE $1`,
        [`imap-test-${RUN_ID}-%`],
      );
      expect(Number(count)).toBeGreaterThanOrEqual(reports.length);
    });

    it('moves processed reports to the processed folder', async () => {
      const snapshot = await snapshotMailbox(imap);
      expect(subjects(snapshot, PROCESSED).sort()).toEqual(
        reports.map((m) => m.subject).sort(),
      );
    });

    it('leaves non-report mail unread in the INBOX', async () => {
      const snapshot = await snapshotMailbox(imap);
      for (const mail of ignored) {
        const msg = snapshot.folders.INBOX.find(
          (m) => m.subject === mail.subject,
        );
        expect(msg).toEqual(expect.objectContaining({ seen: false }));
      }
    });

    it('tracks each message by mailbox, UIDVALIDITY and UID', async () => {
      for (const mail of reports) {
        expect(await trackingFor(mail)).toEqual(
          expect.objectContaining({ status: 'success', attemptCount: 1 }),
        );
      }
      for (const mail of ignored) {
        expect(await trackingFor(mail)).toEqual(
          expect.objectContaining({ status: 'skipped' }),
        );
      }
      expect(await trackingFor(broken[0])).toEqual(
        expect.objectContaining({ status: 'failed', attemptCount: 1 }),
      );
    });

    it('keeps the broken report in the INBOX for a retry', async () => {
      const snapshot = await snapshotMailbox(imap);
      expect(subjects(snapshot, 'INBOX')).toContain(broken[0].subject);
    });
  });

  describe('until the failure threshold is reached', () => {
    beforeAll(async () => {
      for (let attempt = 2; attempt <= THRESHOLD; attempt++) {
        await poll();
      }
    });

    it('moves the broken report to the failed folder', async () => {
      const snapshot = await snapshotMailbox(imap);
      expect(subjects(snapshot, FAILED)).toEqual([broken[0].subject]);
      expect(subjects(snapshot, 'INBOX').sort()).toEqual(
        ignored.map((m) => m.subject).sort(),
      );
    });

    it('records the permanent failure', async () => {
      expect(await trackingFor(broken[0])).toEqual(
        expect.objectContaining({ status: 'failed', attemptCount: THRESHOLD }),
      );
    });

    it('keeps a single copy of the broken attachment', () => {
      expect(failureFiles()).toEqual([
        `INBOX_${inboxUidValidity}_${uidByKey.get(broken[0].key)}-broken.example!example.com!1!2.xml.gz`,
      ]);
    });
  });

  describe('later polls', () => {
    it('do not import anything twice or touch ignored mail', async () => {
      const before = await importedReportIds();

      await poll();

      expect(await importedReportIds()).toEqual(before);
      const snapshot = await snapshotMailbox(imap);
      expect(snapshot.folders.INBOX.every((m) => !m.seen)).toBe(true);
    });

    it('pick up a report that arrives after the first polls', async () => {
      const late = buildGzipReportMail(RUN_ID, 'late');
      await sendFixtureMails(smtpTargetFromEnv(), imap.user, [late]);

      await poll();

      expect(await importedReportIds()).toContain(late.reportId);
      const snapshot = await snapshotMailbox(imap);
      expect(subjects(snapshot, PROCESSED)).toContain(late.subject);
    });
  });
});
