#!/usr/bin/env bash
# Runs the backend with live reload against docker-compose.imap-test.yml
# (GreenMail + throwaway Postgres). Values in imap-test.env override backend/.env.
#
#   npm run imap-test:up && npm run imap-test:backend
set -euo pipefail

cd "$(dirname "$0")/../.."

set -a
# shellcheck source=imap-test.env
source test/imap/imap-test.env
set +a

echo "Backend -> IMAP ${IMAP_USER} @ ${IMAP_HOST}:${IMAP_PORT}, DB ${DATABASE_NAME} @ ${DATABASE_HOST}:${DATABASE_PORT}"
exec npx nest start --watch
