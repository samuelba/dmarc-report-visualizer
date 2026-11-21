---
title: Docker images
description: Image names, tags, and the platform the release workflow publishes.
sidebar:
  order: 51
---

A release builds two images and pushes them to GitHub Container Registry:

| Image | Contents |
| --- | --- |
| `ghcr.io/samuelba/dmarc-report-visualizer/dmarc-backend` | NestJS API, production target |
| `ghcr.io/samuelba/dmarc-report-visualizer/dmarc-frontend` | Built Angular app and nginx |

Each release is tagged three ways: the git tag (`v0.11.0`), the version without the `v` (`0.11.0`), and `latest`. The platform is `linux/amd64` only.

`latest` moves on every release. Pin `vX.Y.Z` in Compose if you want an upgrade to be a deliberate edit. See [Upgrading](/dmarc-visualizer/docs/deployment/upgrading/).

The repository `docker-compose.yml` also has a `build:` block so a checkout can build the same images. The files under `examples/` omit `build` and pull the published images.
