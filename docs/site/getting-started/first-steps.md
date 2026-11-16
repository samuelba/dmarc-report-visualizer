---
title: First steps
description: Add a domain, publish a rua address, and import one report.
sidebar:
  order: 3
---

## Add a domain

Open **Domains** and add each domain you send mail from. The page also lists header-from domains that appeared in reports and are not in that list. Those can be someone else spoofing you, or a domain you forgot. An administrator can add, edit, and remove managed domains. See [Domains](/dmarc-visualizer/docs/usage/domains/).

## Point rua at a mailbox

Publish a DMARC record so receivers send aggregate reports to you:

```text
_dmarc.example.com.  IN TXT  "v=DMARC1; p=none; rua=mailto:dmarc@example.com"
```

Start with `p=none` until the reports look right. If the mailbox is on a different domain than the one being reported, the receiving domain must publish an authorization record:

```text
example.com._report._dmarc.otherdomain.com.  IN TXT  "v=DMARC1"
```

Then pick one import path: [upload](/dmarc-visualizer/docs/ingestion/upload/), the [folder watcher](/dmarc-visualizer/docs/ingestion/file-watcher/), [IMAP](/dmarc-visualizer/docs/ingestion/imap/), or the [Gmail API](/dmarc-visualizer/docs/ingestion/gmail-api/).

## Read a report

**Dashboard** is the summary. **Explore** is one row per record. **Reports** is one row per aggregate report, including the raw XML. Sender badges show whether the email that carried the report checked out. See [Explore](/dmarc-visualizer/docs/usage/explore/).
