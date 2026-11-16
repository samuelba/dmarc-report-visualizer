---
title: Configuration
description: Every environment variable the DMARC Report Visualizer reads, with the Docker Compose default.
sidebar:
  order: 50
---

Docker Compose passes a variable into the backend only when `docker-compose.yml` lists it under `environment:`. A value that exists only in `.env` is used to fill `${...}` in that file. If the line is commented out, the container never sees it.

The **Compose** column is the value used when the variable is unset or empty (`${VAR:-default}`). Copying [`.env.sample`](https://github.com/samuelba/dmarc-report-visualizer/blob/main/.env.sample) to `.env` overrides those defaults. The differences that matter are called out in the rows.

Booleans are strings. `DB_SYNCHRONIZE`, `DB_MIGRATIONS_RUN`, and the `THEFT_DETECTION_*` flags accept `true`, `1`, and `yes`. The `ENABLE_*` flags, `FILE_WATCH_DELETE_PROCESSED`, and `MCP_ENABLED` accept `true` in any case. `COOKIE_SECURE`, `SAML_DISABLE_SIGNATURE_VALIDATION`, and `FORCE_ENABLE_PASSWORD_LOGIN` accept only the exact lowercase string `true`.

## Database

| Variable | Compose | What it does |
| --- | --- | --- |
| `DATABASE_HOST` | `postgres` | Postgres hostname. The code default outside Compose is `localhost`. |
| `DATABASE_PORT` | `5432` | Postgres port. |
| `DATABASE_USERNAME` | `postgres` | Database user. |
| `DATABASE_PASSWORD` | required | Must match `POSTGRES_PASSWORD`. Compose refuses to start if it is empty. |
| `DATABASE_NAME` | `dmarc` | Database name. |
| `DB_SYNCHRONIZE` | `false` | When `true`, TypeORM alters the schema on startup. Leave this off and use migrations. Unset outside Compose, it is on unless `NODE_ENV` is `production`. |
| `DB_MIGRATIONS_RUN` | `true` | Apply pending migrations on startup. The string `false` also skips the pre-migration backup. Any other value, including `0`, still runs the backup script, but only `true`, `1`, and `yes` make TypeORM migrate. |

## Postgres

These configure the `postgres` image. The backend does not read them.

| Variable | Compose | What it does |
| --- | --- | --- |
| `POSTGRES_USER` | `postgres` | Superuser created on first start. |
| `POSTGRES_PASSWORD` | required | Superuser password. Compose refuses to start if it is empty. |
| `POSTGRES_DB` | `dmarc` | Database created on first start. |

## Application

| Variable | Compose | What it does |
| --- | --- | --- |
| `NODE_ENV` | `production` | `production` turns on secure cookie defaults and `SameSite=Strict`. |
| `PORT` | `3000` | Port the backend listens on. The bundled nginx always proxies to port 3000, so leave this unless you change nginx too. |
| `TRUST_PROXY` | `1` | How many proxies sit in front of the backend. See [Rate limiting](/dmarc-visualizer/docs/authentication/rate-limiting/). `true` is rejected and the process exits. |
| `FRONTEND_PORT` | `80` | Host port published by the frontend container. Not read by the backend. |
| `FRONTEND_URL` | not passed | Public site URL, used for SAML redirects and invite links. The code default is `http://localhost:4200`. The line is commented out in `docker-compose.yml`, so set it and uncomment it. |

## Cookies and CORS

| Variable | Compose | What it does |
| --- | --- | --- |
| `COOKIE_SECURE` | `true` | Cookies are marked `Secure` only when this is exactly `true`. Browsers then drop them on plain HTTP. |
| `COOKIE_DOMAIN` | empty | Sent as the cookie `Domain` when non-empty. Leave it empty to bind the cookie to the host the browser used. A wrong domain makes login look successful and then bounce back to the login page. |
| `CORS_ORIGINS` | `http://localhost` | Comma-separated allowed browser origins. `*` reflects any origin. Trailing slashes are not removed. Credentials are always allowed. The code default, when the variable is unset, is `*`. |

Cookies are `httpOnly`, path `/`. In production, `SameSite` is `Strict`. Names are `accessToken`, `refreshToken`, and `totpTempToken`.

## Secrets and sessions

| Variable | Compose | What it does |
| --- | --- | --- |
| `JWT_SECRET` | required | Signs session cookies. Generate with `openssl rand -base64 48`. The sample placeholder and any secret shorter than 32 characters are logged as weak. Changing it signs everyone out. See [Secrets](/dmarc-visualizer/docs/deployment/secrets/). |
| `JWT_ACCESS_EXPIRATION` | `15m` | Access token lifetime. The code default is also `15m`. |
| `JWT_REFRESH_EXPIRATION` | `30d` | Refresh token lifetime. The code default, if the variable is unset, is `7d`. |
| `TOTP_ENCRYPTION_KEY` | empty | Encrypts stored 2FA secrets. At least 32 characters, and different from `JWT_SECRET`. Recommended. See [Secrets](/dmarc-visualizer/docs/deployment/secrets/). |
| `TOTP_WINDOW` | not passed | TOTP codes accepted this many steps either side of now. Code default `3`. |
| `TOTP_STEP` | not passed | TOTP step in seconds. Code default `30`. |
| `TOTP_ISSUER` | not passed | Name shown in authenticator apps. Code default `DMARC Dashboard`. |
| `BCRYPT_ROUNDS` | `10` | Password hashing cost. |
| `SMTP_ENCRYPTION_KEY` | `your-smtp-encryption-key` | Encrypts the SMTP password stored in the database. Replace the public Compose fallback before you save an SMTP password. An empty value stops startup. Known sample values and keys under 32 characters only log a warning. |
| `THEFT_DETECTION_ENABLED` | not passed | When on (the code default), reuse of a rotated refresh token is treated as theft. |
| `THEFT_DETECTION_INVALIDATE_FAMILY` | not passed | When on (the code default), that theft also revokes the rest of the session family. |

## Rate limiting

Counters are in memory, not Redis. See [Rate limiting](/dmarc-visualizer/docs/authentication/rate-limiting/).

| Variable | Compose | What it does |
| --- | --- | --- |
| `RATE_LIMIT_IP_MAX_ATTEMPTS` | `10` | Failed logins allowed per client IP. |
| `RATE_LIMIT_IP_WINDOW_MS` | `300000` | Window for the IP limit, in milliseconds (5 minutes). |
| `RATE_LIMIT_ACCOUNT_MAX_ATTEMPTS` | `5` | Failed logins allowed per account. |
| `RATE_LIMIT_ACCOUNT_WINDOW_MS` | `300000` | Window for the account limit. |
| `RATE_LIMIT_LOCK_DURATION_MS` | `900000` | How long a lock lasts (15 minutes). |

## SAML and Redis

SAML itself is turned on in **Settings → SAML/SSO**, not by an environment variable. Redis is optional. Without `REDIS_HOST`, SAML still works and assertion replay protection stays off. The email queue needs Redis; a test message does not. See [SAML](/dmarc-visualizer/docs/authentication/saml/) and [SMTP](/dmarc-visualizer/docs/authentication/smtp/).

| Variable | Compose | What it does |
| --- | --- | --- |
| `SAML_ENTITY_ID` | commented out | Service provider entity ID. Saving SAML settings requires this and `SAML_ACS_URL` to be non-empty inside the container. |
| `SAML_ACS_URL` | commented out | Assertion consumer URL. It must be `https://<your host>/api/auth/saml/callback`. |
| `SAML_DISABLE_SIGNATURE_VALIDATION` | not passed | Exactly `true` turns signature checks off. Do not set this in production. |
| `FORCE_ENABLE_PASSWORD_LOGIN` | not passed | Exactly `true` keeps password login available even when SAML settings disable it. |
| `REDIS_HOST` | commented out | Redis hostname. Unset means Redis is not used. |
| `REDIS_PORT` | commented out | Redis port. The SAML client defaults to `6379`. |
| `REDIS_PASSWORD` | commented out | Redis password. The commented service in Compose requires one. |

## MCP

Off unless `MCP_ENABLED` is `true` (any case). While it is on, an out-of-range `MCP_RATE_LIMIT_PER_MIN` or `API_TOKEN_MAX_TTL_DAYS` stops startup. See [MCP](/dmarc-visualizer/docs/usage/mcp/).

| Variable | Compose | What it does |
| --- | --- | --- |
| `MCP_ENABLED` | `false` | Registers `/api/mcp` and the token API. |
| `MCP_ALLOWED_ORIGINS` | empty | Extra browser origins for `/api/mcp`, comma-separated. `CORS_ORIGINS` are always allowed. |
| `MCP_RATE_LIMIT_PER_MIN` | `60` | Requests per minute per user, across that user's tokens. Must be an integer from 1 to 100000 when set. |
| `API_TOKEN_MAX_TTL_DAYS` | `365` | Longest token lifetime, in days. A whole number from 1 to 3650. |

## Report limits

Empty, zero, negative, or non-numeric values fall back to the default. See [Report limits](/dmarc-visualizer/docs/ingestion/report-limits/).

| Variable | Compose | What it does |
| --- | --- | --- |
| `REPORT_MAX_FILE_BYTES` | `10485760` | One uploaded file or attachment (10 MiB). Nginx has the same cap. |
| `REPORT_MAX_UNCOMPRESSED_BYTES` | `52428800` | XML after decompression (50 MiB). |
| `REPORT_MAX_ZIP_ENTRIES` | `10` | Files inside one ZIP. |
| `REPORT_MAX_RECORDS` | `50000` | `<record>` elements in one report. |
| `REPORT_MAX_MESSAGE_BYTES` | `26214400` | Whole email before the body is downloaded (25 MiB). |
| `REPORT_FAILURE_ARCHIVE_MAX_FILES` | `500` | Cap on files in `reports/processed/failure/`. At the cap, new failures are not archived. Nothing rotates the directory. |

## Sender authentication

See [Sender authentication](/dmarc-visualizer/docs/ingestion/sender-authentication/).

| Variable | Compose | What it does |
| --- | --- | --- |
| `REPORT_SENDER_AUTH` | `flag` | `off`, `flag`, or `enforce`. Anything else is treated as `flag`. |
| `REPORT_TRUSTED_ARC_SEALERS` | empty | Comma-separated ARC-Seal domains, for example `google.com`. |
| `REPORT_RELAY_DOMAINS` | empty | Extra relay domains to ignore. Managed domains are always ignored. |

## File watcher

| Variable | Compose | What it does |
| --- | --- | --- |
| `ENABLE_FILE_WATCHER` | `false` | `true` watches `FILE_WATCH_DIR`. `.env.sample` sets `true`, which overrides this default. |
| `FILE_WATCH_DIR` | `reports/incoming` | Directory to watch. Relative paths are resolved from `/app`, so this is the host directory `./reports/incoming`. |
| `FILE_WATCH_DELETE_PROCESSED` | `true` | `true` deletes a file after a successful parse, and deletes a file that is over the size limit without reading it. Unset outside Compose, files are kept. |
| `FILE_WATCH_VERBOSE` | `false` | Extra logs. When it is unset outside Compose, verbose logging is on unless `NODE_ENV` is `production`. |

## Gmail

See [Gmail API](/dmarc-visualizer/docs/ingestion/gmail-api/). Any `GMAIL_AUTH_MODE` other than `oauth`, including unset, means a service account. Compose sets `oauth`.

| Variable | Compose | What it does |
| --- | --- | --- |
| `ENABLE_GMAIL_DOWNLOADER` | `false` | `true` starts the poller. |
| `GMAIL_AUTH_MODE` | `oauth` | `oauth` or `service_account`. |
| `GMAIL_OAUTH_CLIENT_ID` | empty | OAuth client id. Required for `oauth`. |
| `GMAIL_OAUTH_CLIENT_SECRET` | empty | OAuth client secret. Required for `oauth`. |
| `GMAIL_OAUTH_REFRESH_TOKEN` | empty | OAuth refresh token. Required for `oauth`. |
| `GMAIL_OAUTH_REDIRECT_URI` | `http://localhost` | Redirect URI registered on the OAuth client. Optional. |
| `GMAIL_CLIENT_EMAIL` | empty | Service account email. Required for a service account, unless the JSON file has it. |
| `GMAIL_PRIVATE_KEY` | empty | Service account private key. Required for a service account, unless the JSON file has it. |
| `GMAIL_DELEGATED_USER` | empty | Workspace user the service account impersonates. Required for a service account. |
| `GMAIL_CREDENTIALS_JSON_PATH` | empty | Service account JSON file. Its email and key take precedence. If the file cannot be read, the environment values are used. |
| `GMAIL_LABEL` | `DMARC Reports` | Label to read. It is not created for you. |
| `GMAIL_PROCESSED_LABEL` | `DMARC Processed` | Applied after success. Created if missing. |
| `GMAIL_FAILED_LABEL` | `DMARC Failed` | Applied after repeated failure. Created if missing. |
| `GMAIL_POLL_INTERVAL_MS` | `300000` | Delay between polls. |
| `GMAIL_LIST_PAGE_SIZE` | `100` | Messages per page, from 1 to 500. |
| `GMAIL_QUERY` | empty | Gmail search. Empty uses `has:attachment newer_than:5d -label:"<processed>" -label:"<failed>"` with your label names. |
| `GMAIL_PROCESS_INLINE` | `true` | Parse in the poller. `false` writes files into `FILE_WATCH_DIR` instead. |
| `GMAIL_SAVE_ORIGINAL` | `false` | Also keep a copy under `reports/processed/success/`. |
| `GMAIL_REMOVE_SOURCE_LABEL` | `true` | Remove `GMAIL_LABEL` after processing. |
| `GMAIL_FAILURE_THRESHOLD` | `3` | Failures before the failed label is applied. |

## IMAP

See [IMAP](/dmarc-visualizer/docs/ingestion/imap/).

| Variable | Compose | What it does |
| --- | --- | --- |
| `ENABLE_IMAP_DOWNLOADER` | `false` | `true` starts the poller. |
| `IMAP_HOST` | empty | Required when IMAP is on. |
| `IMAP_PORT` | `993` | IMAP port. |
| `IMAP_USER` | empty | Required when IMAP is on. |
| `IMAP_PASSWORD` | empty | Required when IMAP is on. |
| `IMAP_TLS` | `true` | Use TLS. |
| `IMAP_TLS_REJECT_UNAUTHORIZED` | `true` | Reject bad certificates. `false` still connects and logs a warning. |
| `IMAP_MAILBOX` | `INBOX` | Folder to read. |
| `IMAP_SEARCH_CRITERIA` | `UNSEEN` | Search key. Unknown values fall back to `UNSEEN`. |
| `IMAP_PROCESSED_FOLDER` | empty | Move successes here. Empty means mark them read and leave them. |
| `IMAP_FAILED_FOLDER` | empty | Move repeated failures here. Empty means mark them read and leave them. |
| `IMAP_POLL_INTERVAL_MS` | `300000` | Delay between polls. A non-positive value uses 300000. |
| `IMAP_PROCESS_INLINE` | `true` | Parse in the poller. `false` writes files into `FILE_WATCH_DIR`. |
| `IMAP_SAVE_ORIGINAL` | `false` | Also keep a copy under `reports/processed/success/`. |
| `IMAP_FAILURE_THRESHOLD` | `3` | Failures before a message is treated as permanently failed. |

## IP lookup

There is no settings screen. Values are read at startup. See [IP lookup](/dmarc-visualizer/docs/usage/ip-lookup/).

| Variable | Compose | What it does |
| --- | --- | --- |
| `IP_LOOKUP_PROVIDER` | `ip-api` | Primary provider: `geoip-lite`, `ip-api`, `iplocate`, `ipapi-co`, or `ipwhois`. `iplocate` needs `IPLOCATE_API_KEY`. The code default is `geoip-lite`. |
| `IPLOCATE_API_KEY` | empty | Key for iplocate, including the free tier. |
| `IPAPICO_API_KEY` | empty | Optional key for ipapi.co. |
| `IPWHOIS_API_KEY` | empty | Optional key for ipwhois. |
| `IP_LOOKUP_FALLBACK_PROVIDERS` | `ipwhois,ip-api,ipapi-co,geoip-lite` | Comma-separated fallbacks. The code default is none. |
| `IP_LOOKUP_CACHE_DAYS` | `14` | How long a cached lookup is reused. The code default is `30`. |
| `IP_LOOKUP_USE_CACHE` | not passed | Use the cache. `false`, `0`, or `no` turns it off. Code default is on. |

## Backups and maintenance

| Variable | Compose | What it does |
| --- | --- | --- |
| `BACKUP_DIR` | `/app/backups` | Where `pg_dump` output is written. `.env.sample` sets `./backups`, which is the same directory inside the image because the workdir is `/app`. |
| `BACKUP_MANDATORY` | `true` | Exactly `false` lets the process start when the pre-migration backup fails. Anything else, including an empty value, blocks startup. |
| `BACKUP_KEEP_COUNT` | `10` | How many `backup_*.sql` and `backup_*.sql.gz` files to keep, newest by modification time. This is a file count, not an age. |
| `REPROCESSING_WORKERS` | empty | Parallel workers for reprocessing. Empty uses `max(1, floor(cpuCount / 4))`. `.env.sample` sets `1`. |
