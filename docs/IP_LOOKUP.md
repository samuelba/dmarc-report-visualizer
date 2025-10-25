# IP Lookup Configuration Guide

## Overview

The DMARC Report Visualizer includes an IP geolocation service that enriches your DMARC records with geographical and organizational information about the source IPs. This guide explains how to configure and optimize the IP lookup system for your needs.

## Features

- **Multiple Provider Support**: Choose from 5 different geolocation providers
- **Smart Fallback System**: Automatically switches to backup providers if the primary fails
- **Rate Limit Handling**: Intelligently queues requests when rate limits are hit
- **Caching**: Stores lookup results to minimize API calls (configurable cache duration)
- **Async Processing**: Non-blocking lookups don't slow down report parsing
- **Quality-First Strategy**: Prioritizes accurate data over incomplete fallbacks

## Quick Start

### Minimal Configuration (Free, No API Keys)

The service works out of the box with sensible defaults:

```bash
# In backend/.env
IP_LOOKUP_PROVIDER=ip-api
IP_LOOKUP_FALLBACK_PROVIDERS=geoip-lite
IP_LOOKUP_CACHE_DAYS=14
```

This configuration:
- Uses **ip-api** as primary (free, 45 requests/minute, includes ISP/org data)
- Falls back to **geoip-lite** if needed (local database, unlimited, basic data only)
- Caches results for 14 days

### Recommended Configuration (Best Quality)

For better data quality and higher rate limits:

```bash
# In backend/.env
IP_LOOKUP_PROVIDER=iplocate
IPLOCATE_API_KEY=your_api_key_here
IP_LOOKUP_FALLBACK_PROVIDERS=ipwhois,ip-api,geoip-lite
IP_LOOKUP_CACHE_DAYS=30
```

This provides:
- Premium data quality from iplocate (1,000 requests/day)
- Automatic fallback to ip-api if daily limit reached
- Final fallback to local database if all else fails

## Available Providers

### Comparison Table

| Provider | API Key | Rate Limit | ISP/Org Data | Security | Best For |
|----------|---------|------------|--------------|----------|----------|
| **geoip-lite** | ❌ No | ∞ Unlimited | ❌ No | N/A (Local) | Development, fallback |
| **ip-api** | ❌ No | 45/minute | ✅ Yes | HTTP only | Medium volume |
| **iplocate** | ✅ Required | 1,000/day | ✅ Yes | HTTPS | Medium volume |
| **ipwhois** | ⚠️ Optional | 10,000/month free<br>∞ with key | ✅ Yes | HTTP | Medium volume |
| **ipapi-co** | ⚠️ Optional | 1,000/day free<br>∞ with key | ✅ Yes | HTTPS | Fallback |

### 1. geoip-lite (Local Database)

**No API key required** • **Unlimited requests**

A free API service without ISP/org data, perfect for development and as a fallback option.

**Pros:**
- No rate limits or API keys
- Great as a fallback option
- Fast local database lookups

**Cons:**
- No ISP or organization data

**Configuration:**
```bash
IP_LOOKUP_PROVIDER=geoip-lite
# No additional settings needed
```

**Data Provided:** Country, city, coordinates, timezone

---

### 2. ip-api (ip-api.com)

**No API key required** • **45 requests per minute**

A free API service with ISP/org data, perfect for medium volume applications.

**Pros:**
- Works immediately, no signup required
- Includes ISP and organization data

**Cons:**
- HTTP only (not HTTPS)
- Limited to 45 requests per minute

**Configuration:**
```bash
IP_LOOKUP_PROVIDER=ip-api
# No API key needed
```

**Rate Limits:** 45 requests/minute (enforced by the system)

**Data Provided:** Country, region, city, coordinates, timezone, ISP, organization

**Best Use Case:** Default choice for most users who want ISP/org data without API key management

---

### 3. iplocate (iplocate.io)

**API key required** • **1,000 requests per day**

A premium HTTPS API with detailed geolocation and company information.

**Pros:**
- Secure HTTPS connection
- Detailed ISP and organization data
- Company information
- Good free tier (1,000/day)

**Cons:**
- Requires API key (free signup)
- Daily limit can be restrictive for high volume

**Configuration:**
```bash
IP_LOOKUP_PROVIDER=iplocate
IPLOCATE_API_KEY=your_api_key_here
IP_LOOKUP_FALLBACK_PROVIDERS=ip-api,geoip-lite
```

**Rate Limits:** 1,000 requests/day

**Data Provided:** Country, region, city, coordinates, ISP, organization

**Best Use Case:** Production environments with moderate traffic, when you need detailed company information

---

### 4. ipapi-co (ipapi.co)

**API key optional** • **1,000/day free or unlimited with key**

A flexible provider that works without an API key but offers unlimited requests with one.

**Pros:**
- Works without API key (1,000/day)
- Unlimited requests with API key
- Secure HTTPS
- Good ISP/org data

**Cons:**
- Aggressive rate limiting on free tier
- API key required for high volume

**Configuration:**

Without API key (free tier):
```bash
IP_LOOKUP_PROVIDER=ipapi-co
IP_LOOKUP_FALLBACK_PROVIDERS=ip-api,geoip-lite
```

With API key (unlimited):
```bash
IP_LOOKUP_PROVIDER=ipapi-co
IPAPICO_API_KEY=your_api_key_here
```

**Rate Limits:** 
- Free: 1,000 requests/day
- With API key: Unlimited (plan-dependent)

**Data Provided:** Country, region, city, coordinates, ISP, organization

**Best Use Case:** High-volume production environments where you need unlimited requests

---

### 5. ipwhois (ipwhois.io)

**API key optional** • **10,000/month free or unlimited with key**

Offers the best free tier with 10,000 requests per month.

**Pros:**
- **Best free tier** (10,000/month)
- Unlimited with API key
- Good ISP/org data
- No signup needed for free tier

**Cons:**
- HTTP only (not HTTPS)
- Monthly limit requires tracking

**Configuration:**

Without API key (free tier):
```bash
IP_LOOKUP_PROVIDER=ipwhois
IP_LOOKUP_FALLBACK_PROVIDERS=ip-api,geoip-lite
```

With API key (unlimited):
```bash
IP_LOOKUP_PROVIDER=ipwhois
IPWHOIS_API_KEY=your_api_key_here
```

**Rate Limits:**
- Free: 10,000 requests/month
- With API key: Unlimited (plan-dependent)

**Data Provided:** Country, region, city, coordinates, ISP, organization

**Best Use Case:** Applications with moderate monthly volume (up to 10,000 lookups/month) without needing API keys

## Configuration Options

### Environment Variables

Add these to your `backend/.env` file:

```bash
# Primary provider (required)
IP_LOOKUP_PROVIDER=ip-api

# Fallback providers (optional, comma-separated)
IP_LOOKUP_FALLBACK_PROVIDERS=geoip-lite

# Cache duration in days (default: 30)
IP_LOOKUP_CACHE_DAYS=14

# API Keys (only needed for specific providers)
IPLOCATE_API_KEY=your_iplocate_key
IPAPICO_API_KEY=your_ipapi_co_key
IPWHOIS_API_KEY=your_ipwhois_key
```

### IP_LOOKUP_PROVIDER

**Required** • Specifies which provider to use as the primary lookup service.

**Valid values:** `geoip-lite`, `ip-api`, `iplocate`, `ipapi-co`, `ipwhois`

**Example:**
```bash
IP_LOOKUP_PROVIDER=ip-api
```

### IP_LOOKUP_FALLBACK_PROVIDERS

**Optional** • Comma-separated list of providers to try if the primary fails.

**Valid values:** Any combination of: `geoip-lite`, `ip-api`, `iplocate`, `ipapi-co`, `ipwhois`

**Example:**
```bash
IP_LOOKUP_FALLBACK_PROVIDERS=iplocate,ip-api,geoip-lite
```

**Order matters!** The system tries fallback providers from left to right.

### IP_LOOKUP_CACHE_DAYS

**Optional** • How long to cache lookup results (default: 30 days)

**Valid values:** Any positive number

**Example:**
```bash
IP_LOOKUP_CACHE_DAYS=14
```

Shorter cache = more API calls but fresher data  
Longer cache = fewer API calls but potentially stale data

**Recommendation:** 14-30 days is a good balance

## Fallback System

### How Fallbacks Work

When the primary provider fails, the system automatically tries fallback providers **in the order specified**.

**Example Configuration:**
```bash
IP_LOOKUP_PROVIDER=ip-api
IP_LOOKUP_FALLBACK_PROVIDERS=iplocate,geoip-lite
```

**Execution flow:**
1. Try `ip-api` (primary)
2. If fails → Try `iplocate` (fallback #1)
3. If fails → Try `geoip-lite` (fallback #2)
4. If fails → Mark as failed, retry later

### When Fallbacks Are Used

Fallbacks are triggered when:

| Situation | Fallback Used? | System Behavior |
|-----------|----------------|-----------------|
| **Success** | ❌ No | Uses the data, done |
| **Rate limit hit** | ⚠️ Special | Queues for retry instead of fallback |
| **Network error** | ✅ Yes | Tries next provider immediately |
| **No data found** | ✅ Yes | Tries next provider immediately |
| **API key invalid** | ✅ Yes | Tries next provider immediately |
| **Provider timeout** | ✅ Yes | Tries next provider immediately |
| **IP already cached** | ❌ No | Returns cached data |

### Smart Rate Limit Handling

**Key Feature:** When a rate limit is hit, the system **waits and retries** rather than immediately using a fallback provider.

**Why?** To preserve data quality. If your primary provider has ISP/org data and your fallback doesn't (like geoip-lite), you want to wait for the rate limit to reset rather than cache incomplete data.

**Example:**
```bash
IP_LOOKUP_PROVIDER=ip-api
IP_LOOKUP_FALLBACK_PROVIDERS=geoip-lite
```

**Scenario:** Parsing 100 records with unique IPs

1. Records 1-45: Lookup successfully via ip-api (full data)
2. Record 46: Rate limit hit (45/min exceeded)
   - ❌ **Does NOT** immediately use geoip-lite
   - ✅ **Does** put IP in queue with low priority
   - ⏰ Waits for rate limit to reset
3. After ~60 seconds: Rate limit resets
4. Records 46-90: Continue using ip-api (full data)
5. Record 91: Rate limit hit again
6. Queue processes remaining IPs over time

**Result:** All records get full ISP/org data, just takes a bit longer

### Quality-First vs. Speed-First

The system is configured for **quality-first** by default, but you can optimize for speed:

**Quality-First (Default):**
```bash
IP_LOOKUP_PROVIDER=ip-api
IP_LOOKUP_FALLBACK_PROVIDERS=iplocate,geoip-lite
```
- Waits during rate limits
- Only uses geoip-lite after multiple failures
- All records get ISP/org data eventually

**Speed-First (Alternative):**
```bash
IP_LOOKUP_PROVIDER=geoip-lite
# No fallbacks needed - unlimited and always available
```
- Instant lookups, no waiting
- No rate limits
- Missing ISP/org data

## Caching System

### How Caching Works

Every successful IP lookup is stored in the database with:
- IP address
- Geolocation data (country, city, coordinates, etc.)
- ISP and organization information
- Timestamp of the lookup

**Before making an API call**, the system checks if:
1. The IP exists in cache
2. The cached data is within the `IP_LOOKUP_CACHE_DAYS` window

If both conditions are met, the cached data is used instead of making a new API call.

### Cache Benefits

- **Reduces API calls**: Same IP looked up once per cache period
- **Faster responses**: Database query vs. API call
- **Saves rate limits**: Doesn't count against provider limits
- **Works offline**: Cached data available even if provider is down

### Cache Example

**Scenario:** Processing 100 reports with `IP_LOOKUP_CACHE_DAYS=14`

1. First report contains IP `8.8.8.8`
   - Not in cache → API lookup → Cache result
2. Reports 2-50 also contain `8.8.8.8`
   - In cache → No API call needed
3. Day 15: New report with `8.8.8.8`
   - Cache expired → API lookup → Cache updated

**API calls made:** 2 (instead of 52)

### Adjusting Cache Duration

**Longer cache (30+ days):**
- ✅ Fewer API calls
- ✅ Better rate limit management
- ❌ Potentially stale data
- **Use when:** IP locations rarely change, high volume

**Shorter cache (7-14 days):**
- ✅ Fresher data
- ❌ More API calls
- ❌ Higher rate limit usage
- **Use when:** You need current data, low volume

**Very short cache (1-3 days):**
- ❌ Lots of API calls
- ✅ Always fresh
- **Use when:** Testing, development, or critical accuracy needs

## Queue System

### Why Use a Queue?

Without a queue, IP lookups would **block** report parsing:

```
Parse Report → Lookup IP 1 → Wait → Lookup IP 2 → Wait → ... → Done
Time: ~5-10 minutes for 100 unique IPs
```

With a queue, lookups happen **asynchronously**:

```
Parse Report → Done (10 seconds)
Background Queue → Lookup IPs over time (non-blocking)
```

### How It Works

1. **During Parsing:**
   - Reports are saved immediately
   - IP lookups are added to a queue
   - Parsing completes quickly

2. **Background Processing:**
   - Queue processor runs every second
   - Checks rate limits before making requests
   - Updates records with geo data as lookups complete

3. **Smart Queuing:**
   - Deduplicates IPs (same IP queued only once)
   - Prioritizes based on number of records affected
   - Automatically retries failed lookups

### Queue Benefits

- **Fast report parsing**: No blocking on IP lookups
- **Rate limit friendly**: Automatically paces requests
- **Efficient**: Deduplicates repeated IPs
- **Resilient**: Retries failed lookups automatically

## Troubleshooting

### Problem: No ISP/Organization Data

**Symptom:** Records show country/city but no ISP or organization

**Possible Causes:**
1. Using `geoip-lite` as primary provider
2. All API providers failed and fell back to geoip-lite

**Solution:**
```bash
# Switch to a provider with ISP/org data
IP_LOOKUP_PROVIDER=ip-api  # or iplocate, ipapi-co, ipwhois
IP_LOOKUP_FALLBACK_PROVIDERS=geoip-lite
```

---

### Problem: Too Many Rate Limit Errors

**Symptom:** Logs show frequent "Rate limit reached" messages

**Possible Causes:**
1. Volume exceeds provider's rate limit
2. Cache duration too short
3. Wrong provider for your volume

**Solutions:**

For high volume:
```bash
# Use provider with higher limits or add API key
IP_LOOKUP_PROVIDER=ipwhois  # 10,000/month free
# OR get paid plan
IP_LOOKUP_PROVIDER=ipapi-co
IPAPICO_API_KEY=your_key
```

Increase cache:
```bash
IP_LOOKUP_CACHE_DAYS=30  # or even 60/90
```

Add more fallbacks:
```bash
IP_LOOKUP_FALLBACK_PROVIDERS=ipwhois,iplocate,ip-api,geoip-lite
```

---

### Problem: Invalid API Key Errors

**Symptom:** "Invalid API key" or "Unauthorized" errors in logs

**Possible Causes:**
1. API key not set in `.env`
2. Incorrect API key format
3. API key expired or revoked

**Solutions:**

1. Verify API key is in `.env`:
```bash
IPLOCATE_API_KEY=abc123xyz456
```

2. Check for typos or extra spaces

3. Test API key manually:
```bash
# For iplocate
curl "https://www.iplocate.io/api/lookup/8.8.8.8?apikey=YOUR_KEY"
```

4. Regenerate API key from provider's dashboard

---

### Problem: Some IPs Have No Data

**Symptom:** Some records show null/empty geo data

**Possible Causes:**
1. IP is private/internal (e.g., 192.168.x.x)
2. IP not in any provider's database
3. All providers failed for that IP

**Expected Behavior:**
- Private IPs (10.x.x.x, 192.168.x.x, 172.16-31.x.x) cannot be geolocated
- Some IPs are legitimately not in databases

**Solution:**
This is normal for private/internal IPs. For public IPs with no data, try adding more fallback providers:
```bash
IP_LOOKUP_FALLBACK_PROVIDERS=iplocate,ip-api,ipwhois,ipapi-co,geoip-lite
```

## Best Practices

### 1. Always Configure Fallbacks

**Do this:**
```bash
IP_LOOKUP_PROVIDER=ip-api
IP_LOOKUP_FALLBACK_PROVIDERS=geoip-lite
```

**Not this:**
```bash
IP_LOOKUP_PROVIDER=ip-api
# No fallback - single point of failure
```

**Why:** Provider downtime or rate limits won't stop all lookups

---

### 2. Put geoip-lite Last

**Do this:**
```bash
IP_LOOKUP_FALLBACK_PROVIDERS=ip-api,iplocate,geoip-lite
```

**Not this:**
```bash
IP_LOOKUP_FALLBACK_PROVIDERS=geoip-lite,ip-api,iplocate
```

**Why:** geoip-lite has no ISP/org data, should be last resort

---

### 3. Match Cache to Your Volume

**Low volume (< 100 lookups/day):**
```bash
IP_LOOKUP_CACHE_DAYS=14
```

**Medium volume (100-1000 lookups/day):**
```bash
IP_LOOKUP_CACHE_DAYS=30
```

**High volume (1000+ lookups/day):**
```bash
IP_LOOKUP_CACHE_DAYS=60
```
