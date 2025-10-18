#!/bin/sh
set -e

echo "=== Starting DMARC Backend ==="

# Check if migrations should run
if [ "${DB_MIGRATIONS_RUN}" != "false" ]; then
  echo "Migrations are enabled. Running pre-migration backup..."
  
  # Run the backup script
  node dist/src/scripts/pre-migration-backup.js || {
    echo "Backup script failed with exit code $?"
    if [ "${BACKUP_MANDATORY}" != "false" ]; then
      echo "BACKUP_MANDATORY is true. Exiting."
      exit 1
    fi
  }
else
  echo "Migrations are disabled (DB_MIGRATIONS_RUN=false). Skipping backup."
fi

echo "Starting application..."
exec node dist/src/main.js
