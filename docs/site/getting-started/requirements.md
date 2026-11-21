---
title: Requirements
description: What you need before the first start.
sidebar:
  order: 1
---

- Docker and Docker Compose.
- A host that can store the Postgres volume, the `reports` directory, and database backups. Aggregate reports are small, but the database grows with every record inside them.
- Nothing else has to be published. The stock stack opens only the frontend port (80 by default). Postgres and the API stay on the Docker network.

To receive reports you also need:

- A mailbox that accepts the address you put in the DMARC `rua` tag, if you import from IMAP or Gmail. Upload and the folder watcher do not need one.
- A hostname and HTTPS if people sign in from anywhere other than the machine running Docker. See [Traefik](/dmarc-visualizer/docs/deployment/traefik/), [Caddy](/dmarc-visualizer/docs/deployment/caddy/), [nginx](/dmarc-visualizer/docs/deployment/nginx/), or [Cloudflare Tunnel](/dmarc-visualizer/docs/deployment/cloudflare-tunnel/).

The published images are `linux/amd64` only.
