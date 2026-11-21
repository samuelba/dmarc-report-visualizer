---
title: IP lookup
description: Which provider fills in country, city, ISP, and organization, and what the defaults really are.
sidebar:
  order: 43
---

Lookups run on a queue (about once a second) while a report is parsed. They do not block the import. Private addresses are skipped.

There is no IP lookup screen. The provider is read at startup. `PUT /api/ip-lookup/config` can change it until the next restart. The UI does not call that route.

## Providers

| Name | What it is | Limit in the app |
| --- | --- | --- |
| `geoip-lite` | Local MaxMind data shipped with the server. No ISP or organization. | none |
| `ip-api` | `http://ip-api.com` | 45 per minute |
| `iplocate` | HTTPS, API key, including the free tier | 1,000 per day |
| `ipapi-co` | HTTPS. A key removes the app-side cap. | 1,000 per day without a key |
| `ipwhois` | `http://ipwho.is`. A key removes the app-side cap. | 10,000 per month without a key |

If the variables are unset, the code uses `geoip-lite`, no fallbacks, cache 30 days, cache on. Compose and `.env.sample` set primary `ip-api`, fallbacks `ipwhois,ip-api,ipapi-co,geoip-lite`, cache 14 days. To use `iplocate`, set `IP_LOOKUP_PROVIDER=iplocate` and `IPLOCATE_API_KEY`.

When the primary is rate-limited, the next fallback is tried right away, skipping `geoip-lite`. If that fallback is rate-limited too, the lookup stops and the queue retries it later. After three failures for an address, `geoip-lite` is used as the last resort.

`IP_LOOKUP_USE_CACHE` defaults to on and is not passed by Compose. `false`, `0`, or `no` turns it off. Cache rows live in `ip_locations` (country, region, city, coordinates, timezone, ISP, organization). A row is reused for `IP_LOOKUP_CACHE_DAYS` after it was first stored. Each DMARC record stores country, city, coordinates, ISP, and organization. It does not store region or timezone.
