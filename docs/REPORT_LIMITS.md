# Report Size Limits

DMARC reports reach the backend from sources you do not control: anyone can send mail to the reporting address in your `rua=` DNS record. The backend therefore caps how much work a single report or message can cause, so a small compressed file (a "zip bomb") cannot exhaust memory or block the server.

The limits apply to every ingestion path: upload, IMAP, Gmail, the file watcher and `POST /api/dmarc-reports/process-directory`.

## Settings

| Variable | Default | Limits |
|----------|---------|--------|
| `REPORT_MAX_FILE_BYTES` | `10485760` (10 MiB) | Size of one report file or attachment as received (compressed) |
| `REPORT_MAX_UNCOMPRESSED_BYTES` | `52428800` (50 MiB) | Size of the report XML after decompression |
| `REPORT_MAX_ZIP_ENTRIES` | `10` | Number of files inside a ZIP report |
| `REPORT_MAX_RECORDS` | `50000` | `<record>` elements in one report |
| `REPORT_MAX_MESSAGE_BYTES` | `26214400` (25 MiB) | Size of a whole IMAP/Gmail message, checked before it is downloaded |
| `REPORT_FAILURE_ARCHIVE_MAX_FILES` | `500` | Files kept in `reports/processed/failure/` |

Values are plain byte counts or numbers. Empty, zero, negative or non-numeric values fall back to the default and log a warning.

Most aggregate reports are far smaller than these defaults. Raise a limit only if the logs show real reports being rejected.

## What happens when a limit is exceeded

- **Upload**: the request fails with `413 Payload Too Large`.
- **IMAP / Gmail**: the message is marked as permanently failed on the first attempt (retrying cannot succeed). It is moved to `IMAP_FAILED_FOLDER` or given `GMAIL_FAILED_LABEL` if configured, otherwise marked as seen / processed.
- **File watcher**: the file is skipped (and deleted if `FILE_WATCH_DELETE_PROCESSED=true`).
- **Failure archive**: oversized attachments are not archived, and once the directory holds `REPORT_FAILURE_ARCHIVE_MAX_FILES` files no new ones are added. Delete old files to make room.

## Reverse proxy

The bundled nginx (`frontend/nginx.conf.template`) limits API request bodies with `client_max_body_size 10m`. If you raise `REPORT_MAX_FILE_BYTES` for uploads, raise this value too, as well as the limit in any proxy in front of it.
