# Database Backup System

This document describes the automatic database backup system that runs before migrations.

## Overview

The DMARC backend application automatically creates database backups before running any pending migrations. This safety feature helps prevent data loss during schema changes.

## Features

- **Automatic Backup**: Creates a backup before migrations run
- **Smart Detection**: Only backs up when pending migrations exist
- **Retention Policy**: Automatically cleans old backups (keeps 10 by default)
- **Configurable**: Multiple environment variables for customization
- **Safe by Default**: Migrations are blocked if backup fails (configurable)

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_DIR` | `/app/backups` (Docker)<br>`./backups` (local) | Directory where backups are stored |
| `BACKUP_MANDATORY` | `true` | If `true`, application exits if backup fails |
| `BACKUP_KEEP_COUNT` | `10` | Number of recent backups to retain |
| `DB_MIGRATIONS_RUN` | `true` | Enable/disable automatic migrations (and backup) |

### Docker Configuration

The `docker-compose.yml` file mounts the backups directory:

```yaml
volumes:
  - ./backups:/app/backups
```

Backups are stored on the host machine at `./backups` and are persisted across container restarts.

## Usage

### Automatic Backup (Default)

When the backend starts with Docker:

1. The application checks for pending migrations
2. If migrations exist, creates a timestamped backup
3. Runs the migrations
4. Starts the application

No action required - this happens automatically!

### Manual Backup

To create a backup manually:

#### Using the Helper Script (Recommended)

```bash
# From the backend directory
./run-backup.sh
```

This script automatically:
- Loads environment variables from `.env`
- Overrides `DATABASE_HOST=localhost` for local access
- Runs the backup

#### Manual Environment Loading

```bash
# Inside the backend directory
# Load environment and override host
export $(cat ../.env | grep -v '^#' | xargs)
export DATABASE_HOST=localhost
npm run backup
```

**Note**: When running locally, you must use `DATABASE_HOST=localhost` because the `dmarc-postgres` hostname only exists inside the Docker network.

### Running Migrations Safely (Local Development)

```bash
# Using the helper script (recommended)
cd backend
./run-backup.sh  # This will backup if needed

# Then run migrations manually
export $(cat ../.env | grep -v '^#' | xargs)
export DATABASE_HOST=localhost
npm run migrate
```

Or use the built-in npm script:

```bash
# Backup + migrate in one command (requires environment to be set)
export $(cat ../.env | grep -v '^#' | xargs)
export DATABASE_HOST=localhost
npm run migrate:safe
```

## Backup File Format

Backups are stored as gzip-compressed SQL files with timestamps:

```
backups/
  ├── backup_dmarc_2025-10-18T10-30-45-123Z.sql.gz
  ├── backup_dmarc_2025-10-17T09-15-22-456Z.sql.gz
  └── backup_dmarc_2025-10-16T14-22-33-789Z.sql.gz
```

The gzip compression typically reduces backup size by 80-90%.

## Restoring from Backup

To restore a database from a backup:

### Using Docker

```bash
# Copy the backup file to the postgres container
docker cp backups/backup_dmarc_2025-10-18T10-30-45-123Z.sql.gz dmarc-postgres:/tmp/backup.sql.gz

# Connect to postgres and restore
docker exec -i dmarc-postgres psql -U postgres -d dmarc < <(docker exec -i dmarc-postgres gunzip -c /tmp/backup.sql.gz)

# Or in two steps:
docker exec dmarc-postgres gunzip /tmp/backup.sql.gz
docker exec -i dmarc-postgres psql -U postgres -d dmarc -f /tmp/backup.sql
```

### Local Development

```bash
# Restore directly from compressed file
gunzip -c backups/backup_dmarc_2025-10-18T10-30-45-123Z.sql.gz | psql -U postgres -d dmarc

# Or decompress first, then restore
gunzip backups/backup_dmarc_2025-10-18T10-30-45-123Z.sql.gz
psql -U postgres -d dmarc -f backups/backup_dmarc_2025-10-18T10-30-45-123Z.sql
```

## Disabling Backups

### Temporarily Disable (for development)

Set `BACKUP_MANDATORY=false` to continue even if backup fails:

```bash
export BACKUP_MANDATORY=false
```

### Completely Disable

Set `DB_MIGRATIONS_RUN=false` to disable migrations (and backups):

```bash
export DB_MIGRATIONS_RUN=false
```

## Troubleshooting

### "pg_dump: command not found"

The Docker image includes `postgresql-client`. If running locally, install PostgreSQL client tools:

```bash
# Ubuntu/Debian
sudo apt-get install postgresql-client

# macOS
brew install postgresql

# Alpine Linux
apk add postgresql-client
```

### Backup Directory Permission Issues

Ensure the directory is writable:

```bash
mkdir -p backups
chmod 755 backups
```

### Disk Space Issues

Monitor backup directory size and adjust `BACKUP_KEEP_COUNT` as needed:

```bash
# Check backup directory size
du -sh backups/

# Reduce retention to 5 backups
export BACKUP_KEEP_COUNT=5
```

## Security Considerations

1. **Backup Security**: Backups contain sensitive data. Ensure proper file permissions:
   ```bash
   chmod 600 backups/*.sql
   ```

2. **Access Control**: Restrict access to the backups directory
3. **Off-site Backups**: Consider copying critical backups to a secure location
4. **Encryption**: For production, consider encrypting backup files

## Architecture

### Components

1. **`pre-migration-backup.ts`**: TypeScript script that creates backups
2. **`docker-entrypoint.sh`**: Shell script that orchestrates startup
3. **Dockerfile**: Includes `postgresql-client` for pg_dump
4. **docker-compose.yml**: Mounts backup volume

### Execution Flow

```
Container Start
    ↓
docker-entrypoint.sh
    ↓
Check DB_MIGRATIONS_RUN
    ↓
[If enabled]
    ↓
Run pre-migration-backup.ts
    ↓
Check for pending migrations
    ↓
[If pending]
    ↓
Create backup with pg_dump
    ↓
Clean old backups
    ↓
[If backup successful or BACKUP_MANDATORY=false]
    ↓
Start Application (migrations run automatically via TypeORM)
```

## Best Practices

1. **Regular Testing**: Periodically test backup restoration
2. **Monitor Size**: Watch backup directory size in production
3. **Off-site Storage**: Copy important backups to external storage
4. **Retention Policy**: Adjust `BACKUP_KEEP_COUNT` based on your needs
5. **Documentation**: Document your backup/restore procedures

## Examples

### Production Setup

```yaml
# docker-compose.yml or .env
environment:
  BACKUP_DIR: /app/backups
  BACKUP_MANDATORY: true
  BACKUP_KEEP_COUNT: 30  # Keep 30 days of backups
  DB_MIGRATIONS_RUN: true
```

### Development Setup

```yaml
# docker-compose.override.yml
environment:
  BACKUP_MANDATORY: false  # Don't block on backup failure
  BACKUP_KEEP_COUNT: 5     # Keep fewer backups
```

## Support

If you encounter issues with the backup system:

1. Check the application logs for backup-related messages
2. Verify `pg_dump` is available: `which pg_dump`
3. Confirm database connectivity
4. Check disk space: `df -h`
