---
title: Sender authentication
description: DKIM and ARC checks on reports that arrive by email.
sidebar:
  order: 26
---

`REPORT_SENDER_AUTH` controls what happens to a report that came in by IMAP or Gmail (inline processing only):

| Value | Behavior |
| --- | --- |
| `off` | Store the report as unchecked. No DKIM or ARC work. |
| `flag` | Store every report with its verdict. This is the default. |
| `enforce` | Reject emailed reports that are unverified. Unaligned reports are still stored. |

Any other value is ignored and `flag` is used.

## How the check works

The reporter is the organizational domain of the address in the report's `<report_metadata><email>`, not its `org_name`. A report without an email address can never be aligned.

A report is aligned when one of these belongs to that organization:

- A passing DKIM signature on the email itself.
- A result recorded by a trusted ARC sealer: a DKIM pass, or the From domain of a DMARC pass. This route needs the ARC chain as a whole to pass. Seals are read from newest to oldest, and reading stops at the first sealer that is not in `REPORT_TRUSTED_ARC_SEALERS`.

SPF is never used. If reports reach you through a Google Group, add `google.com` to `REPORT_TRUSTED_ARC_SEALERS`.

Some domains can never count as the reporter: your managed domains, `REPORT_RELAY_DOMAINS`, and the domain the report itself is about. They are compared at the organizational-domain level, so a domain also covers its subdomains. Startup warns when `REPORT_TRUSTED_ARC_SEALERS` is empty, and when there are no managed domains and no relay domains.

In `flag` mode, a temporary DNS failure during the check stores the report as unverified and is not retried.

With inline processing off, the attachment reaches the [file watcher](/dmarc-visualizer/docs/ingestion/file-watcher/) without the email and is stored as unverified. Startup logs that `enforce` does not apply on that path. The watcher itself always stores `unverified`.

## Before you switch to enforce

Save a few report emails as `.eml` files and check their verdict from `backend/`:

```bash
npx ts-node --transpile-only src/scripts/check-sender-auth.ts \
  report1.eml report2.eml --sealers google.com --relay example.com
```

## In the UI

The badge on **Reports**:

| Verdict | What you see |
| --- | --- |
| aligned | A check-mark icon. The tooltip names the verified sender. |
| unaligned | Sent by *domain* |
| unverified | Unverified sender |
| manual | Manual upload |
| unchecked | Not checked (`off`, or not an email) |
| legacy | Legacy (rows from before this check existed) |

Clicking the badge opens the delivery history.

**Settings → Report Senders** is for administrators. It lists unaligned pairs (claimed domain, sending domain, reporting org, count, last seen) with a Trust action, plus the pairs you have already trusted, with Revoke. Trust is an exact reporter alias, which is what Yahoo needs. The claimed domain must be an organizational domain. Trust also upgrades existing unaligned reports from that pair to aligned, and Revoke turns them back.

## When the same report arrives again

An identical copy is recorded as a delivery. A different copy replaces the stored report only if the new one is aligned and the stored one is not. Any other different copy is a conflict: the stored report stays, and up to 10 rejected copies per report are kept in the database. They are not shown in the UI.
