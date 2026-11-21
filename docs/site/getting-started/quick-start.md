---
title: Quick start
description: Start the stack with Docker Compose and create the first administrator.
sidebar:
  order: 2
---

These steps use the repository [docker-compose.yml](https://github.com/samuelba/dmarc-report-visualizer/blob/main/docker-compose.yml). A copy that pulls published images only is in [`examples/default`](https://github.com/samuelba/dmarc-report-visualizer/tree/main/examples/default).

## 1. Configure

```bash
git clone https://github.com/samuelba/dmarc-report-visualizer.git
cd dmarc-report-visualizer
cp .env.sample .env
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 32   # POSTGRES_PASSWORD and DATABASE_PASSWORD (the same value)
```

Set those three values in `.env`. They are empty in the sample, and Compose will not start while any of them is empty.

`TOTP_ENCRYPTION_KEY` (another `openssl rand -base64 48`) is recommended so stored 2FA secrets do not depend on `JWT_SECRET`. Set `SMTP_ENCRYPTION_KEY` (`openssl rand -base64 32`) before you save an SMTP password. Without it, Compose passes a publicly known placeholder. See [Secrets](/dmarc-visualizer/docs/deployment/secrets/).

The sample turns the folder watcher on (`ENABLE_FILE_WATCHER=true`) and limits reprocessing to one worker (`REPROCESSING_WORKERS=1`). It also has placeholder Gmail credentials, which are unused while the Gmail downloader is off. Everything else matches the Compose defaults.

## 2. Start

```bash
docker compose pull
docker compose up -d
docker compose logs -f backend
```

The UI is at `http://localhost` (or `FRONTEND_PORT`). The frontend proxies `/api` to the backend. Postgres is not published.

`COOKIE_SECURE=true` is the default, so the browser keeps the login cookie only on HTTPS or on `http://localhost`. Opening the UI over plain HTTP by LAN IP sends you straight back to the login page. Put it behind HTTPS (see [Deployment](/dmarc-visualizer/docs/deployment/docker-compose/)), or set `COOKIE_SECURE=false` on a machine only you can reach.

## 3. Create the administrator

Open the UI. With an empty user table the app sends you to `/setup`. Do this before the site is reachable from the internet: `/setup` needs no login, and whoever submits it first becomes the administrator.

The password needs at least 12 characters, one uppercase letter, one lowercase letter, one digit, and one character from `!@#$%^&*()-_+=?.,:;<>/`. Only ASCII letters, digits, and those symbols are allowed. Spaces and characters such as `~ [ ] { } " ' |` are rejected, so adjust your password generator if it uses them.

Later accounts are invited from **Users**.

Continue with [First steps](/dmarc-visualizer/docs/getting-started/first-steps/).
