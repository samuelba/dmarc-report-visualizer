---
title: Ingestion
description: How reports get into the database, and what each path checks.
sidebar:
  order: 20
---

Every path ends in the same parser. It reads `.xml` and `.txt` as plain XML, `.gz`, `.gzip`, and `.zip`, and content that looks like gzip or zip whatever the name. Any other extension is rejected, even if the content is XML. [Report limits](/dmarc-visualizer/docs/ingestion/report-limits/) apply on all paths.

| Path | Who can use it | Sender check |
| --- | --- | --- |
| [Upload](/dmarc-visualizer/docs/ingestion/upload/) | Administrators | Stored as a manual upload |
| [Folder watcher](/dmarc-visualizer/docs/ingestion/file-watcher/) | The server, for files on disk | Stored as unverified. `enforce` does not apply |
| [IMAP](/dmarc-visualizer/docs/ingestion/imap/) | A mailbox with a password | DKIM and ARC, when processing is inline |
| [Gmail API](/dmarc-visualizer/docs/ingestion/gmail-api/) | A Gmail account or Workspace delegation | DKIM and ARC, when processing is inline |

If IMAP or Gmail is set to write files into the watch directory instead of parsing them, the email is gone by the time the watcher runs. Those reports are stored as unverified, and `REPORT_SENDER_AUTH=enforce` does not reject them. The log says so at startup.

Administrators can also import a directory on the server with `POST /api/dmarc-reports/process-directory` (default `reports/incoming`). Those reports are stored as manual.

The same report often arrives more than once. Every copy is recorded as a delivery of the stored report. A stored report is replaced only by an aligned email copy. See [Sender authentication](/dmarc-visualizer/docs/ingestion/sender-authentication/).

IP lookups are queued during parsing and do not block the import. See [IP lookup](/dmarc-visualizer/docs/usage/ip-lookup/).
