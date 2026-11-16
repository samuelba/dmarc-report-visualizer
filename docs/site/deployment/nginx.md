---
title: nginx
description: Put another nginx in front of the bundled one.
sidebar:
  order: 13
---

Publish the frontend only on localhost and let the host nginx terminate TLS:

```yaml
# frontend service
ports:
  - "127.0.0.1:8080:80"
```

```nginx
server {
  listen 443 ssl;
  http2 on;
  server_name dmarc.example.com;

  # ssl_certificate and ssl_certificate_key here

  client_max_body_size 10m;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

nginx accepts 1 MiB request bodies unless told otherwise, so without `client_max_body_size` larger uploads fail with `413` before they reach the container. The bundled nginx has a fixed 10 MiB cap of its own, so raising `REPORT_MAX_FILE_BYTES` does not allow larger browser uploads either way.

There are two proxies (this nginx, then the container nginx), so `TRUST_PROXY=2`. Set `COOKIE_SECURE=true` and `CORS_ORIGINS=https://dmarc.example.com`. Do not add a trailing slash to the origin.

For SAML or invite links, set `FRONTEND_URL` to the same origin. The stock `docker-compose.yml` comments out `FRONTEND_URL`, `SAML_ENTITY_ID`, and `SAML_ACS_URL`, so uncomment those lines too, or the values in `.env` never reach the backend.

The bundled nginx sends security headers (HSTS, a content security policy, `X-Frame-Options: DENY`) on the app's HTML. A second copy on the outer nginx is harmless.

The image reads optional `HSTS_MAX_AGE`, `CSP_*`, `PERMISSIONS_POLICY`, and `REFERRER_POLICY` variables when the container starts. They are not in `docker-compose.yml`. Leave them unless you need to change the policy.
