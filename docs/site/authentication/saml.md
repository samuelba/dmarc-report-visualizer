---
title: SAML
description: Turn on SAML in the UI, and which environment variables the container must actually receive.
sidebar:
  order: 31
---

SAML is not switched on by an environment variable. An administrator opens **Settings → SAML/SSO** and uploads the IdP metadata XML file, or enters an entity ID, SSO URL, and certificate by hand. A new configuration is saved disabled until you enable it.

Saving, and `GET /api/auth/saml/metadata`, throws unless `SAML_ENTITY_ID` and `SAML_ACS_URL` are non-empty **inside the container**. The stock `docker-compose.yml` comments those lines out, and also comments out `FRONTEND_URL`. A value that exists only in `.env` is not passed. Uncomment them, or use the [Traefik](/dmarc-visualizer/docs/deployment/traefik/) example, which passes them.

| Variable | What to set |
| --- | --- |
| `SAML_ENTITY_ID` | A stable name for this app, for example `dmarc-app`. |
| `SAML_ACS_URL` | `https://<your host>/api/auth/saml/callback` |
| `FRONTEND_URL` | `https://<your host>` with no trailing slash. After login the API redirects to `${FRONTEND_URL}/auth/callback`. Unset, that default is `http://localhost:4200`. |
| `SAML_DISABLE_SIGNATURE_VALIDATION` | Leave unset. Exactly `true` turns signature checks off. This variable is not in `docker-compose.yml` at all. Add it to the backend `environment:` block only for a lab. |
| `FORCE_ENABLE_PASSWORD_LOGIN` | Exactly `true` keeps the password form even when the database setting hides it. Also not in the stock Compose file. The UI shows that the override is on. |

`GET /api/auth/saml/metadata` is public and returns the service provider XML (entity ID, email NameID, ACS URL). The login URL is `GET /api/auth/saml/login`. The ACS is `POST /api/auth/saml/callback`.

## Redis

Redis is optional for login. If `REDIS_HOST` is unset, the app does not connect, SAML login still works, and the log says assertion replay protection is off. A failed Redis connection does the same rather than stopping startup. When Redis is up, a used assertion is remembered until its `NotOnOrAfter` time, or for 24 hours if it has none.

**Test SAML Login** on the settings page needs Redis. It runs the login in a pop-up without enabling SAML for everyone. Without Redis the test always ends with "SAML test session expired or invalid".

To turn Redis on, follow [Enable Redis](/dmarc-visualizer/docs/deployment/docker-compose/#enable-redis). `docker-compose.dev.yml` already starts it.

## Accounts

The first SAML login for an email creates the account with the User role. Promote it in **Users** if needed. An email that already belongs to a local password account is rejected. Password login can only be hidden while SAML is enabled and at least one administrator signs in through SAML.

The identity provider is whatever speaks SAML 2.0. The app does not ship Authentik or Keycloak config.

SAML users do not get an app-side TOTP.

Turning SAML off does not bring the password form back. If password login is hidden, show it again before you disable SAML, or nobody can sign in. `FORCE_ENABLE_PASSWORD_LOGIN=true` is the escape hatch if that happens.
