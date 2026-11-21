---
title: Secrets
description: What JWT_SECRET, TOTP_ENCRYPTION_KEY, and SMTP_ENCRYPTION_KEY protect, and how to rotate them.
sidebar:
  order: 17
---

Generate `JWT_SECRET` before the first start. Generate the other two before you rely on 2FA or saved SMTP credentials. Store all three with your database backups. Do not commit `.env`.

| Variable | Required | Protects |
| --- | --- | --- |
| `JWT_SECRET` | yes, or the process throws | Session cookies. Also stored 2FA secrets while `TOTP_ENCRYPTION_KEY` is unset. |
| `TOTP_ENCRYPTION_KEY` | recommended | Stored 2FA secrets. |
| `SMTP_ENCRYPTION_KEY` | before you save an SMTP password | The SMTP password saved in the database. Compose passes a placeholder when this is unset or empty, so the default stack still boots. The process throws if the value that reaches it is empty. |

```bash
openssl rand -base64 48
```

`JWT_SECRET` must be set or the process throws. The sample placeholder, and any secret shorter than 32 characters, is logged as weak but does not stop startup. Anyone with the secret can mint a session for any user.

From `JWT_SECRET` the backend derives separate keys for the access cookie, the refresh cookie, and the short token between the password step and the 2FA code. A token of one type is not accepted as another.

## TOTP_ENCRYPTION_KEY

Optional until you set it. After the first start that has it, stored 2FA secrets are re-encrypted and the key is required from then on. A missing or different key refuses to start, instead of locking people out. It must be at least 32 characters and different from `JWT_SECRET`.

Do not change `JWT_SECRET` in the same restart that first sets `TOTP_ENCRYPTION_KEY`. Re-encryption still needs the old `JWT_SECRET` to read the current secrets. Changing `TOTP_ENCRYPTION_KEY` itself is not supported. The process accepts one key.

## SMTP_ENCRYPTION_KEY

Compose falls back to `your-smtp-encryption-key` when this is unset or empty. That value is public, so the backend logs a warning, as it does for any key shorter than 32 characters. Only an empty key stops startup. Set a real value before you save an SMTP password. After you change the key, open **Settings → SMTP Email** and enter the password again. Nothing else uses this key. The invitation queue is separate. See [SMTP](/dmarc-visualizer/docs/authentication/smtp/).

## Changing JWT_SECRET

Do this when the secret has leaked or is still the sample value. Every user is signed out.

### The key is already set

1. If `TOTP_ENCRYPTION_KEY` is not set yet, set it and restart **with the old** `JWT_SECRET`. Wait until the log no longer warns that the key is missing. If anyone has 2FA, it also logs how many secrets were re-encrypted.
2. Put the new `JWT_SECRET` in `.env` and restart.

2FA keeps working.

### The old JWT_SECRET is gone

Stored 2FA secrets cannot be decrypted. Users who enrolled 2FA can still use a recovery code once, but they cannot turn 2FA off themselves, because that asks for a current code.

1. Take a [backup](/dmarc-visualizer/docs/deployment/backups/).
2. List the affected accounts:

   ```bash
   docker exec dmarc-postgres psql -U postgres -d dmarc \
     -c "SELECT email FROM users WHERE totp_enabled;"
   ```

3. Set the new `JWT_SECRET` and restart.
4. Clear 2FA so those people can sign in with a password and enroll again:

   ```bash
   docker exec dmarc-postgres psql -U postgres -d dmarc -c "
     BEGIN;
     DELETE FROM recovery_codes WHERE user_id IN (SELECT id FROM users WHERE totp_enabled);
     UPDATE users SET totp_secret = NULL, totp_enabled = false,
       totp_enabled_at = NULL, totp_last_used_at = NULL
       WHERE totp_enabled;
     COMMIT;"
   ```

5. Tell them to enroll again from their profile.

Use your own container name, user, and database if you changed `POSTGRES_*`.

## Older releases

The release that introduced `TOTP_ENCRYPTION_KEY` also changed how the SMTP password is stored. Older images cannot read the new ciphertext. That release had no migration, so the automatic backup did not run. Take a backup yourself before upgrading into it. Rolling back means restoring that backup. Otherwise the SMTP password has to be entered again and, if `TOTP_ENCRYPTION_KEY` was set, 2FA stops working.
