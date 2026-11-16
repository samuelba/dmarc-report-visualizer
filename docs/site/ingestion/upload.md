---
title: Upload
description: Send report files from the browser.
sidebar:
  order: 21
---

**Upload** is in the navigation for administrators only. You can pick several files. The page accepts names ending in `.xml`, `.zip`, or `.gz` and sends them one at a time. Each file can be up to `REPORT_MAX_FILE_BYTES` (10 MiB by default). The bundled nginx caps the whole request at 10 MiB (`client_max_body_size 10m`), so a file just under the limit can still be rejected with `413`.

The file is parsed immediately and stored with source "manual". It is not checked for DKIM, because there is no email. The sender badge says "Manual upload".

If a report with the same ID is already stored, the upload is skipped and the page says whether the stored copy was identical or different. An upload never replaces a stored report.

For a mailbox, use [IMAP](/dmarc-visualizer/docs/ingestion/imap/) or [Gmail](/dmarc-visualizer/docs/ingestion/gmail-api/).
