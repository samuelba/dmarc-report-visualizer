# MCP Server

The MCP server lets AI assistants such as Claude query your DMARC data in plain language, for example "which sources fail DKIM for example.com this month?" or "is example.com ready for `p=reject`?". It speaks the [Model Context Protocol](https://modelcontextprotocol.io) over Streamable HTTP at `/api/mcp`.

The server is **read-only** and **off by default**.

## Overview

- Read-only tools for statistics, sending sources, report and record details. Nothing can be changed through MCP
- Personal API tokens: each user creates their own on the Profile page. A token can read what its user can read in the web UI
- Tokens expire (90 days by default), can be revoked at any time, and are stored only as SHA-256 hashes
- Tokens work only on `/api/mcp`, never on the rest of the API, and the MCP endpoint never accepts the login cookie
- Every tool call is logged with token, user, tool and outcome

## Quick Start

1. Turn the feature on in your `.env` file and restart:
   ```env
   MCP_ENABLED=true
   ```
2. Open **Profile → API Tokens (MCP)** and click **Create token**. Give it a name, pick an expiry, and copy the token. It is shown only once.
3. Add the server to Claude Code with the command shown in the dialog:
   ```bash
   claude mcp add --transport http dmarc https://dmarc.example.com/api/mcp \
     --header "Authorization: Bearer dmarc_pat_..."
   ```
4. Ask Claude about your DMARC reports.

Other MCP clients connect to `https://<your host>/api/mcp` (Streamable HTTP) and send the header `Authorization: Bearer <token>`.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `MCP_ENABLED` | Turns the MCP server and API tokens on. Any value other than `true` leaves them out of the app entirely | `false` |
| `MCP_ALLOWED_ORIGINS` | Extra browser origins allowed to call `/api/mcp`, comma-separated. `CORS_ORIGINS` are always allowed | empty |
| `MCP_RATE_LIMIT_PER_MIN` | Requests per minute and token | `60` |
| `API_TOKEN_MAX_TTL_DAYS` | Longest token lifetime a user can choose | `365` |

### Turning it off

With `MCP_ENABLED` unset or `false`:

- `/api/mcp` and `/api/auth/api-tokens` do not exist (404), and Bearer tokens are not accepted anywhere
- The token section on the Profile page and the **API Tokens** settings tab are hidden
- Existing tokens stay in the `api_tokens` table but cannot be used. They work again when the feature is turned back on, unless they expired or were revoked. To make sure they never work again, revoke them before turning the feature off (**Settings → API Tokens**), or run `DELETE FROM api_tokens;` in the database

## Tools

| Tool | What it returns |
|---|---|
| `list_domains` | Managed domains and the domains reports were received for |
| `get_domain_overview` | Volume and DMARC, SPF and DKIM pass rates per domain over the last N days |
| `get_summary` | Totals for a period: reports, messages, pass and fail counts |
| `get_auth_breakdown` | DKIM and SPF results by outcome, and the DKIM × SPF matrix |
| `get_timeseries` | Daily or weekly volume, pass rates or dispositions |
| `get_top_sources` | Top senders by IP (with location and ISP), country or From domain |
| `get_new_ips` | Source IPs seen for the first time in a period |
| `search_records` | Report rows with filters: disposition, DKIM and SPF result, IP, From domain, reporter, country, forwarding, free text |
| `list_reports` | Received aggregate reports with reporter, period and published policy |
| `get_report` | One report with its records |
| `get_record` | One record with its DKIM, SPF and policy override details |
| `get_ip_info` | Stored location and ISP of an IP. Never triggers a new lookup |
| `get_report_xml` | Raw XML of one report. Only for tokens created with **Allow reading raw report XML** |

Periods default to the last 30 days and can be at most 366 days. Pages hold at most 50 rows.

The server also offers two prompts: `weekly_review` (last 7 days: volume, pass rates, new and failing sources) and `policy_readiness` (whether a domain can move to `p=quarantine` or `p=reject`, and how).

## Security

### Who can do what

| Action | Who |
|---|---|
| Create, list and revoke own tokens | Every signed-in user, in the web UI |
| List and revoke every user's tokens | Administrators (**Settings → API Tokens**) |
| Query data through MCP | Holders of a valid token, with the read access of the token's user |
| Change anything through MCP | Nobody |

The token's user is loaded from the database on every request, so a deleted user's tokens stop working immediately (deleting a user also deletes their tokens). Changing a password or disabling 2FA does **not** revoke tokens; revoke them on the Profile page if needed. Tokens are not tied to the identity provider either: after an SSO user leaves, revoke their tokens or delete the user.

### Report content is untrusted

Anyone can send a DMARC report to your reporting address, and fields such as the reporter name, comments and the raw XML are written by the sender. A malicious report could contain text aimed at the AI assistant ("ignore previous instructions…"). The server limits what such text can do:

- All tools are read-only, so injected text cannot change anything in this app
- Text from reports is stripped of control and invisible characters and cut to 256 characters
- Each result lists the fields that come from report senders under `untrustedFields`, and the tool descriptions tell the assistant to treat them as data
- Raw XML is only available to tokens that were explicitly allowed to read it

The remaining risk is in the client: if the same assistant can also send email, browse the web or write files, injected text could try to make it pass your DMARC data on. Only connect this server to assistants whose other tools you trust, and keep the client's tool confirmations on.

### Limits

- `MCP_RATE_LIMIT_PER_MIN` requests per minute and token, and a 15-minute lock for an IP after 10 invalid tokens in 5 minutes. Like the login limits, the counters are kept in memory, so run a single backend instance
- Requests from browsers must come from an origin in `CORS_ORIGINS` or `MCP_ALLOWED_ORIGINS`
- JSON-RPC batch requests are rejected, so one request cannot carry many tool calls
- Results are capped at about 100 KB, raw XML at 64,000 characters
- At most 25 active tokens per user

### Audit log

Each tool call writes one log line with `event: "mcp_tool_call"`, the tool name, token id, user id, client IP, arguments, outcome and duration. Token creation, revocation and failed token authentication are logged as `api_token_created`, `api_token_revoked`, `api_token_revoked_all` and `api_token_auth_failed`. The token itself is never logged. **Last used** and the client IP are also shown next to each token in the UI.
