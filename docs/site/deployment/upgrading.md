---
title: Upgrading
description: Pull a new image, let migrations run, and roll back from the backup.
sidebar:
  order: 15
---

Pin a tag when you can. `latest` moves on every release. Image names and tags are in [Docker images](/dmarc-visualizer/docs/reference/docker-images/).

```bash
# edit the image tags in your compose file, then:
docker compose pull
docker compose up -d
```

On startup the backend container runs a backup if `DB_MIGRATIONS_RUN` is not the string `false` and TypeORM reports pending migrations. It then applies those migrations. No migration means no backup file. Details are in [Backups](/dmarc-visualizer/docs/deployment/backups/).

`BACKUP_MANDATORY` defaults to on. If `pg_dump` fails, the container exits and the old schema stays. A common cause on a cold boot is Postgres not accepting connections yet. The restart policy tries again.

There are no down migrations. To go back to an older image:

1. Stop the backend.
2. Restore the `backup_*.sql.gz` taken before this upgrade. See [Backups](/dmarc-visualizer/docs/deployment/backups/).
3. Start the previous image tag.

If the release did not ship a migration, the automatic backup did not run. [Take one yourself](/dmarc-visualizer/docs/deployment/backups/#scheduled-backups) before you pull.

Keep `JWT_SECRET` and `TOTP_ENCRYPTION_KEY` with the database dump. A restored database cannot decrypt 2FA secrets without the same `TOTP_ENCRYPTION_KEY`. See [Secrets](/dmarc-visualizer/docs/deployment/secrets/).

## Postgres

The stack pins `postgres:16-alpine`. A new major version cannot read the old data directory, so changing the tag to `17` makes the container refuse to start. To move to a new major version, dump the database, remove the `dmarc_postgres_data` volume, start the new image, and restore the dump. See [Backups](/dmarc-visualizer/docs/deployment/backups/).

`POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` only apply when the volume is created. Changing `POSTGRES_PASSWORD` later does not change the database password. Change it with `ALTER USER` and then update `DATABASE_PASSWORD` to match.
