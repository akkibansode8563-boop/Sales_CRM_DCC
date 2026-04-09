-- ============================================================
-- DCC SalesForce CRM — SQL Helpers v3
-- Run AFTER schema_v3.sql
-- These functions are called by the Edge Functions.
-- ============================================================

-- ── increment_visit_count: atomic, race-condition safe ───────
create or replace function public.increment_visit_count(p_customer_id bigint)
returns void language sql security definer as $$
  update public.customers
  set visit_count  = coalesce(visit_count, 0) + 1,
      last_visited = now()
  where id = p_customer_id;
$$;

-- ── Prevent duplicate active journey per manager ─────────────
-- This is a DB-level constraint in addition to Edge Function check.
create unique index if not exists idx_journeys_one_active_per_manager
  on public.journeys (manager_id)
  where status = 'active';

-- ── Rate limit index for GPS points ──────────────────────────
-- Speeds up the "last GPS point for this journey" query in log-gps
create index if not exists idx_jloc_journey_ts
  on public.journey_locations (journey_id, timestamp desc);

-- ── Unread alerts per manager (fast admin dashboard query) ───
create index if not exists idx_rule_alerts_unread
  on public.rule_alerts (manager_id, alert_date)
  where is_read = false;

-- ── Grant execute on helper functions to anon/service roles ──
grant execute on function public.increment_visit_count(bigint)       to anon, service_role;
grant execute on function public.get_manager_today_summary(bigint)   to anon, service_role;
grant execute on function public.get_delta_visits(bigint, timestamptz) to anon, service_role;
grant execute on function public.get_delta_journey_locations(bigint, timestamptz) to anon, service_role;
grant execute on function public.hash_password(text)                 to service_role;
grant execute on function public.verify_password(text, text)         to service_role;
