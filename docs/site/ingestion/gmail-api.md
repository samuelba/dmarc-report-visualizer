---
title: Gmail API
description: Download report attachments with OAuth or a Workspace service account.
sidebar:
  order: 24
---

Set `ENABLE_GMAIL_DOWNLOADER=true`. Compose sets `GMAIL_AUTH_MODE=oauth`. Any other value, or no value at all, means a service account.

The Gmail scope used by the downloader is `https://www.googleapis.com/auth/gmail.modify`.

## OAuth (a user mailbox)

1. In Google Cloud, create a project and enable the Gmail API.
2. Create an OAuth client of type **Desktop app**. Note the client id and client secret.
3. Get a refresh token with the script in the repository. It runs the consent flow with the scope above and waits for Google's answer on `http://127.0.0.1:53682/oauth2callback`:

   ```bash
   cd scripts
   npm install
   CLIENT_ID=<client id> CLIENT_SECRET=<client secret> node oauth_get_refresh_token.js
   ```

   Open the printed URL, sign in as the mailbox owner, and copy the `REFRESH_TOKEN` it prints.
4. Set `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, and `GMAIL_OAUTH_REFRESH_TOKEN`. The poller does not start without all three. `GMAIL_OAUTH_REDIRECT_URI` is optional.

While the OAuth consent screen is in "Testing" status, Google expires refresh tokens after 7 days and only allows listed test users. Publish the app, or expect to renew the token.

## Service account (Workspace)

Set `GMAIL_AUTH_MODE=service_account` and `GMAIL_DELEGATED_USER` to the mailbox to impersonate. Provide either `GMAIL_CLIENT_EMAIL` and `GMAIL_PRIVATE_KEY`, or `GMAIL_CREDENTIALS_JSON_PATH` pointing at the JSON key inside the container. Values in the JSON file take precedence. If the file cannot be read, the error is logged and the environment values are used. The delegated user always comes from the environment. Domain-wide delegation in the Workspace admin console must allow the scope above.

## Labels and polling

Create the source label yourself. The default name is `DMARC Reports` (`GMAIL_LABEL`). It is looked up once at startup. If it does not exist then, the poller does not filter by label and uses only `GMAIL_QUERY`. Restart after you create it.

A poll runs at startup and then every 5 minutes (`GMAIL_POLL_INTERVAL_MS`). Each poll goes through every matching page, `GMAIL_LIST_PAGE_SIZE` (default 100) messages at a time.

With `GMAIL_QUERY` empty, which is the Compose default, the query is `has:attachment newer_than:5d -label:"DMARC Processed" -label:"DMARC Failed"`, with your label names.

## Success and failure

Every attachment with a file name is downloaded and parsed, whatever its type. A message counts as processed only when all of them succeed, so a report email that also carries a PDF or an image ends up failed.

On success the message gets `GMAIL_PROCESSED_LABEL` (default `DMARC Processed`, created if missing) and loses the source label, unless `GMAIL_REMOVE_SOURCE_LABEL=false`.

A failed message is tried again on the next poll. After `GMAIL_FAILURE_THRESHOLD` failures (default 3) it gets `GMAIL_FAILED_LABEL` (default `DMARC Failed`, created if missing) and is also marked processed, so it is not tried again. Each failing attachment counts once, so a message with three bad attachments reaches the default threshold in one poll. The counts are kept in memory and start over when the backend restarts.

A message or attachment over the [size limits](/dmarc-visualizer/docs/ingestion/report-limits/), or a report rejected by `enforce`, is marked failed straight away. `REPORT_MAX_MESSAGE_BYTES` is compared to Gmail's `sizeEstimate` before the body is fetched. Inline failures are copied under `reports/processed/failure/`.

`GMAIL_PROCESS_INLINE=false` writes the attachments into `FILE_WATCH_DIR` and skips sender checks. `GMAIL_SAVE_ORIGINAL=true` also keeps a copy under `reports/processed/success/`. It only applies to inline processing.
