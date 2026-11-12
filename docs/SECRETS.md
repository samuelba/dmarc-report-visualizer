# Secrets

The backend uses three secrets. This page explains what each one protects, how to choose it, and what happens if you change it.

| Variable | Required | Protects |
| --- | --- | --- |
| `JWT_SECRET` | Yes | Sign-in sessions (and 2FA secrets while `TOTP_ENCRYPTION_KEY` is not set) |
| `TOTP_ENCRYPTION_KEY` | Recommended | Users' stored 2FA (TOTP) secrets |
| `SMTP_ENCRYPTION_KEY` | Yes | The stored SMTP password |

Generate each one **before the first start** and set it in your `.env`:

```bash
openssl rand -base64 48
```

Store them like passwords, for example in a password manager or secrets manager, keep them together with your database backups, and never commit your `.env`.

## `JWT_SECRET`

The backend refuses to start without `JWT_SECRET`. It logs an error at startup if the secret is still the example value from `.env.sample` or is shorter than 32 characters. Anyone who knows the secret can sign in as any user, including administrators, so never use the example value.

The backend derives these keys from `JWT_SECRET`:

| Key | Used for |
| --- | --- |
| Access token key | Signing the `accessToken` cookie |
| Refresh token key | Signing the `refreshToken` cookie |
| 2FA login key | Signing the short-lived token between the password step and the 2FA code |
| 2FA encryption key, **only while `TOTP_ENCRYPTION_KEY` is not set** | Encrypting users' stored 2FA secrets in the database |

Each token type has its own key, so a token of one type is never accepted where another type is expected. There is nothing extra to configure for this.

## `TOTP_ENCRYPTION_KEY`

`TOTP_ENCRYPTION_KEY` is optional but recommended. When it is set, stored 2FA secrets are encrypted with it instead of with a key derived from `JWT_SECRET`, so you can change `JWT_SECRET` later without breaking 2FA.

- **Without it**, nothing changes: 2FA works as before, and the backend logs a warning at every start that recommends setting it.
- **On the first start with it**, the backend re-encrypts all existing 2FA secrets. Users notice nothing. The log shows `Re-encrypted N stored 2FA secret(s) with TOTP_ENCRYPTION_KEY`.
- **From then on it is required.** If it is missing or different, the backend refuses to start with an explanation, instead of locking 2FA users out. Keep it with your database backups: a backup restored without the key cannot be used for 2FA sign-in.
- **Do not change `JWT_SECRET` in the same restart** in which you first set `TOTP_ENCRYPTION_KEY`. The re-encryption needs the current `JWT_SECRET` to read the existing secrets.
- **Changing `TOTP_ENCRYPTION_KEY` itself is not supported**: the backend accepts one key at a time.

It must be at least 32 characters and different from `JWT_SECRET`, otherwise the backend refuses to start.

## `SMTP_ENCRYPTION_KEY`

The stored SMTP password is encrypted with a key derived from `SMTP_ENCRYPTION_KEY`. The backend logs a warning at startup if the key is a publicly known example value or shorter than 32 characters. If `SMTP_ENCRYPTION_KEY` is not set, `docker-compose.yml` falls back to such an example value.

After changing `SMTP_ENCRYPTION_KEY`, re-enter the SMTP password in the SMTP settings: the stored one can no longer be decrypted, and the backend logs an error saying so. Nothing else is affected. See [EMAIL_SMTP.md](EMAIL_SMTP.md) for the SMTP setup.

## Changing `JWT_SECRET`

Only change `JWT_SECRET` when it has leaked or is weak. The backend accepts one secret at a time, so every user is signed out and has to sign in again.

### With `TOTP_ENCRYPTION_KEY` (recommended)

2FA is not affected.

1. If `TOTP_ENCRYPTION_KEY` is not set yet, set it and restart the backend **with the old `JWT_SECRET`**. Check that the log no longer shows the `TOTP_ENCRYPTION_KEY is not set` warning. If users have 2FA, it also shows `Re-encrypted N stored 2FA secret(s) with TOTP_ENCRYPTION_KEY`.
2. Generate a new secret, set it as `JWT_SECRET`, and restart the backend.

### Without `TOTP_ENCRYPTION_KEY`

Only use this if you cannot follow the steps above, for example because the old `JWT_SECRET` is lost. Every 2FA enrolment stops working, because the stored 2FA secrets can no longer be decrypted. Affected users can still sign in once with a recovery code, but they cannot disable or re-enroll 2FA themselves, because that requires a valid 2FA code.

1. Back up the database (see [BACKUP_SYSTEM.md](BACKUP_SYSTEM.md)).
2. List the users who have 2FA enabled, so you can tell them to set it up again:

   ```bash
   docker exec dmarc-postgres psql -U postgres -d dmarc \
     -c "SELECT email FROM users WHERE totp_enabled;"
   ```

3. Generate a new secret, set it as `JWT_SECRET`, and restart the backend.
4. Reset 2FA for those users, so they can sign in with their password and enroll again:

   ```bash
   docker exec dmarc-postgres psql -U postgres -d dmarc -c "
     BEGIN;
     DELETE FROM recovery_codes WHERE user_id IN (SELECT id FROM users WHERE totp_enabled);
     UPDATE users SET totp_secret = NULL, totp_enabled = false,
       totp_enabled_at = NULL, totp_last_used_at = NULL
       WHERE totp_enabled;
     COMMIT;"
   ```

5. Tell those users to set up 2FA again from their profile.

Adjust the container name, user and database to your `POSTGRES_*` settings.

## Upgrading and rolling back

Starting with the release that introduced `TOTP_ENCRYPTION_KEY`, stored secrets use a new encrypted format that older versions cannot read. The SMTP password is converted on the first start; 2FA secrets are converted once `TOTP_ENCRYPTION_KEY` is set.

That release has no database migrations, so the automatic backup does not run. Take a backup yourself before upgrading (see [BACKUP_SYSTEM.md](BACKUP_SYSTEM.md)). To roll back to an older version, restore that backup; otherwise the SMTP password has to be re-entered and, if `TOTP_ENCRYPTION_KEY` was set, 2FA stops working.
