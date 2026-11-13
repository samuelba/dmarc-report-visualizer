# Authentication Deployment Checklist

This checklist covers what to configure and verify before running the dashboard in production, with its built-in authentication exposed to the internet.

## Before the first start

### 1. Secrets

Generate `JWT_SECRET`, `TOTP_ENCRYPTION_KEY` and `SMTP_ENCRYPTION_KEY` before the first start. [SECRETS.md](SECRETS.md) explains what each protects and what changing one later affects.

- [ ] Generate each secret with `openssl rand -base64 48` and set it in `.env`
- [ ] Store them in a password manager or secrets manager, together with your database backups
- [ ] Never commit `.env` to version control
- [ ] After the first start, check the backend log for `JWT_SECRET`, `TOTP_ENCRYPTION_KEY` and `SMTP_ENCRYPTION_KEY` warnings

### 2. HTTPS

Authentication cookies must only travel over HTTPS. Put a reverse proxy with TLS in front of the frontend and backend.

- [ ] Obtain a TLS certificate (for example from Let's Encrypt)
- [ ] Configure the reverse proxy with TLS 1.2 or higher
- [ ] Redirect HTTP to HTTPS
- [ ] Enable HSTS
- [ ] Test the configuration, for example with [SSL Labs](https://www.ssllabs.com/ssltest/)

Example nginx configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

### 3. Cookies

The backend sets the `accessToken` and `refreshToken` cookies itself:

- `HttpOnly` always, so page scripts cannot read them.
- `Secure` when `COOKIE_SECURE=true`. It defaults to `true` when `NODE_ENV=production`, which is the default in `docker-compose.yml`.
- `SameSite=Strict` when `NODE_ENV=production`, otherwise `SameSite=Lax`.
- `Domain` only when `COOKIE_DOMAIN` is set. Leave it unset unless the frontend and backend are served from different subdomains.

```bash
NODE_ENV=production
COOKIE_SECURE=true
# COOKIE_DOMAIN=yourdomain.com
```

- [ ] `NODE_ENV=production`
- [ ] `COOKIE_SECURE=true` (sign-in fails over plain HTTP with this setting, which is intended)

### 4. CORS

CORS controls which other websites may read API responses in a browser. With the bundled frontend container, the browser calls the API through the same origin (`/api` is proxied by the frontend's nginx), so CORS does not affect normal use. It still matters for any page served from another origin.

`docker-compose.yml` defaults `CORS_ORIGINS` to `http://localhost`, which allows no other website. A backend started without the variable at all accepts any origin. Set it to the URL(s) the frontend is served from:

```bash
# Single origin
CORS_ORIGINS=https://yourdomain.com

# Multiple origins (comma-separated)
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

- [ ] `CORS_ORIGINS` lists only your frontend URL(s)

### 5. Rate limiting

Login attempts are limited per IP address and per account:

| Variable | Default | Meaning |
| --- | --- | --- |
| `RATE_LIMIT_IP_MAX_ATTEMPTS` | `10` | Failed attempts per IP address per window |
| `RATE_LIMIT_IP_WINDOW_MS` | `300000` | IP window (5 minutes) |
| `RATE_LIMIT_ACCOUNT_MAX_ATTEMPTS` | `5` | Failed attempts per account before it is locked |
| `RATE_LIMIT_ACCOUNT_WINDOW_MS` | `300000` | Account window (5 minutes) |
| `RATE_LIMIT_LOCK_DURATION_MS` | `900000` | Account lock duration (15 minutes) |

2FA verification, 2FA setup and recovery codes have their own fixed limits.

The counters are kept in memory in the backend process. They reset when the backend restarts and are not shared between instances, so run a single backend instance. Redis, when enabled, is used for SAML and the email queue, not for these limits.

### 6. Password hashing

Passwords are hashed with bcrypt. `BCRYPT_ROUNDS` defaults to `10`. Each additional round roughly doubles the time per login, so only raise it after checking login times on your hardware.

### 7. Token lifetimes

```bash
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=30d
```

`docker-compose.yml` and `.env.sample` use `15m` and `30d`. If a variable is not set at all, the backend falls back to `15m` and `7d`. Values use a number and one unit: `s`, `m`, `h` or `d`.

The access token lifetime is the longest a session stays usable after logout or a password change, because access tokens are not checked against the database. Keep it short.

### 8. Database

- [ ] Set a strong `POSTGRES_PASSWORD` instead of the `.env.sample` value
- [ ] Do not expose the Postgres port (`POSTGRES_PORT`, published by `docker-compose.yml`) to the internet; restrict it with a firewall or remove the `ports` entry if nothing outside Docker needs it

The backend connects with `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` and `DATABASE_NAME`.

### 9. Token theft detection

When a refresh token that was already replaced is used again, the backend treats it as stolen.

| `THEFT_DETECTION_ENABLED` | `THEFT_DETECTION_INVALIDATE_FAMILY` | Behaviour |
| --- | --- | --- |
| `true` (default) | `true` (default) | Log the event and sign out every session derived from that login, so both the attacker and the user have to sign in again |
| `true` | `false` | Log the event only |
| `false` | — | No detection; a reused token is rejected like any invalid one |

Keep the defaults unless they cause problems. Log-only mode is useful for a short period if you want to see how often detection triggers first.

The backend logs:

- `Token theft detected` (error), with `userId`, `familyId`, `tokenId`, `originalRevocationReason`, `ipAddress` and `timestamp`
- `Token family invalidated due to theft detection` (warning), with `familyId` and `tokensInvalidated`

The client receives a 401 response with the error code `SESSION_COMPROMISED`.

Frequent detections usually come from duplicate refresh requests, for example from several open tabs, browser extensions, or a proxy that retries requests. Check the IP addresses in the log to tell those apart from real theft.

## Deploying and upgrading

1. Back up the database. The backend backs up automatically before it runs pending migrations, but not when a release has none (see [BACKUP_SYSTEM.md](BACKUP_SYSTEM.md)).
2. Read the release notes for upgrade steps.
3. Pull and start the new images:

   ```bash
   docker compose pull
   docker compose up -d
   ```

   Migrations run automatically at startup (`DB_MIGRATIONS_RUN=true`).
4. Check the backend log for startup errors and warnings.

After the first deployment:

- [ ] The frontend redirects to the setup page; create the initial administrator
- [ ] Log out and log back in
- [ ] Set up 2FA on a test account and sign in with it
- [ ] Wrong passwords are rejected and eventually rate limited
- [ ] You stay signed in for longer than the access token lifetime (the session is refreshed)
- [ ] Logout works

## Monitoring

- [ ] Alert on `Token theft detected` log entries and investigate each one
- [ ] Watch for repeated failed logins and account locks
- [ ] Monitor that the backend and frontend containers are running

## Incident response

**A secret leaked.** Follow [SECRETS.md](SECRETS.md). For `JWT_SECRET`, set `TOTP_ENCRYPTION_KEY` first if it is not set yet, so 2FA keeps working.

**Token theft was detected.**

1. Find the affected user (`userId`) and IP addresses in the log.
2. Check whether the same user or IP address shows up repeatedly.
3. If the theft looks real, contact the user, have them change their password, and review their recent activity.
4. If it is a false positive, look for duplicate refresh requests (see [Token theft detection](#9-token-theft-detection)).

## Troubleshooting

**Users cannot sign in.**

- Check the backend log for errors.
- With `COOKIE_SECURE=true`, sign-in only works over HTTPS.
- If the frontend is served from a different origin than the API (not the bundled setup), check that `CORS_ORIGINS` contains the frontend's URL.
- An account locked by rate limiting unlocks after `RATE_LIMIT_LOCK_DURATION_MS`, or when the backend restarts.

**The backend refuses to start with a `TOTP_ENCRYPTION_KEY` error.** The key is missing or differs from the one used to encrypt the stored 2FA secrets. Restore the previous value; see [SECRETS.md](SECRETS.md).

**Users are signed out unexpectedly.** Check the log for token theft detection events for that user, and whether a release or a `JWT_SECRET` change signed everyone out.

## Rolling back

1. Stop the backend.
2. Restore the database backup taken before the upgrade (see [BACKUP_SYSTEM.md](BACKUP_SYSTEM.md)).
3. Start the previous image version.

Check the release notes and [SECRETS.md](SECRETS.md#upgrading-and-rolling-back): some releases change stored data in a way older versions cannot read, so rolling back without restoring the backup is not always possible.

## Further reading

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [JWT Best Current Practices (RFC 8725)](https://www.rfc-editor.org/rfc/rfc8725)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
