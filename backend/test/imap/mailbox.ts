import { ImapFlow } from 'imapflow';

export interface ImapTarget {
  host: string;
  port: number;
  user: string;
  password: string;
}

export interface MailboxMessage {
  uid: number;
  subject: string;
  seen: boolean;
}

export interface MailboxSnapshot {
  /** UIDVALIDITY per folder */
  uidValidity: Record<string, string>;
  /** Messages per folder, in UID order */
  folders: Record<string, MailboxMessage[]>;
}

export function imapTargetFromEnv(): ImapTarget {
  return {
    host: process.env.IMAP_HOST || 'localhost',
    port: Number(process.env.IMAP_PORT || 13143),
    user: process.env.IMAP_USER || 'dmarc@test.local',
    password: process.env.IMAP_PASSWORD || 'secret',
  };
}

/** Reads every folder of the account with the subject and \Seen flag of each message */
export async function snapshotMailbox(
  target: ImapTarget,
): Promise<MailboxSnapshot> {
  const client = new ImapFlow({
    host: target.host,
    port: target.port,
    secure: false,
    auth: { user: target.user, pass: target.password },
    logger: false,
  });
  const snapshot: MailboxSnapshot = { uidValidity: {}, folders: {} };

  await client.connect();
  try {
    for (const box of await client.list()) {
      const lock = await client.getMailboxLock(box.path);
      try {
        const mailbox = client.mailbox;
        snapshot.uidValidity[box.path] = mailbox
          ? String(mailbox.uidValidity)
          : '';
        const messages: MailboxMessage[] = [];
        if (mailbox && mailbox.exists > 0) {
          for await (const msg of client.fetch('1:*', {
            envelope: true,
            flags: true,
            uid: true,
          })) {
            messages.push({
              uid: msg.uid,
              subject: msg.envelope?.subject ?? '',
              seen: msg.flags?.has('\\Seen') ?? false,
            });
          }
        }
        snapshot.folders[box.path] = messages.sort((a, b) => a.uid - b.uid);
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout();
  }

  return snapshot;
}
