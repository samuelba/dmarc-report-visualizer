/**
 * Prints the sender-authentication verdict for saved report emails, to check
 * a deployment's relay path before enabling REPORT_SENDER_AUTH=enforce.
 *
 * Usage:
 *   npx ts-node --transpile-only src/scripts/check-sender-auth.ts \
 *     <file.eml>... --sealers google.com --relay example.com,example.org
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { simpleParser } from 'mailparser';
import {
  authenticateMessage,
  evaluateSender,
  orgDomain,
} from '../modules/dmarc/utils/sender-authentication';

const AdmZip = require('adm-zip');

interface Args {
  files: string[];
  sealers: Set<string>;
  relays: Set<string>;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { files: [], sealers: new Set(), relays: new Set() };
  const list = (value: string | undefined) =>
    (value ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sealers') {
      list(argv[++i]).forEach((d) => args.sealers.add(d));
    } else if (argv[i] === '--relay') {
      list(argv[++i]).forEach((d) => args.relays.add(orgDomain(d) ?? d));
    } else {
      args.files.push(argv[i]);
    }
  }
  return args;
}

function attachmentXml(filename: string, content: Buffer): string | null {
  const name = filename.toLowerCase();
  if (name.endsWith('.gz')) {
    return zlib.gunzipSync(content).toString('utf8');
  }
  if (name.endsWith('.zip')) {
    const entry = new AdmZip(content).getEntries()[0];
    return entry ? entry.getData().toString('utf8') : null;
  }
  return name.endsWith('.xml') ? content.toString('utf8') : null;
}

async function check(file: string, args: Args): Promise<void> {
  const raw = await fs.readFile(file);
  const mail = await simpleParser(raw);
  const auth = await authenticateMessage(raw, args.sealers);

  console.log(`\n${path.basename(file)}`);
  console.log(
    `  DKIM:  ${auth.dkim.map((d) => `${d.domain}=${d.result}`).join(', ') || 'none'}`,
  );
  console.log(`  ARC:   ${auth.arc.result}`);
  for (const instance of auth.arc.instances) {
    const dkim = instance.dkim
      .map((d) => `dkim=${d.result}:${d.domain}`)
      .join(' ');
    const dmarc = instance.dmarc
      ? `dmarc=${instance.dmarc.result}:${instance.dmarc.from ?? '?'}`
      : '';
    console.log(
      `    i=${instance.i} sealer=${instance.sealer}${instance.trusted ? ' (trusted)' : ''} ${dkim} ${dmarc}`,
    );
  }

  for (const attachment of mail.attachments ?? []) {
    const xml = attachmentXml(attachment.filename ?? '', attachment.content);
    if (!xml) {
      continue;
    }
    const email = /<email>\s*([^<\s]+)\s*<\/email>/i.exec(xml)?.[1];
    const reportDomain =
      /<policy_published>[\s\S]*?<domain>\s*([^<\s]+)\s*<\/domain>/i.exec(
        xml,
      )?.[1];
    const reportOrg = orgDomain(reportDomain);
    const verdict = evaluateSender(auth, email, {
      excludedOrgDomains: new Set([
        ...args.relays,
        ...(reportOrg ? [reportOrg] : []),
      ]),
    });
    const via = verdict.authMethod ? ` via ${verdict.authMethod}` : '';
    const sender = verdict.authDomain ? ` (${verdict.authDomain})` : '';
    const temp = verdict.tempError ? ' [temporary DNS error]' : '';
    console.log(
      `  Report <email>=${email ?? '?'} → ${verdict.authStatus}${via}${sender}${temp}`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.files.length === 0) {
    console.error(
      'Usage: check-sender-auth.ts <file.eml>... [--sealers d1,d2] [--relay d1,d2]',
    );
    process.exit(2);
  }
  for (const file of args.files) {
    await check(file, args);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
