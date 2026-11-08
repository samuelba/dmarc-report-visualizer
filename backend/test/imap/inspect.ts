/**
 * Prints every folder of the GreenMail test account with each message's
 * subject and read state.
 *
 *   npm run imap-test:inspect
 *   npm run imap-test:inspect -- --user me@test.local
 */
import { loadImapTestEnv } from './env';
import { imapTargetFromEnv, snapshotMailbox } from './mailbox';

async function main(): Promise<void> {
  loadImapTestEnv({ override: false });

  const target = imapTargetFromEnv();
  const userIndex = process.argv.indexOf('--user');
  if (userIndex >= 0 && process.argv[userIndex + 1]) {
    target.user = process.argv[userIndex + 1];
  }

  const snapshot = await snapshotMailbox(target);
  console.log(`${target.user} @ ${target.host}:${target.port}`);
  for (const [folder, messages] of Object.entries(snapshot.folders)) {
    console.log(
      `\n${folder} (${messages.length} messages, UIDVALIDITY ${snapshot.uidValidity[folder]})`,
    );
    for (const msg of messages) {
      console.log(
        `  uid=${msg.uid} ${msg.seen ? 'read  ' : 'unread'} ${msg.subject}`,
      );
    }
  }
}

main().catch((err: unknown) => {
  console.error(
    `Inspect failed: ${err instanceof Error ? err.message : String(err)}\n` +
      'Is the test stack running? npm run imap-test:up',
  );
  process.exit(1);
});
