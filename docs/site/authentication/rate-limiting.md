---
title: Rate limiting
description: How TRUST_PROXY chooses the client IP used for login limits.
sidebar:
  order: 33
---

Login failures are counted in memory, per IP and per account. They are not in Redis, so a restart clears them. Defaults are in [Configuration](/dmarc-visualizer/docs/reference/configuration/): 10 failures per IP per 5 minutes, 5 per account per 5 minutes, then a 15 minute lock.

A successful login resets the account counter, not the IP counter. Failed invite-link checks and SMTP test emails count toward the same IP limit. The account limit is keyed by email, so anyone who knows an address can lock that account for 15 minutes, whatever `TRUST_PROXY` is.

The IP is Express `request.ip`. With `trust proxy` set, that comes from `X-Forwarded-For`, skipping the number of hops in `TRUST_PROXY`.

```text
browser -> frontend nginx -> backend                  TRUST_PROXY=1   (the stock stack)
browser -> Traefik -> frontend nginx -> backend       TRUST_PROXY=2
browser -> Caddy -> frontend nginx -> backend         TRUST_PROXY=2
browser -> cloudflared -> frontend nginx -> backend   TRUST_PROXY=2
```

`TRUST_PROXY` is unset or blank means 1. `false` ignores `X-Forwarded-For`, so every user shares the proxy's IP and one attacker can lock everyone out. `true` is rejected and the process does not start, because it would let the client pick their own IP. `0` is the same as `false`. A string that is not a number is passed through to Express as an address or subnet list.

Too low and all clients share one IP. Too high and a client can spoof the IP. Count only proxies you run.

In production, cookies are `SameSite=Strict`, so a page on another site does not send them. Login limits do not use the same-origin guard. That guard only covers the API-token routes. See [MCP](/dmarc-visualizer/docs/usage/mcp/).

`COOKIE_SECURE=true` means the browser stores the cookie only on HTTPS. On an HTTP site the `Set-Cookie` is dropped and login does not stick. `COOKIE_DOMAIN` must be the host the browser used, or empty.
