---
title: Backups
description: The automatic pre-migration dump, scheduled backups, and how to restore.
sidebar:
  order: 16
---

## What to keep

- The Postgres database (the named volume `dmarc_postgres_data`).
- `.env`, or at least `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`, and `SMTP_ENCRYPTION_KEY`. A restored database cannot decrypt 2FA or SMTP secrets without them. See [Secrets](/dmarc-visualizer/docs/deployment/secrets/).
- `./reports` if you keep original or failed attachments there.

## Automatic pre-migration dump

When the backend starts and TypeORM reports pending migrations, it runs `pg_dump` and gzip before migrating. The file is named `backup_<database>_<timestamp>.sql.gz` under `BACKUP_DIR`. In Docker that directory is `/app/backups`, bind-mounted from `./backups` on the host.

The dump is skipped when nothing is pending, so most restarts write no file. The very first start dumps the empty database, because every migration is pending. A failed dump is deleted and does not count toward retention.

`BACKUP_KEEP_COUNT` (default 10) is how many `backup_*.sql` and `backup_*.sql.gz` files to keep, newest by modification time. A failure to delete old files is logged and does not fail the backup.

`BACKUP_MANDATORY=false` is the only value that lets startup continue after a failed dump. Any other value blocks startup.

This is a safety net for upgrades, not a backup schedule.

## Scheduled backups

Use the `pg_dump` inside the Postgres container, so the client version always matches the server:

```bash
docker exec dmarc-postgres pg_dump -U postgres dmarc | gzip > "./backups/manual_dmarc_$(date +%F_%H%M).sql.gz"
```

The `manual_` prefix keeps these files out of the automatic retention. A daily cron entry with 30 days of retention:

```text
15 3 * * * cd /opt/dmarc && docker exec dmarc-postgres pg_dump -U postgres dmarc | gzip > "backups/manual_dmarc_$(date +\%F).sql.gz" && find backups -name 'manual_dmarc_*.sql.gz' -mtime +30 -delete
```

Copy the files somewhere other than the Docker host. Adjust the container, user, and database to your `POSTGRES_*` settings.

## Restore

The dump is plain SQL without `DROP` statements, so restore into an empty database:

```bash
docker compose stop backend
docker exec dmarc-postgres dropdb -U postgres dmarc
docker exec dmarc-postgres createdb -U postgres dmarc
gunzip -c ./backups/backup_dmarc_<timestamp>.sql.gz | docker exec -i dmarc-postgres psql -U postgres -d dmarc
docker compose start backend
```

Automatic dumps come from a newer `pg_dump` in the backend image. Postgres 16 prints `unrecognized configuration parameter "transaction_timeout"` near the top of the restore. That line is harmless, so do not run `psql` with `ON_ERROR_STOP`.

Start the image tag that matches the dump. A newer image migrates the restored database again on startup.

## Health check

`GET /api/auth/check-setup` needs no login and reads the database. It returns `200` once the backend is up and connected.
