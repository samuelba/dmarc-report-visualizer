# Report Sender Authentication

Anyone can send mail to the reporting address in your `rua=` DNS record, and everything inside a report (organization, `<email>`, report ID) is chosen by the sender. The backend therefore checks who actually sent each emailed report and uses that verdict to decide which copy of a report wins.

## What is checked

For reports fetched by the IMAP or Gmail downloader, the backend verifies the email itself:

1. **DKIM.** A valid DKIM signature proves that its `d=` domain sent the message, for example `d=google.com`.
2. **ARC.** Mailing lists and forwarders (Google Groups, for example) often rewrite `From:`, which breaks the reporter's DKIM signature. Before changing the message, such a relay records what it verified in a signed `ARC-Authentication-Results` header. The backend checks every ARC seal cryptographically, then believes the recorded results only from sealers listed in `REPORT_TRUSTED_ARC_SEALERS`. Walking from the newest set to the oldest, it stops at the first sealer that is not trusted. From those records it accepts `dkim=pass` domains, and `dmarc=pass` From domains, which also covers reporters that only pass SPF.
3. **Relay domains never count.** Your relay signs every message it passes on with its own domain. Identities from managed domains (Settings → Domains) and from `REPORT_RELAY_DOMAINS` are therefore ignored. Otherwise a forged report claiming `<email>dmarc@your-domain</email>` would be "verified" by your own relay's signature.

SPF is not used. The SMTP client IP is lost once the message is in a mailbox.

The verdict compares the organizational domain of each authenticated identity with the domain of the report's `<email>`:

| Status | Meaning | Rank |
|--------|---------|------|
| `aligned` | An authenticated domain matches the report's `<email>` domain | 3 |
| `unaligned` | The email is authenticated, but by another domain. The report shows "sent by `<domain>`" | 2 |
| `manual` | Uploaded by an administrator, or loaded through `process-directory` | 2 |
| `unverified` | No usable evidence, including everything from the file watcher | 1 |
| `legacy` | Stored before this feature existed | 1 |

## When a report already exists

Reports are matched on report ID, organization and `<email>`:

- An identical copy is ignored (`duplicate`).
- A copy with a **strictly higher rank** replaces the stored report (`replaced`). An aligned report from the real reporter can therefore displace an earlier forged or unverified copy.
- Any other copy is rejected and the stored report is kept (`conflict`). The rejected XML is kept for review, up to 10 copies per report.

Every received copy is recorded in `dmarc_report_deliveries` together with its verdict and evidence.

## Settings

| Variable | Default | Purpose |
|----------|---------|---------|
| `REPORT_SENDER_AUTH` | `flag` | `off`: no checks, email reports are `unverified`. `flag`: store every report with its verdict. `enforce`: reject email reports that are `unverified`. |
| `REPORT_TRUSTED_ARC_SEALERS` | empty | Comma-separated ARC-Seal `d=` domains to believe, e.g. `google.com` |
| `REPORT_RELAY_DOMAINS` | empty | Extra relay domains to ignore as reporters. Managed domains are always ignored. |

### Example: Google Groups or Google Workspace

If reports arrive at a Google Group and are forwarded to the mailbox the downloader reads:

```
REPORT_TRUSTED_ARC_SEALERS=google.com
```

Trusting `google.com` means believing what Google recorded when it received each message. Messages that Google itself signs as `google.com` (Calendar notifications, for example) could then vouch for a report claiming to be from Google. That requires a Google service that sends an attachment of the attacker's choice, which we consider acceptable. Leave the setting empty if you do not use a Google relay.

## Enforce mode

With `REPORT_SENDER_AUTH=enforce`:

- An `unverified` report fails permanently on the first attempt. The message goes to `IMAP_FAILED_FOLDER` / `GMAIL_FAILED_LABEL` and the attachment to `reports/processed/failure/`.
- If verification failed because of a DNS error, the message is retried on the next poll like any other transient failure.
- `unaligned` reports are accepted and flagged.
- The downloaders' legacy mode (`IMAP_PROCESS_INLINE=false` / `GMAIL_PROCESS_INLINE=false`) hands attachments to the file watcher without their email, so they are stored as `unverified`. A startup warning says so.

Before switching to `enforce`, check real reports from your mailbox (save them as `.eml`, e.g. Gmail → "Download message"):

```
cd backend
npx ts-node --transpile-only src/scripts/check-sender-auth.ts path/to/*.eml \
  --sealers google.com --relay your-domain.com
```

The script prints the DKIM results, the ARC chain and the verdict for each attached report. `--relay` stands in for the managed domains, which the script cannot read from the database.

## Limits

- Verification happens once, at ingest. DKIM and ARC keys are rotated, so reports are never re-verified later, and reports stored before this feature remain `legacy`.
- Trust is per organization domain. A reporter whose `<email>` uses a different domain than the one it signs with (Yahoo: `dmarchelp@yahooinc.com`, signed by `yahoo.com`, From `dmarc.yahoo.com`) is `unaligned` until an administrator trusts it (see below).

## Trusting an unaligned reporter

**Settings → Report Senders** lists unaligned reports grouped by claimed domain and exact sending domain, for example `yahooinc.com ← dmarc.yahoo.com · Yahoo · 100 reports`. **Trust** stores the pair and marks those reports `aligned` at once; later reports from the pair are `aligned` on arrival. **Revoke** reverses both. Who trusted a pair, and when, is listed next to it.

A pair names the exact sending domain, not its organization. Trusting `dmarc.yahoo.com` does not extend to ordinary `yahoo.com` mailboxes, whose mail is also signed by `yahoo.com`. The confirmation dialog warns when the sending domain is a free-mail domain, because trusting it would let any of its users send reports in the claimed domain's name.

Trusting a pair upgrades stored reports only. A copy that was rejected earlier as a `conflict` stays in the delivery history and is not restored.
