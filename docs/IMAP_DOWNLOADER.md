# IMAP Downloader

The IMAP downloader automatically fetches DMARC report emails from any IMAP-compatible mailbox, extracts attachments (XML, gzip, zip), and processes them into the database.

## Overview

- Connects to any IMAP server that accepts a username and password (self-hosted, Fastmail, mailbox.org, Gmail/Yahoo with an App Password, etc.). Outlook.com and Microsoft 365 are **not** supported, see [below](#outlookcom--microsoft-365)
- Polls the configured mailbox at a configurable interval
- Extracts and processes DMARC report attachments (`.xml`, `.xml.gz`, `.gz`, `.zip`)
- Leaves every other message (no attachment, or only non-report attachments such as PDFs or images) completely untouched, so it is safe to point at a shared inbox
- Tracks processed messages to avoid duplicates via the `email_message_tracking` table
- Moves processed messages to a separate folder or marks them as read
- Automatically retries failed messages up to a configurable threshold

## Quick Start

1. Set up a dedicated email address to receive DMARC reports (e.g., `dmarc@yourdomain.com`)
2. Configure your domain's DMARC DNS record to send reports to that address:
   ```
   _dmarc.yourdomain.com.  IN TXT  "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"
   ```
   > If the report address is on a **different domain** than the one being reported on, most reporters (Google included) only send reports after the receiving domain authorizes it with a TXT record `yourdomain.com._report._dmarc.otherdomain.com "v=DMARC1"` (RFC 7489 §7.1). You cannot add this record for free-mail domains like gmail.com, so use a mailbox on a domain you control.
3. Add the IMAP configuration to your `.env` file:
   ```env
   ENABLE_IMAP_DOWNLOADER=true
   IMAP_HOST=imap.yourdomain.com
   IMAP_PORT=993
   IMAP_USER=dmarc@yourdomain.com
   IMAP_PASSWORD=your-password
   ```
4. Restart the application

## Environment Variables

### Required (when IMAP is enabled)

| Variable | Description | Example |
|---|---|---|
| `ENABLE_IMAP_DOWNLOADER` | Enable the IMAP downloader | `true` |
| `IMAP_HOST` | IMAP server hostname | `imap.gmail.com` |
| `IMAP_USER` | IMAP login username (usually the email address) | `dmarc@yourdomain.com` |
| `IMAP_PASSWORD` | IMAP login password or app-specific password | `your-app-password` |

### Optional

| Variable | Default | Description |
|---|---|---|
| `IMAP_PORT` | `993` | IMAP server port |
| `IMAP_TLS` | `true` | Enable TLS/SSL encryption |
| `IMAP_TLS_REJECT_UNAUTHORIZED` | `true` | Reject invalid TLS certificates (recommended). Avoid setting to `false` in production; for self-signed or internal certificates, configure a trusted CA or update the trust store instead of disabling verification. |
| `IMAP_MAILBOX` | `INBOX` | Mailbox/folder to monitor |
| `IMAP_SEARCH_CRITERIA` | `UNSEEN` | Search filter, see [Search Criteria](#search-criteria) |
| `IMAP_PROCESSED_FOLDER` | *(empty)* | Folder to move processed messages to. If empty, messages are marked as read |
| `IMAP_FAILED_FOLDER` | *(empty)* | Folder to move permanently failed messages to |
| `IMAP_POLL_INTERVAL_MS` | `300000` | Polling interval in milliseconds (default: 5 minutes) |
| `IMAP_PROCESS_INLINE` | `true` | Process attachments immediately (`true`) or save to `FILE_WATCH_DIR` for the file watcher (`false`) |
| `IMAP_SAVE_ORIGINAL` | `false` | Save original attachment files to `reports/processed/success/` after inline processing |
| `IMAP_FAILURE_THRESHOLD` | `3` | Number of failed attempts before marking a message as permanently failed |

## Provider-Specific Setup

### Gmail

Gmail requires an **App Password** since it doesn't allow direct password login:

1. Enable 2-Step Verification on your Google account
2. Go to [App Passwords](https://myaccount.google.com/apppasswords)
3. Generate a new app password for "Mail"
4. Use the generated 16-character password

```env
ENABLE_IMAP_DOWNLOADER=true
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=dmarc@gmail.com
IMAP_PASSWORD=your-16-char-app-password
IMAP_TLS=true
IMAP_MAILBOX=INBOX
```

> **Note:** For Gmail, you may prefer the dedicated Gmail API downloader (`ENABLE_GMAIL_DOWNLOADER`) which uses OAuth2 and has richer label management.

### Outlook.com / Microsoft 365

**Not supported by the IMAP downloader.** Microsoft has disabled password (Basic) authentication for IMAP on both Outlook.com personal accounts and Microsoft 365; logins fail with `535 5.7.139 Authentication unsuccessful, basic authentication is disabled`, and App Passwords do not work for IMAP either. Access requires OAuth2, which this downloader does not implement. Use a mailbox with another provider, or forward the reports to one.

### Yahoo Mail

```env
ENABLE_IMAP_DOWNLOADER=true
IMAP_HOST=imap.mail.yahoo.com
IMAP_PORT=993
IMAP_USER=dmarc@yahoo.com
IMAP_PASSWORD=your-app-password
IMAP_TLS=true
```

### Self-Hosted (e.g., Dovecot, Courier)

```env
ENABLE_IMAP_DOWNLOADER=true
IMAP_HOST=mail.yourdomain.com
IMAP_PORT=993
IMAP_USER=dmarc@yourdomain.com
IMAP_PASSWORD=your-password
IMAP_TLS=true
# Require valid certificates; for self-signed or private CAs, add them to your trust store instead of disabling verification
IMAP_TLS_REJECT_UNAUTHORIZED=true
```

## How It Works

### Processing Flow

```
1. Connect to IMAP server
2. Open configured mailbox (IMAP_MAILBOX)
3. Search for messages matching IMAP_SEARCH_CRITERIA
4. For each message:
   a. Check tracking table — skip if already processed
   b. Mark as "processing" in tracking table
   c. Fetch and parse the email
   d. Pick the report attachments (.xml, .gz, .zip, or unnamed parts with a
      gzip/zip/xml MIME type). If there are none, record the message as
      "skipped" and leave it untouched (no flags, no move)
   e. For each report attachment:
      - Decompress if needed (gzip/zip)
      - Parse DMARC XML report
      - Save report to database
   f. Mark message as processed (move to folder or mark read)
   g. Update tracking table to "success"
5. Wait for next poll interval
```

### Processing Modes

#### Inline Processing (default, `IMAP_PROCESS_INLINE=true`)

Attachments are parsed and saved directly to the database. This is the recommended mode.

- Faster — no intermediate file I/O
- Reports are available immediately
- Failed attachments are saved to `reports/processed/failure/` for inspection

#### File Watcher Mode (`IMAP_PROCESS_INLINE=false`)

Attachments are saved to `FILE_WATCH_DIR` for the file watcher service to process. Useful if you want all report ingestion to go through a single pipeline.

- Requires `ENABLE_FILE_WATCHER=true`
- Attachments are saved as files before processing

### Message Tracking

The IMAP downloader uses the `email_message_tracking` database table to track which messages have been processed. This prevents duplicate processing across restarts and provides visibility into processing status.

Each tracking record stores:
- **Message ID** — `<mailbox>:<UIDVALIDITY>:<UID>`, e.g. `INBOX:1794165345:42`. IMAP UIDs are only unique within one mailbox and UIDVALIDITY, so changing `IMAP_MAILBOX` or a server-side UIDVALIDITY reset never causes new reports to be mistaken for old ones
- **Source** — `imap`
- **Account** — the IMAP user email
- **Status** — `pending`, `processing`, `success`, `failed`, or `skipped` (no report attachment)
- **Attempt count** — number of processing attempts
- **Error message** — last error (for failed messages)
- **Report ID** — link to the saved DMARC report (for successful inline processing)

`success` and `skipped` records older than 90 days are deleted daily at 03:00.

### Failure Handling

1. If processing an attachment fails, it's retried on the next poll cycle
2. After `IMAP_FAILURE_THRESHOLD` consecutive failures (default: 3), the message is marked as permanently failed
3. If `IMAP_FAILED_FOLDER` is configured, permanently failed messages are moved there
4. Failed attachments (in inline mode) are saved to `reports/processed/failure/` for manual inspection

### Connection Recovery

Every poll opens a fresh IMAP connection and logs out at the end, so no idle connection is kept open between polls:
- A failed connection only affects that poll; the next poll starts over
- Connection errors are logged but don't crash the application

## Docker Configuration

IMAP environment variables are automatically passed through in `docker-compose.yml`. Just add them to your `.env` file and they'll be available to the container.

Example `.env` additions for Docker:

```env
ENABLE_IMAP_DOWNLOADER=true
IMAP_HOST=imap.yourdomain.com
IMAP_PORT=993
IMAP_USER=dmarc@yourdomain.com
IMAP_PASSWORD=your-password
IMAP_PROCESSED_FOLDER=DMARC_Processed
```

## Search Criteria

The `IMAP_SEARCH_CRITERIA` variable controls which messages are fetched:

| Value | Behavior |
|---|---|
| `UNSEEN` (default) | Only fetch unread messages |
| `ALL` | Fetch all messages (relies on tracking table for deduplication) |
| `SUBJECT "Report Domain"` | Fetch messages whose subject contains the quoted text |
| `SUBJECT DMARC` | Unquoted subjects match a single word |
| `UNSEEN SUBJECT "Report Domain"` | Tokens can be combined (case-insensitive, any order) |

Unrecognized values fall back to `UNSEEN` with a warning in the log.

> **Tip:** Using `UNSEEN` (default) is recommended for most setups. Combined with the tracking table, it ensures efficient polling without reprocessing old messages. Without `UNSEEN`, set `IMAP_PROCESSED_FOLDER` so handled reports leave the searched mailbox; otherwise every poll re-scans all matching messages (the service warns about this at startup).

## Troubleshooting

### Common Issues

**Connection refused / timeout**
- Verify `IMAP_HOST` and `IMAP_PORT` are correct
- Check firewall rules allow outbound connections on port 993 (or your configured port)
- If running in Docker, ensure DNS resolution works inside the container

**Authentication failed**
- Verify `IMAP_USER` and `IMAP_PASSWORD`
- For Gmail/Yahoo, you need an App Password (not your regular password)
- Outlook.com / Microsoft 365 reject password logins entirely (`basic authentication is disabled`), see [above](#outlookcom--microsoft-365)
- Check if IMAP access is enabled on the mail provider

**TLS certificate errors**
- For self-signed certificates, set `IMAP_TLS_REJECT_UNAUTHORIZED=false`
- Ensure the server certificate is valid and not expired

**Messages not being found**
- Check `IMAP_MAILBOX` — some providers use different folder names
- Check `IMAP_SEARCH_CRITERIA` — `UNSEEN` won't find already-read messages
- Verify DMARC reports are actually arriving in the mailbox

**Duplicate processing**
- The tracking table prevents duplicates. If you see duplicates, check the `email_message_tracking` table
- Ensure `IMAP_PROCESSED_FOLDER` or mark-as-read is working correctly

### Logs

The IMAP downloader logs with the `ImapDownloaderService` logger prefix. Key log messages:

- `IMAP downloader disabled` — Service won't start (check `ENABLE_IMAP_DOWNLOADER`)
- `IMAP downloader configured for user on host:port` — Successful initialization
- `Found N messages in INBOX` — Poll cycle completed, found N messages to process
- `Processed attachment filename from UID X` — Successful attachment processing
- `Message UID X has no DMARC report attachment, leaving it untouched` — Non-report mail, ignored (debug level)
- `Message X failed N times (threshold: T), marking as permanently failed` — Exceeded retry threshold

### Checking Tracking Status

You can query the tracking table directly to see processing status:

```sql
-- See all tracked IMAP messages
SELECT "messageId", status, "attemptCount", "errorMessage", "processedAt"
FROM email_message_tracking
WHERE source = 'imap'
ORDER BY "firstSeenAt" DESC;

-- See failed messages
SELECT "messageId", "attemptCount", "errorMessage", "lastAttemptAt"
FROM email_message_tracking
WHERE source = 'imap' AND status = 'failed';
```

## Testing Locally with GreenMail

[GreenMail](https://greenmail-mail-test.github.io/greenmail/) is a throwaway SMTP + IMAP server, handy for trying the downloader without a real mailbox:

```bash
docker run --rm -p 3025:3025 -p 3143:3143 \
  -e GREENMAIL_OPTS="-Dgreenmail.setup.test.all -Dgreenmail.hostname=0.0.0.0 -Dgreenmail.users=dmarc:secret@test.local -Dgreenmail.users.login=email" \
  greenmail/standalone:2.1.3
```

```env
ENABLE_IMAP_DOWNLOADER=true
IMAP_HOST=localhost
IMAP_PORT=3143
IMAP_TLS=false
IMAP_USER=dmarc@test.local
IMAP_PASSWORD=secret
IMAP_PROCESSED_FOLDER=DMARC_Processed
IMAP_FAILED_FOLDER=DMARC_Failed
IMAP_POLL_INTERVAL_MS=10000
```

Then send mail with a report attached to `dmarc@test.local` via SMTP on `localhost:3025` (e.g. with `swaks --to dmarc@test.local --server localhost:3025 --attach @report.xml.gz` or a small nodemailer script). Add a few ordinary mails as well to confirm they stay unread in the INBOX.

## IMAP vs Gmail Downloader

| Feature | IMAP Downloader | Gmail Downloader |
|---|---|---|
| Authentication | Username/password (App Password) | OAuth2 / Service Account |
| Provider support | Any IMAP server | Gmail only |
| Message management | Move to folder or mark as read | Gmail labels |
| Tracking | Database table | Gmail labels |
| Setup complexity | Low | Medium (OAuth setup) |
| Best for | Generic IMAP providers, self-hosted | Gmail with advanced label workflows |

Both can be enabled simultaneously for different email accounts if needed, but avoid configuring both against the same mailbox to prevent conflicts.
