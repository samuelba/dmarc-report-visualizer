---
title: MCP
description: Let an assistant read your DMARC data with a personal token.
sidebar:
  order: 44
---

The MCP server answers read-only questions, for example which sources failed DKIM this month. It speaks [Model Context Protocol](https://modelcontextprotocol.io) over Streamable HTTP at `/api/mcp`.

It is off until `MCP_ENABLED` is `true` (any case). Anything else, including unset, means `/api/mcp` and the token routes are not registered, and the Profile section and **Settings → API Tokens** are hidden. Rows already in `api_tokens` stay in the database.

## Create a token

**Profile → API Tokens (MCP) → Create token.** Name, expiry (7, 30, 90, 180, or 365 days, default 90), and whether the token may read raw report XML. The token is `dmarc_pat_` plus 43 URL-safe characters. It is shown once and stored as a SHA-256 hash. A user can have 25 active tokens. The form always offers the same five choices. A choice longer than `API_TOKEN_MAX_TTL_DAYS` (default 365) is rejected when you save. **Revoke all** removes every token of your own at once.

Administrators can list and revoke every token under **Settings → API Tokens**.

A token can read what that user can read in the UI. It works only on `/api/mcp`. The rest of the API ignores it, and `/api/mcp` does not accept the login cookie.

Creating, listing, and revoking tokens in the browser is rejected unless `Sec-Fetch-Site` is `same-origin` or `none`. A browser that sends no `Sec-Fetch-Site` is checked by its `Origin` instead. That check is not applied to login or to `/api/mcp` itself.

## Connect a client

The dialog prints a Claude Code command. The host is the site you have open:

```bash
claude mcp add --transport http dmarc https://dmarc.example.com/api/mcp \
  --header "Authorization: Bearer dmarc_pat_..."
```

Other clients use the same URL and the same `Authorization` header. `GET /api/mcp` with a valid token returns 405, and without one 401. The transport is HTTP, not a browser page. Batch requests are rejected.

Non-browser clients send no `Origin` and need nothing in `MCP_ALLOWED_ORIGINS`. A browser client's origin must be in `CORS_ORIGINS`. `MCP_ALLOWED_ORIGINS` alone is not enough, because the browser's CORS preflight only allows `CORS_ORIGINS`.

`MCP_RATE_LIMIT_PER_MIN` (default 60) is per user, across that user's tokens. Ten invalid tokens from one IP in five minutes locks that IP for 15 minutes. Both counters are in memory. A value of `MCP_RATE_LIMIT_PER_MIN` or `API_TOKEN_MAX_TTL_DAYS` outside its allowed range stops the backend at startup.

## Tools

Every call is written to the audit log.

| Tool | Returns |
| --- | --- |
| `list_domains` | Managed domains, and the domains reports were received for |
| `get_domain_overview` | Volume and DMARC, DKIM, and SPF pass rates per domain over the last N days |
| `get_summary` | Totals for a period: reports, messages, sources, pass and fail counts |
| `get_auth_breakdown` | DKIM and SPF outcomes, plus the DKIM × SPF matrix |
| `get_timeseries` | Daily or weekly volume, pass rates, or dispositions |
| `get_top_sources` | Top senders by source IP, country, or From domain |
| `get_new_ips` | Source IPs first seen in a period |
| `search_records` | Records matching filters, for example failing DKIM or quarantined |
| `list_reports` | Aggregate reports for a period |
| `get_report` | One report and its records |
| `get_record` | One record with DKIM, SPF, and policy override details |
| `get_ip_info` | Stored geolocation for an IP. It never starts a new lookup. |
| `get_report_xml` | Raw report XML, up to 64,000 characters. Only for tokens allowed to read raw XML. |

Two prompts are included: `weekly_review` and `policy_readiness`.
