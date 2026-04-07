# IMAP Downloader

The IMAP downloader automatically fetches DMARC report emails from any IMAP-compatible mailbox, extracts attachments (XML, gzip, zip), and processes them into the database.

## Overview

- Connects to any standard IMAP server (Gmail, Outlook, Yahoo, self-hosted, etc.)
- Polls the configured mailbox at a configurable interval
- Extracts and processes DMARC report attachments (`.xml`, `.xml.gz`, `.gz`, `.zip`)
- Tracks processed messages to avoid duplicates via the `email_message_tracking` table
- Moves processed messages to a separate folder or marks them as read
- Automatically retries failed messages up to a configurable threshold

## Quick Start

1. Set up a dedicated email address to receive DMARC reports (e.g., `dmarc@yourdomain.com`)
2. Configure your domain's DMARC DNS record to send reports to that address:
   ```
   _dmarc.yourdomain.com.  IN TXT  "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"
   ```
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
| `IMAP_SEARCH_CRITERIA` | `UNSEEN` | Search filter: `UNSEEN`, `ALL`, or `SUBJECT "pattern"` |
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

### Outlook / Microsoft 365

```env
ENABLE_IMAP_DOWNLOADER=true
IMAP_HOST=outlook.office365.com
IMAP_PORT=993
IMAP_USER=dmarc@yourdomain.com
IMAP_PASSWORD=your-password
IMAP_TLS=true
```

> **Note:** Microsoft may require enabling IMAP access in the admin portal and may require an App Password if MFA is enabled.

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
   d. Extract attachments (.xml, .gz, .zip)
   e. For each attachment:
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
- **Message UID** — the IMAP message identifier
- **Source** — `imap`
- **Account** — the IMAP user email
- **Status** — `pending`, `processing`, `success`, or `failed`
- **Attempt count** — number of processing attempts
- **Error message** — last error (for failed messages)
- **Report ID** — link to the saved DMARC report (for successful inline processing)

### Failure Handling

1. If processing an attachment fails, it's retried on the next poll cycle
2. After `IMAP_FAILURE_THRESHOLD` consecutive failures (default: 3), the message is marked as permanently failed
3. If `IMAP_FAILED_FOLDER` is configured, permanently failed messages are moved there
4. Failed attachments (in inline mode) are saved to `reports/processed/failure/` for manual inspection

### Connection Recovery

The service automatically handles IMAP connection issues:
- If the connection drops between polls, it reconnects on the next cycle
- If reconnection fails, the IMAP client is recreated from scratch
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
| `SUBJECT "DMARC"` | Fetch messages with "DMARC" in the subject line |

> **Tip:** Using `UNSEEN` (default) is recommended for most setups. Combined with the tracking table, it ensures efficient polling without reprocessing old messages.

## Troubleshooting

### Common Issues

**Connection refused / timeout**
- Verify `IMAP_HOST` and `IMAP_PORT` are correct
- Check firewall rules allow outbound connections on port 993 (or your configured port)
- If running in Docker, ensure DNS resolution works inside the container

**Authentication failed**
- Verify `IMAP_USER` and `IMAP_PASSWORD`
- For Gmail/Yahoo/Outlook, you likely need an App Password (not your regular password)
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
- `IMAP client configured for user@host:port` — Successful initialization
- `Found N messages in INBOX` — Poll cycle completed, found N messages to process
- `Processed attachment filename from UID X` — Successful attachment processing
- `Message X failed N times (threshold: T), marking as permanently failed` — Exceeded retry threshold

### Checking Tracking Status

You can query the tracking table directly to see processing status:

```sql
-- See all tracked IMAP messages
SELECT messageId, status, attemptCount, errorMessage, processedAt
FROM email_message_tracking
WHERE source = 'imap'
ORDER BY firstSeenAt DESC;

-- See failed messages
SELECT messageId, attemptCount, errorMessage, lastAttemptAt
FROM email_message_tracking
WHERE source = 'imap' AND status = 'failed';
```

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
