---
title: SMTP
description: Send invite mail. Settings live in the database. Redis is only for the queue.
sidebar:
  order: 34
---

Server settings are edited at **Settings → SMTP Email** and stored in the database: host, port, security (`none`, `tls`, or `starttls`, the form starts on `starttls`), optional username and password, from address, from name, and an optional reply-to. The password is encrypted with `SMTP_ENCRYPTION_KEY` (AES-256-GCM). The key is environment-only. See [Secrets](/dmarc-visualizer/docs/deployment/secrets/).

A test message is sent immediately and does not use Redis.

Invitation mail is queued: 3 attempts, exponential backoff starting at 1 second. The queue error says to set `REDIS_HOST`. That is true for queued mail only. Saving the form and sending a test does not need Redis. Production Compose comments Redis out and still passes `SMTP_ENCRYPTION_KEY`, so you can store settings before you turn the queue on.

To turn the queue on, follow [Enable Redis](/dmarc-visualizer/docs/deployment/docker-compose/#enable-redis).
