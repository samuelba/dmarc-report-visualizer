# Secrets

The backend needs one secret from you, `JWT_SECRET`. This page explains what it protects, how to choose it, and what happens if you change it.

## `JWT_SECRET`

Generate it **before the first start** and set it in your `.env`:

```bash
openssl rand -base64 48
```

The backend refuses to start without `JWT_SECRET`. It logs an error at startup if the secret is still the example value from `.env.sample` or is shorter than 32 characters. Anyone who knows the secret can sign in as any user, including administrators, so never use the example value.

The backend derives these keys from `JWT_SECRET`:

| Key | Used for |
| --- | --- |
| Access token key | Signing the `accessToken` cookie |
| Refresh token key | Signing the `refreshToken` cookie |
| 2FA login key | Signing the short-lived token between the password step and the 2FA code |
| 2FA encryption key | Encrypting users' stored 2FA (TOTP) secrets in the database |

Each token type has its own key, so a token of one type is never accepted where another type is expected. There is nothing extra to configure for this.

Store `JWT_SECRET` like a password, for example in a password manager or secrets manager, and never commit your `.env`.

## Changing `JWT_SECRET`

Only change `JWT_SECRET` when it has leaked or is weak. The backend accepts one secret at a time, so a change has two effects:

- Every user is signed out and has to sign in again.
- Every 2FA enrolment stops working, because the stored 2FA secrets can no longer be decrypted. Affected users can still sign in once with a recovery code, but they cannot disable or re-enroll 2FA themselves, because that requires a valid 2FA code.

To change it anyway:

1. Back up the database (see [BACKUP_SYSTEM.md](BACKUP_SYSTEM.md)).
2. List the users who have 2FA enabled, so you can tell them to set it up again:

   ```bash
   docker exec dmarc-postgres psql -U postgres -d dmarc \
     -c "SELECT email FROM users WHERE totp_enabled;"
   ```

3. Generate a new secret (`openssl rand -base64 48`), set it as `JWT_SECRET`, and restart the backend.
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
