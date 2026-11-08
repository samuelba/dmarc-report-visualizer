/**
 * Example mails for testing the IMAP downloader against GreenMail.
 *
 * All reports are synthetic (example.com, derived from test/reports) and get a
 * unique report_id per run, so seeding repeatedly always creates new reports.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as nodemailer from 'nodemailer';

const AdmZip = require('adm-zip');

const BASE_REPORT = path.join(
  __dirname,
  '..',
  'reports',
  'google.com!example.com!1701129600!1701215999.xml',
);
const BASE_REPORT_ID = 'example.com:1701129600';

/** What the downloader is expected to do with a fixture */
export type FixtureKind = 'report' | 'ignored' | 'broken';

export interface FixtureAttachment {
  filename?: string;
  content: Buffer;
  contentType: string;
}

export interface FixtureMail {
  key: string;
  kind: FixtureKind;
  subject: string;
  text: string;
  attachments: FixtureAttachment[];
  /** report_id contained in the mail, for kind === 'report' */
  reportId?: string;
}

export interface SmtpTarget {
  host: string;
  port: number;
}

export function reportIdFor(runId: string, key: string): string {
  return `imap-test-${runId}-${key}`;
}

/** DMARC aggregate report XML with its report_id replaced */
export function buildReportXml(reportId: string): string {
  const xml = fs.readFileSync(BASE_REPORT, 'utf8');
  if (!xml.includes(BASE_REPORT_ID)) {
    throw new Error(
      `Base report ${BASE_REPORT} no longer contains ${BASE_REPORT_ID}`,
    );
  }
  return xml.split(BASE_REPORT_ID).join(reportId);
}

function zipped(entryName: string, xml: string): Buffer {
  const zip = new AdmZip();
  zip.addFile(entryName, Buffer.from(xml, 'utf8'));
  return zip.toBuffer() as Buffer;
}

function reportMail(
  runId: string,
  key: string,
  subject: string,
  attachments: (xml: string, reportId: string) => FixtureAttachment[],
): FixtureMail {
  const reportId = reportIdFor(runId, key);
  const xml = buildReportXml(reportId);
  return {
    key,
    kind: 'report',
    reportId,
    subject: `Report Domain: example.com Submitter: google.com Report-ID: ${reportId} (${subject})`,
    text: 'This is an aggregate report from google.com.',
    attachments: attachments(xml, reportId),
  };
}

/** A single report mail with a gzip attachment (the most common real-world format) */
export function buildGzipReportMail(runId: string, key: string): FixtureMail {
  return reportMail(runId, key, 'gzip', (xml, id) => [
    {
      filename: `google.com!example.com!${id}.xml.gz`,
      content: zlib.gzipSync(xml),
      contentType: 'application/gzip',
    },
  ]);
}

/** The standard set of example mails: every report format plus mail that must be ignored */
export function buildFixtureMails(runId: string): FixtureMail[] {
  const fakePng = Buffer.from('89504e470d0a1a0a', 'hex');
  return [
    reportMail(runId, 'xml', 'plain XML', (xml, id) => [
      {
        filename: `google.com!example.com!${id}.xml`,
        content: Buffer.from(xml),
        contentType: 'application/xml',
      },
    ]),
    buildGzipReportMail(runId, 'gzip'),
    reportMail(runId, 'zip', 'zip', (xml, id) => [
      {
        filename: `google.com!example.com!${id}.zip`,
        content: zipped(`${id}.xml`, xml),
        contentType: 'application/zip',
      },
    ]),
    reportMail(runId, 'unnamed', 'unnamed gzip part', (xml) => [
      { content: zlib.gzipSync(xml), contentType: 'application/gzip' },
    ]),
    reportMail(runId, 'with-logo', 'report next to an image', (xml, id) => [
      { filename: 'logo.png', content: fakePng, contentType: 'image/png' },
      {
        filename: `google.com!example.com!${id}.xml.gz`,
        content: zlib.gzipSync(xml),
        contentType: 'application/gzip',
      },
    ]),
    {
      key: 'plain',
      kind: 'ignored',
      subject: 'Lunch tomorrow?',
      text: 'An ordinary mail without attachments. Must stay unread in the INBOX.',
      attachments: [],
    },
    {
      key: 'invoice',
      kind: 'ignored',
      subject: 'Your invoice',
      text: 'Non-report attachments only. Must stay unread in the INBOX.',
      attachments: [
        {
          filename: 'invoice.pdf',
          content: Buffer.from('%PDF-1.4\n%fake\n'),
          contentType: 'application/pdf',
        },
        { filename: 'photo.png', content: fakePng, contentType: 'image/png' },
      ],
    },
    {
      key: 'broken',
      kind: 'broken',
      subject: `Report Domain: example.com Submitter: broken.example Report-ID: ${reportIdFor(runId, 'broken')}`,
      text: 'Looks like a report, but the attachment is not valid gzip.',
      attachments: [
        {
          filename: 'broken.example!example.com!1!2.xml.gz',
          content: Buffer.from('this is not gzip'),
          contentType: 'application/gzip',
        },
      ],
    },
  ];
}

/** Delivers fixture mails to `to` through GreenMail's SMTP port */
export async function sendFixtureMails(
  smtp: SmtpTarget,
  to: string,
  mails: FixtureMail[],
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: false,
    ignoreTLS: true,
  });
  try {
    for (const mail of mails) {
      await transport.sendMail({
        from: 'noreply-dmarc-support@google.com',
        to,
        subject: mail.subject,
        text: mail.text,
        attachments: mail.attachments.map((a) => ({
          // false = really no name (nodemailer would otherwise generate one)
          filename: a.filename ?? false,
          content: a.content,
          contentType: a.contentType,
          contentDisposition: 'attachment' as const,
        })),
      });
    }
  } finally {
    transport.close();
  }
}

export function smtpTargetFromEnv(): SmtpTarget {
  return {
    host: process.env.IMAP_TEST_SMTP_HOST || 'localhost',
    port: Number(process.env.IMAP_TEST_SMTP_PORT || 13025),
  };
}
