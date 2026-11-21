---
title: Local accounts
description: Passwords, TOTP, and recovery codes.
sidebar:
  order: 30
---

The first account is created at `/setup` while the user table is empty. See [Quick start](/dmarc-visualizer/docs/getting-started/quick-start/). After that, `/setup` redirects to login.

Sign-in is email and password. Routes: `/login`, `/totp-verification` when 2FA is on, and `/auth/callback` after SAML.

## Password

At least 12 characters, one uppercase letter, one lowercase letter, one digit, and one character from `!@#$%^&*()-_+=?.,:;<>/`. Other characters, including spaces, fail the check. Passwords are bcrypt. `BCRYPT_ROUNDS` defaults to 10.

## Two-factor authentication

TOTP, SHA1, 6 digits, 30 second step (`TOTP_STEP`), window `TOTP_WINDOW` (default 3). The issuer in the authenticator app is `TOTP_ISSUER` (default `DMARC Dashboard`).

Turning it on shows 10 recovery codes once, shaped like `XXXX-XXXX-XXXX-XXXX`, using `A-Z` and `0-9`. They are stored as bcrypt hashes. Each code works once. Regenerating codes, or turning 2FA off, deletes them. The profile shows how many are left, for accounts that are not SAML. SAML users are told that 2FA is the identity provider's job.

The password step sets a `totpTempToken` cookie for 5 minutes. Access tokens last `JWT_ACCESS_EXPIRATION` (15 minutes in Compose). Refresh tokens last `JWT_REFRESH_EXPIRATION` (30 days in Compose, 7 days if the variable is unset).

Extra limits, not the login counters: TOTP verify 5 per 15 minutes, recovery codes 3 per 15 minutes, TOTP setup 10 per hour.

Store `TOTP_ENCRYPTION_KEY` before you rely on 2FA. Rotation is in [Secrets](/dmarc-visualizer/docs/deployment/secrets/).
