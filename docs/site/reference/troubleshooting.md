---
title: Troubleshooting
description: Login that does not stick, a lockout behind a proxy, IMAP, and migrations.
sidebar:
  order: 53
---

## Login succeeds and immediately returns to the login page

The browser dropped the cookie.

- `COOKIE_SECURE=true` on an HTTP site. Use HTTPS, or set `COOKIE_SECURE=false` only on a machine you alone can reach.
- You opened the UI over plain HTTP by LAN IP or hostname. With `COOKIE_SECURE=true` only HTTPS and `http://localhost` keep the cookie.
- `COOKIE_DOMAIN` is not the host in the address bar. Leave it empty, or set the real host.

`CORS_ORIGINS` does not cause this. The UI and the API share one origin through the bundled nginx. `CORS_ORIGINS` only matters for browser pages on other origins, such as an MCP client.

## Everyone is locked out of login

`TRUST_PROXY` is too low, so every request shares the proxy IP, or it is `false`. Set it to the number of proxies you run. See [Rate limiting](/dmarc-visualizer/docs/authentication/rate-limiting/). The lock is in memory and lasts `RATE_LIMIT_LOCK_DURATION_MS` (15 minutes). A restart clears it. `TRUST_PROXY=true` refuses to start.

## The container exits before it listens

- `JWT_SECRET`, `DATABASE_PASSWORD`, or `POSTGRES_PASSWORD` is empty. Compose stops with an error and creates no containers at all.
- The pre-migration backup failed, usually because Postgres was not ready. `BACKUP_MANDATORY` defaults to on, and `restart: unless-stopped` tries again. Logs say whether `pg_dump` was the cause.
- `SMTP_ENCRYPTION_KEY` is missing and you removed the Compose fallback. The process throws.
- `TOTP_ENCRYPTION_KEY` was set once and is now missing or different. Put the original key back. See [Secrets](/dmarc-visualizer/docs/deployment/secrets/).
- `TOTP_ENCRYPTION_KEY` is shorter than 32 characters or equal to `JWT_SECRET`.
- `MCP_RATE_LIMIT_PER_MIN` or `API_TOKEN_MAX_TTL_DAYS` is outside its allowed range while MCP is on.

## SAML settings will not save

`SAML_ENTITY_ID` and `SAML_ACS_URL` are empty inside the container. The stock Compose file comments them out. See [SAML](/dmarc-visualizer/docs/authentication/saml/).

## Invites point at localhost:4200

`FRONTEND_URL` is unset, and Compose does not pass it. Set it to the public origin and uncomment the line.

## IMAP connects and imports nothing

- The mailbox has no unseen messages with a `.xml`, `.gz`, or `.zip` attachment. Other mail is left unread.
- Outlook.com or Microsoft 365: password IMAP is rejected. Use another mailbox.
- Gmail without an app password fails authentication.
- `IMAP_TLS_REJECT_UNAUTHORIZED=true` and the certificate is not publicly trusted.

## Addresses stay empty when the provider is iplocate

The app still starts, but `iplocate` lookups fail until `IPLOCATE_API_KEY` is set. Configured fallbacks can still fill some addresses. Switch to `ip-api` or `geoip-lite` if you do not have a key. A placeholder key is worse than none: the provider is then called with it and fails for every address. See [IP lookup](/dmarc-visualizer/docs/usage/ip-lookup/).

## A report from email was stored as unverified under enforce

`IMAP_PROCESS_INLINE` or `GMAIL_PROCESS_INLINE` is `false`, so the file watcher imported it without the message. `enforce` does not apply on that path. The startup log says so.

## Where the screens are

| Path | Who | What |
| --- | --- | --- |
| `/dashboard` | signed in | Summary, map, charts |
| `/explore` | signed in | One row per record |
| `/reports` | signed in | One row per aggregate report |
| `/domains` | signed in | Managed and unknown domains |
| `/upload` | administrator | Report files |
| `/settings` | administrator | Third-party senders, reprocessing, utilities, report senders, SAML, SMTP, and API tokens when MCP is on |
| `/users` | administrator | Invites |
| `/profile` | signed in | Password, 2FA, MCP tokens |
