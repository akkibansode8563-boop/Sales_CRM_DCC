# DCC SalesForce CRM — Backend Upgrade Deployment Guide

## What Was Built

This upgrade adds a proper backend layer to the CRM using Supabase Edge Functions (serverless, Deno-based). All changes are **additive** — the existing offline-first system continues to work unchanged.

---

## Step 1: Run the SQL Migrations

In your Supabase Dashboard → SQL Editor → New Query, run these **in order**:

```
1. supabase/schema.sql         (existing — run if not already done)
2. supabase/schema_v3.sql      (NEW — adds 5 tables + helper functions)
3. supabase/helpers_v3.sql     (NEW — indexes, grants, constraint)
```

### New tables created:
| Table | Purpose |
|-------|---------|
| `device_sessions` | Device binding per user |
| `admin_rules` | Admin-configurable automation rules |
| `rule_alerts` | Fired alert audit trail |
| `sync_log` | Delta sync tracking per device |
| `gps_anomalies` | GPS fraud audit log |

---

## Step 2: Deploy Edge Functions

Install Supabase CLI if you haven't:
```bash
npm install -g supabase
supabase login
```

Link to your project:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Deploy all functions:
```bash
supabase functions deploy auth-login
supabase functions deploy log-visit
supabase functions deploy log-gps
supabase functions deploy start-journey
supabase functions deploy sync-flush
supabase functions deploy live-tracking
supabase functions deploy evaluate-rules
```

---

## Step 3: Set Edge Function Secrets

In Supabase Dashboard → Edge Functions → Secrets (or via CLI):

```bash
supabase secrets set JWT_SECRET="your-strong-random-secret-min-32-chars"
supabase secrets set CRON_SECRET="your-cron-secret-for-automation"
```

> **SUPABASE_URL** and **SUPABASE_SERVICE_ROLE_KEY** are automatically available in Edge Functions — no need to set them manually.

---

## Step 4: Enable Edge Functions in the App

Add to your `.env` file:

```env
VITE_USE_EDGE_FUNCTIONS=true
```

> Without this flag, the app continues to use direct Supabase calls (existing behavior). Set it to `true` only when functions are deployed and tested.

---

## Step 5: Set Up Automation Cron Jobs

In Supabase Dashboard → Database → Cron Jobs (pg_cron), add:

```sql
-- Evaluate rules at 2 PM Monday-Friday (no-visit check)
select cron.schedule('evaluate-rules-2pm', '0 14 * * 1-5',
  $$select net.http_post(
    url := 'https://<your-project-ref>.supabase.co/functions/v1/evaluate-rules',
    headers := '{"x-cron-secret": "your-cron-secret"}'::jsonb,
    body := '{"rule_types": ["no_visit"]}'::jsonb
  )$$
);

-- Evaluate rules at 5 PM Monday-Friday (visit limit check)
select cron.schedule('evaluate-rules-5pm', '0 17 * * 1-5',
  $$select net.http_post(
    url := 'https://<your-project-ref>.supabase.co/functions/v1/evaluate-rules',
    headers := '{"x-cron-secret": "your-cron-secret"}'::jsonb,
    body := '{"rule_types": ["visit_limit", "no_activity"]}'::jsonb
  )$$
);

-- Check idle status every 30 min during field hours (8 AM - 7 PM)
select cron.schedule('evaluate-idle', '*/30 8-19 * * 1-6',
  $$select net.http_post(
    url := 'https://<your-project-ref>.supabase.co/functions/v1/evaluate-rules',
    headers := '{"x-cron-secret": "your-cron-secret"}'::jsonb,
    body := '{"rule_types": ["idle_alert"]}'::jsonb
  )$$
);
```

---

## Architecture Summary

```
Mobile App (React + Capacitor)
    │
    ├── ONLINE: POST to Edge Functions ──→ Validated by server
    │           ↓ returns result
    │           Local cache updated (delta sync)
    │
    └── OFFLINE: Write to localStorage queue
                  ↓ when back online
                  sync-flush Edge Function processes queue
```

### Service Files Changed:

| File | Change |
|------|--------|
| `src/services/authService.js` | Now calls auth-login Edge Function for secure JWT |
| `src/services/syncService.js` | v3: retry backoff, delta sync, Edge Function flush |
| `src/services/journeyService.js` | **NEW**: routes GPS/journey ops through backend |
| `src/services/visitService.js` | **NEW**: server-validated visit creation |
| `src/utils/api.js` | Now points to Edge Function base URL, includes apikey |

### Edge Functions:

| Function | What it validates |
|----------|-------------------|
| `auth-login` | Password (bcrypt + SHA-256), device binding |
| `log-visit` | GPS required, notes required, photo required, no duplicates |
| `log-gps` | Speed limit, jump detection, 30s rate limit |
| `start-journey` | One active journey at a time (DB constraint + function check) |
| `sync-flush` | Ordered queue processing, journey ID mapping |
| `live-tracking` | Admin-only, reads manager_live_state view + alerts |
| `evaluate-rules` | Runs all admin_rules, fires alerts, deduplicates |

---

## Testing Edge Functions Locally

```bash
supabase functions serve

# Test auth
curl -X POST http://localhost:54321/functions/v1/auth-login \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{"username": "admin", "password": "admin123"}'

# Test live tracking (use token from auth response)
curl http://localhost:54321/functions/v1/live-tracking \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "apikey: YOUR_ANON_KEY"
```

---

## Rollback

If anything breaks:
1. Set `VITE_USE_EDGE_FUNCTIONS=false` in `.env` — app reverts to direct Supabase
2. The new SQL tables have no impact on existing functionality (all additive)
3. Edge Functions can be disabled from Supabase Dashboard without affecting the app
