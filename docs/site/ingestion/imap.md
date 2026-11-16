---
title: IMAP
description: Download report attachments from a mailbox that accepts a password.
sidebar:
  order: 23
---

Set `ENABLE_IMAP_DOWNLOADER=true` and provide `IMAP_HOST`, `IMAP_USER`, and `IMAP_PASSWORD`. If any of those is missing, the poller logs an error and does not start. The full list is in [Configuration](/dmarc-visualizer/docs/reference/configuration/).

Defaults: port 993, TLS on, certificate checks on, mailbox `INBOX`, search `UNSEEN`, poll every 5 minutes. A poll also runs at startup. Each poll opens a new connection.

## Attachments

An attachment is taken when its name ends in `.xml`, `.gz`, or `.zip`, or when its content type is gzip, zip, or XML. Messages without such an attachment are left unread and never moved. `REPORT_MAX_MESSAGE_BYTES` is checked from the message size before the body is downloaded.

`IMAP_PROCESS_INLINE=false` writes attachments into `FILE_WATCH_DIR` instead. Sender checks then do not run. See [Ingestion](/dmarc-visualizer/docs/ingestion/overview/). `IMAP_SAVE_ORIGINAL=true` keeps a copy under `reports/processed/success/`. It only applies to inline processing.

## Success and failure

Empty `IMAP_PROCESSED_FOLDER` marks a success as read and leaves it in place. Empty `IMAP_FAILED_FOLDER` marks a permanent failure as read and leaves it in place. Both folders are created if they do not exist. If creating or moving fails, the message is only marked as read.

If one attachment of a message succeeds, the whole message counts as processed, and errors from its other attachments are not retried.

A failed message is tried again on later polls. After `IMAP_FAILURE_THRESHOLD` failures (default 3) it is permanent. A message or attachment over the [size limits](/dmarc-visualizer/docs/ingestion/report-limits/), or a report rejected by `enforce`, is permanent on the first attempt. In `enforce` mode, a temporary DNS error during the sender check counts as an ordinary failure and is retried. In `flag` mode the report is stored as unverified instead. Inline failures are copied under `reports/processed/failure/` as `<mailbox>_<UIDVALIDITY>_<UID>-<filename>`.

Handled messages are tracked in the database. Tracking rows for success and skipped mail older than 90 days are deleted daily at 03:00.

## Search criteria

`IMAP_SEARCH_CRITERIA` understands `UNSEEN`, `SUBJECT "text"`, and `ALL` on its own. `UNSEEN` and `SUBJECT` can be combined, for example `UNSEEN SUBJECT "Report domain"`. Anything else logs a warning and uses `UNSEEN`. Startup also warns when the criteria lack `UNSEEN` and no processed folder is set, because handled messages then stay in the search results.

## Providers

Any server that accepts a username and password works. That includes Fastmail, mailbox.org, and a host you run yourself (Dovecot, Courier). Use the IMAP hostname your provider documents.

Gmail needs an app password: turn on 2-step verification, create an app password for Mail, and set `IMAP_HOST=imap.gmail.com`. The [Gmail API](/dmarc-visualizer/docs/ingestion/gmail-api/) downloader is a better fit if you want labels.

Yahoo is `imap.mail.yahoo.com` with an app password.

Outlook.com and Microsoft 365 are not supported. They reject password logins (`535 5.7.139`), and app passwords do not work for IMAP either. This downloader has no OAuth. Forward those reports to a mailbox that accepts a password, or use another provider.

Leave `IMAP_TLS_REJECT_UNAUTHORIZED=true`. For a private CA, add the certificate to the image's trust store. `false` still connects and logs a warning. Use it only on a network you control.

## Develop against GreenMail

A throwaway IMAP server and an end-to-end test live in the repository. From `backend/`:

```bash
npm run imap-test:up
npm run test:e2e:imap
npm run imap-test:down
```

`DEVELOPMENT.md` has the commands for doing the same thing by hand.
