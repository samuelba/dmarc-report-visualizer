---
title: Report limits
description: Caps that reject decompression bombs and oversized reports.
sidebar:
  order: 25
---

These apply to upload, the folder watcher, IMAP, and Gmail. `REPORT_MAX_MESSAGE_BYTES` applies to IMAP and Gmail only. An empty value uses the default. A zero, negative, or non-numeric value logs a warning and uses the default.

| Variable | Default | What is limited |
| --- | --- | --- |
| `REPORT_MAX_FILE_BYTES` | 10485760 (10 MiB) | One file or attachment. |
| `REPORT_MAX_UNCOMPRESSED_BYTES` | 52428800 (50 MiB) | XML after decompression. |
| `REPORT_MAX_ZIP_ENTRIES` | 10 | Members of a ZIP. |
| `REPORT_MAX_RECORDS` | 50000 | `<record>` elements. |
| `REPORT_MAX_MESSAGE_BYTES` | 26214400 (25 MiB) | The whole IMAP message, or Gmail's size estimate, before the body is fetched. |
| `REPORT_FAILURE_ARCHIVE_MAX_FILES` | 500 | Files in `reports/processed/failure/`. Once the cap is reached, new failures are no longer archived, except that a retry still overwrites its own file. Nothing cleans the directory, so empty it yourself. Oversized attachments are never archived. |

The bundled nginx `client_max_body_size` is 10m, matching the default upload cap. Raising `REPORT_MAX_FILE_BYTES` without changing nginx does not allow a larger browser upload.
