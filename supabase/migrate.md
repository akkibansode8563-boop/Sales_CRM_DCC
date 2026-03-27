# DCC CRM — Supabase Migration Guide

## Step 1: Create Supabase Project
1. Go to https://supabase.com → New Project
2. Name: DCC SalesForce CRM
3. Choose a strong database password (save it)
4. Region: Asia Pacific (Mumbai) — closest to your users

## Step 2: Run Schema
1. In Supabase dashboard → SQL Editor
2. Click "New query"
3. Paste the entire contents of `schema.sql`
4. Click "Run"
5. You should see: "Success. No rows returned"

## Step 3: Get Your API Keys
1. Supabase Dashboard → Settings → API
2. Copy:
   - **Project URL** (looks like: https://abcdefgh.supabase.co)
   - **anon/public key** (long string starting with eyJ...)

## Step 4: Add to Vercel
1. Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
3. Redeploy

## Step 5: Enable Realtime
1. Supabase Dashboard → Database → Replication
2. Enable for tables: visits, journeys, journey_locations, status_history, daily_sales_reports

## Step 6: Test
1. Open your app → Admin sidebar shows "Cloud sync active" (green)
2. Create a manager on one device
3. Open another device — manager appears immediately
4. Start a journey on phone — admin sees it live

## Fallback
If Supabase is not configured, the app works 100% in localStorage mode.
The sidebar shows "Local storage only" (yellow badge).
