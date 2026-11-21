---
title: File watcher
description: Drop XML, gzip, or zip files in a directory and have them imported.
sidebar:
  order: 22
---

Set `ENABLE_FILE_WATCHER=true`. The watcher polls `FILE_WATCH_DIR` about once a second, which is what a Docker bind mount needs. It creates the directory, follows symlinks, looks 10 levels deep, and picks up files that are already there at startup.

Names that start with a dot are ignored. Every other file is tried, whatever its extension. A file that is not XML, gzip, or zip fails with "Unsupported file type" and stays in the folder.

| Variable | Compose default | `.env.sample` |
| --- | --- | --- |
| `ENABLE_FILE_WATCHER` | `false` | `true` |
| `FILE_WATCH_DIR` | `reports/incoming` | `reports/incoming` |
| `FILE_WATCH_DELETE_PROCESSED` | `true` | `true` |
| `FILE_WATCH_VERBOSE` | `false` | `false` |

Inside the image the working directory is `/app`, and Compose mounts `./reports` at `/app/reports`. The default path is therefore the host directory `./reports/incoming`. An absolute path is used as written inside the container.

`FILE_WATCH_DELETE_PROCESSED=true` deletes the file after a successful parse. It also deletes a file larger than `REPORT_MAX_FILE_BYTES` without reading it. With it off, imported files stay, and every restart imports them again. The copies are recorded as extra deliveries of the same report, not as new reports.

A file that fails to parse is logged and stays. Editing it in place does not retry it. Move it out of the folder and back in, or restart the backend. The watcher does not write `reports/processed/failure/`. That directory is for IMAP and Gmail.

Reports from the watcher are stored as unverified. [Sender authentication](/dmarc-visualizer/docs/ingestion/sender-authentication/) in `enforce` mode does not apply to them.
