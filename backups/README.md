# Database Backups Directory

This directory stores automatic database backups created before migrations.

## Contents

Database backups are created with the naming pattern:
```
backup_<database-name>_<timestamp>.sql.gz
```

Example:
```
backup_dmarc_2025-10-18T10-30-45-123Z.sql.gz
```

## Automatic Cleanup

The system automatically retains only the most recent backups (default: 10). Older backups are automatically deleted to save disk space.

## Storage Location

- **Docker**: This directory is mounted from the host to `/app/backups` in the container
- **Local**: Backups are stored in `backend/backups/` by default

## Security

⚠️ **Important**: Backup files contain sensitive database information. Ensure:
- Proper file permissions (600 recommended)
- This directory is excluded from version control
- Access is restricted to authorized personnel only

## More Information

See [BACKUP_SYSTEM.md](../BACKUP_SYSTEM.md) for complete documentation.
