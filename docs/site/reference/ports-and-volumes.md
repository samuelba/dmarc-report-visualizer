---
title: Ports and volumes
description: What the stock stack publishes, and which directories survive a restart.
sidebar:
  order: 52
---

## Ports

| Port | Where | Who can reach it |
| --- | --- | --- |
| 80 in the frontend container | nginx | The host, on `FRONTEND_PORT` (default 80), in the stock file |
| 3000 | backend | Docker network only. nginx proxies `/api/` here and ignores `PORT` |
| 5432 | Postgres | Docker network only |

`docker-compose.override.yml.example` publishes `127.0.0.1:5432` and `127.0.0.1:3000` for a development checkout. Do not use that on a host that faces the internet.

The [Traefik](/dmarc-visualizer/docs/deployment/traefik/), [Caddy](/dmarc-visualizer/docs/deployment/caddy/), and [Cloudflare Tunnel](/dmarc-visualizer/docs/deployment/cloudflare-tunnel/) examples do not publish the frontend. The proxy joins the Docker network instead.

## Volumes

| Host path | In the backend container | What it holds |
| --- | --- | --- |
| `./reports` | `/app/reports` | Incoming files, and `processed/success` and `processed/failure` |
| `./backups` | `/app/backups` | `backup_*.sql.gz` from the pre-migration dump |
| `./logs` | `/app/logs` | Nothing. The backend logs to stdout; use `docker compose logs backend` |
| named `dmarc_postgres_data` | Postgres data dir | The database. This is the one you must not delete |

Compose prefixes named volumes with the project name, which is the directory name by default. On disk the database volume is called, for example, `dmarc-report-visualizer_dmarc_postgres_data`. `docker volume ls` shows the real name.

Redis, when you uncomment it, uses the named volume `dmarc_redis_data` and publishes `127.0.0.1:6379`.
