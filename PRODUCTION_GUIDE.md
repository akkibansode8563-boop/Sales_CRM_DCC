# DCC SalesForce CRM — Production Deployment Guide

> Follow this guide in order. Each step must complete before the next.

---

## STEP 1 — Supabase Database Setup

### 1.1 Create Project
1. Go to **https://supabase.com** → New Project
2. Name: `DCC SalesForce CRM`
3. Password: Save it securely (you'll need it for DB tools)
4. Region: **Asia South 1 (Mumbai)** — closest to your users
5. Wait ~2 minutes for project to spin up

### 1.2 Run the Schema
1. Supabase Dashboard → **SQL Editor** → New Query
2. Open `supabase/schema.sql` from this project
3. Paste entire contents → **Run**
4. You should see: `Success. No rows returned`

> This creates all tables, indexes, triggers, realtime, RLS policies, and the YoY views.

### 1.3 Enable Realtime (if not auto-enabled by schema)
1. Supabase Dashboard → **Database → Replication**
2. Confirm these tables are enabled:
   - visits, journeys, journey_locations, status_history
   - daily_sales_reports, product_day, customers, targets

### 1.4 Get API Keys
1. Supabase Dashboard → **Settings → API**
2. Copy:
   - **Project URL** → `https://xxxxxxxx.supabase.co`
   - **anon/public key** → `eyJhbGciOi...` (long string)

---

## STEP 2 — Vercel Deployment

### 2.1 Connect GitHub
1. Push this project to GitHub
2. Go to **https://vercel.com** → New Project → Import from GitHub

### 2.2 Set Environment Variables
In Vercel → Project Settings → **Environment Variables**, add:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | `https://xxxxxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...` |

### 2.3 Deploy
- Vercel auto-deploys on every `git push`
- Build command: `npm run build`
- Output directory: `dist`

### 2.4 Custom Domain (Recommended)
1. Vercel → Project → **Domains**
2. Add: `sales.yourdomain.com`
3. Update your DNS records as instructed
4. SSL is automatic (Let's Encrypt)

---

## STEP 3 — Android APK

### 3.1 Update URL in TWA Project
Open `DCC_Android_TWA/app/build.gradle`:
```
hostName   : "sales.yourdomain.com",   ← your actual domain
defaultUrl : "https://sales.yourdomain.com/",
```

### 3.2 Generate Keystore (one time only)
```bash
cd DCC_Android_TWA
mkdir keystore
keytool -genkey -v \
  -keystore keystore/dcc-release.jks \
  -alias dcc-key \
  -keyalg RSA -keysize 2048 -validity 10000
```
**Save the passwords — you can never change them!**

### 3.3 Get SHA-256 Fingerprint
```bash
keytool -list -v -keystore keystore/dcc-release.jks -alias dcc-key
```
Copy the `SHA256:` line.

### 3.4 Update assetlinks.json
Edit `public/.well-known/assetlinks.json`:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.dcc.salesforce",
    "sha256_cert_fingerprints": ["AA:BB:CC:...your SHA256..."]
  }
}]
```
Push to GitHub → Vercel redeploys.

### 3.5 Build Signed APK
In `app/build.gradle`, uncomment and fill `signingConfigs.release`, then:
```
Build → Generate Signed Bundle/APK → APK → Release
```
Output: `app/build/outputs/apk/release/app-release.apk`

---

## STEP 4 — Security Checklist

### 4.1 Change Admin Password
1. Login as `admin` / `Admin@123`
2. Users tab → Edit admin → Set new strong password

### 4.2 Supabase Security
- Go to Supabase → **Settings → Auth**
- Disable "Email logins" (you don't use Supabase Auth)
- Go to **API → Exposed schemas** — keep only `public`

### 4.3 Rate Limiting (Supabase Pro)
- Supabase Dashboard → **Database → Extensions** → enable `pg_net`
- Or use Vercel's WAF on the frontend

---

## STEP 5 — Backup Setup

### 5.1 Supabase Auto-Backup
- Supabase Pro plan: **Point-in-Time Recovery** (automated)
- Free plan: **Weekly backups** (manual download)

### 5.2 Manual Export (Free Plan)
Run weekly in Supabase SQL Editor:
```sql
-- Export visits to CSV
COPY (SELECT * FROM visits ORDER BY created_at DESC) TO STDOUT CSV HEADER;
```

### 5.3 Recommended Backup Schedule
| Data | Frequency | Storage |
|------|-----------|---------|
| Full DB dump | Weekly | Google Drive |
| Supabase snapshot | Daily (Pro) | Supabase |
| Export CSV | Monthly | Email to admin |

---

## STEP 6 — Performance for 100 Users

All indexes are already in the schema. Additional tips:

### 6.1 Supabase Connection Pooling
- Supabase Dashboard → **Database → Connection Pooling**
- Mode: **Transaction** (recommended for PWA)
- Max connections: 15 per instance

### 6.2 Vercel Edge Network
Vercel auto-distributes to CDN edges globally — no action needed.

### 6.3 PWA Caching
Already implemented in `public/sw.js`:
- JS/CSS: 1-year cache (content-hashed)
- Map tiles: 7-day cache
- API calls: never cached

---

## STEP 7 — Year-on-Year Reporting

The schema includes two pre-built SQL views:

```sql
-- Monthly sales by manager
SELECT * FROM yoy_sales_summary
WHERE year = 2026
ORDER BY month, manager_name;

-- Monthly visits by manager
SELECT * FROM yoy_visits_summary
WHERE year IN (2025, 2026)
ORDER BY year DESC, month DESC;
```

Every table has `year` and `month` as **generated columns** (auto-calculated from the date, no manual entry needed).

---

## STEP 8 — Launch Checklist

| Item | Command/Action | Status |
|------|---------------|--------|
| Schema deployed | SQL Editor → Run schema.sql | ☐ |
| Env vars set | Vercel Environment Variables | ☐ |
| Vercel deployed | git push → auto deploy | ☐ |
| Custom domain | Vercel Domains | ☐ |
| SSL active | Automatic via Vercel | ☐ |
| Admin password changed | App → Users → Edit Admin | ☐ |
| assetlinks.json updated | public/.well-known/ | ☐ |
| APK built & signed | Android Studio → Build | ☐ |
| APK installed on phones | ADB / WhatsApp / USB | ☐ |
| Test: manager login | Create 1 test manager | ☐ |
| Test: realtime sync | Admin sees live changes | ☐ |
| Backup configured | Supabase / manual export | ☐ |
| Load test (10 users) | Pilot run | ☐ |
| Full launch | All managers onboarded | ☐ |

---

## Session Security

The app now enforces:
- **8-hour auto-logout** on inactivity (mouse/key/touch tracked)
- **Login audit log** — every login/logout/failed attempt stored in `login_logs` table
- **Device info** captured on each login
- Sessions survive page refresh (Zustand persist) but expire after 8h idle

---

## Default Login

| Username | Password |
|----------|----------|
| `admin` | `Admin@123` |

**Change this immediately after first login.**

