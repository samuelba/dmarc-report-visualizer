/**
 * Sends the example mails (every report format + mail that must be ignored)
 * to the GreenMail test server.
 *
 *   npm run imap-test:seed                       # to dmarc@test.local
 *   npm run imap-test:seed -- --to me@test.local
 */
import { loadImapTestEnv } from './env';
import {
  buildFixtureMails,
  sendFixtureMails,
  smtpTargetFromEnv,
} from './fixtures';

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  // Explicit shell variables win over the file for manual runs
  loadImapTestEnv({ override: false });

  const to = argValue('--to') ?? process.env.IMAP_USER ?? 'dmarc@test.local';
  const smtp = smtpTargetFromEnv();
  const runId = Date.now().toString(36);
  const mails = buildFixtureMails(runId);

  await sendFixtureMails(smtp, to, mails);

  console.log(
    `Sent ${mails.length} mails to ${to} via ${smtp.host}:${smtp.port}:`,
  );
  for (const mail of mails) {
    console.log(`  [${mail.kind.padEnd(7)}] ${mail.subject}`);
  }
  console.log(
    '\nExpected after a poll: "report" mails imported and moved to DMARC_Processed, ' +
      '"ignored" mails still unread in INBOX, "broken" moved to DMARC_Failed after ' +
      'IMAP_FAILURE_THRESHOLD polls. Check with: npm run imap-test:inspect',
  );
}

main().catch((err: unknown) => {
  console.error(
    `Seeding failed: ${err instanceof Error ? err.message : String(err)}\n` +
      'Is the test stack running? npm run imap-test:up',
  );
  process.exit(1);
});
