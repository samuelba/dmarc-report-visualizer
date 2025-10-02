# DMARC Report Visualizer

This guide explains how to run the Angular frontend, NestJS backend, and PostgreSQL database for local development with live code reload.

## Prerequisites

- Node.js 20+
- npm 8+
- Docker and Docker Compose (for PostgreSQL and optional backend in containers)

## Quick Start (Recommended)

1) Start Postgres (Docker):

```bash
cd backend
npm run docker:dev
```

This brings up `postgres` (port 5432). It can also start the API container, but for best DX use local `npm run start:dev` in the next step.

2) Start the backend with live reload:

```bash
cd backend
npm install
# Optional: create .env (see backend/README.md for variables)
npm run start:dev
# Optional: enable file watcher
ENABLE_FILE_WATCHER=true npm run start:dev
# Optional: enable gmail attachment downloader
ENABLE_GMAIL_DOWNLOADER=true GMAIL_PROCESS_INLINE=true GMAIL_SAVE_ORIGINAL=false GMAIL_AUTH_MODE=oauth npm run start:dev
```

- API runs at `http://localhost:3000`
- Swagger docs at `http://localhost:3000/api/docs`
- CORS is enabled; global prefix is `api` (e.g. `GET http://localhost:3000/api/dmarc-reports`)

3) Start the frontend with live reload:

```bash
cd frontend
npm install
npm start
```

- App runs at `http://localhost:4200`
- Dev server proxies `/api` → `http://localhost:3000` via `frontend/proxy.conf.json` (no CORS issues)

## Alternative: Run Backend in Docker (also live reload)

The compose file defines an `api` service that mounts the backend source and runs `npm run start:dev` inside the container.

```bash
cd backend
npm run docker:up
```

- API: `http://localhost:3000`
- Postgres: `localhost:5432` (db `dmarc`, user `postgres`, pass `postgres`)
- Stop: `npm run docker:down`

Note: If you run the API in Docker, you can still run the Angular dev server locally as above.

## Database Migrations

The backend uses TypeORM migrations.

- Ensure Postgres is running (via Docker compose or your local instance)
- Run migrations:

```bash
cd backend
npm run migrate
```

Config comes from environment variables (see `backend/src/config/database.config.ts` and `backend/README.md`). By default in development, `synchronize` is enabled unless `DB_SYNCHRONIZE=false` is set. For team consistency, prefer running migrations.

## Useful Endpoints

- API base: `http://localhost:3000/api`
- Swagger docs: `http://localhost:3000/api/docs`

## Troubleshooting

- Port clashes: Change ports or stop conflicting services. Postgres uses 5432, API uses 3000, frontend uses 4200.
- Connection refused to DB: Ensure `npm run docker:dev` (or your Postgres) is up; check env `DATABASE_HOST`, `DATABASE_PORT`, etc.
- CORS issues: Frontend dev server proxies `/api` to `3000` (see `frontend/angular.json`). If you call the API directly from a different origin, set `CORS_ORIGINS` env (comma-separated) for the backend.
- File watcher: The backend can watch a directory for incoming DMARC archives if `ENABLE_FILE_WATCHER=true` is set. See `backend/README.md` for `FILE_WATCH_DIR`.

## Handy Commands

- Frontend
  - `npm start` (Angular dev server)
  - `npm run build` (production build)
- Backend
  - `npm run start:dev` (live reload)
  - `npm run migrate` (build + run migrations)
  - `npm run docker:dev` (compose up in background)
  - `npm run docker:down` (compose down)
