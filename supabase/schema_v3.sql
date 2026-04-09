-- ============================================================
-- DCC SalesForce CRM — Schema v3 (Incremental Upgrade)
-- Run AFTER schema.sql (additive only — no breaking changes)
-- Supabase SQL Editor → New Query → Run
-- ============================================================

-- ── Extensions (idempotent) ────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";
create extension if not exists "pgcrypto";   -- for gen_salt / crypt

-- ════════════════════════════════════════════════════════════
-- DEVICE SESSIONS
-- Tracks which device a user is logged in from.
-- Used for device binding — prevents simultaneous logins.
-- ════════════════════════════════════════════════════════════
create table if not exists public.device_sessions (
  id            bigserial primary key,
  user_id       bigint references public.users(id) on delete cascade,
  device_id     text not null,           -- fingerprint (UA + screen + timezone hash)
  device_name   text default '',         -- human readable: "Android / Chrome 120"
  ip_address    text default '',
  jwt_token     text,                    -- last issued JWT jti claim
  is_active     boolean default true,
  last_seen_at  timestamptz default now(),
  created_at    timestamptz default now(),
  expires_at    timestamptz,
  unique (user_id, device_id)
);
create index if not exists idx_device_sessions_user   on public.device_sessions(user_id);
create index if not exists idx_device_sessions_device on public.device_sessions(device_id);
create index if not exists idx_device_sessions_active on public.device_sessions(is_active);

drop trigger if exists trg_device_sessions_updated on public.device_sessions;
create or replace function touch_device_session()
returns trigger language plpgsql as $$
begin NEW.last_seen_at = now(); return NEW; end;
$$;
create trigger trg_device_sessions_updated
  before update on public.device_sessions
  for each row execute procedure touch_device_session();

-- ════════════════════════════════════════════════════════════
-- ADMIN RULES (Automation Engine)
-- Admin-configurable rules that drive automated alerts and flags.
-- ════════════════════════════════════════════════════════════
create table if not exists public.admin_rules (
  id            bigserial primary key,
  name          text not null,
  description   text default '',
  rule_type     text not null,     -- 'idle_alert' | 'gps_mismatch' | 'no_visit' | 'custom'
  target_role   text default 'Sales Manager',
  is_active     boolean default true,

  -- Rule configuration (JSONB for flexibility)
  -- Examples:
  --   idle_alert:    { "idle_minutes": 30, "start_hour": 9, "end_hour": 18 }
  --   no_visit:      { "by_hour": 14, "min_visits": 1 }
  --   gps_mismatch:  { "max_speed_kmh": 120, "max_jump_km": 50 }
  --   visit_limit:   { "max_visits_per_day": 15 }
  config        jsonb default '{}',

  -- Trigger config: when does this rule fire?
  trigger_type  text default 'scheduled',  -- 'scheduled' | 'event'
  trigger_cron  text default '0 14 * * *', -- cron expression (default: 2 PM daily)
  trigger_event text default '',            -- event name if trigger_type = 'event'

  -- Action config: what happens when rule fires?
  action_type   text default 'alert',       -- 'alert' | 'flag' | 'notify' | 'block'
  action_config jsonb default '{}',         -- { "notify_admin": true, "message": "..." }

  -- Soft delete
  created_by    bigint references public.users(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz,
  deleted_at    timestamptz
);
create index if not exists idx_admin_rules_type   on public.admin_rules(rule_type);
create index if not exists idx_admin_rules_active on public.admin_rules(is_active);

drop trigger if exists trg_admin_rules_updated on public.admin_rules;
create trigger trg_admin_rules_updated
  before update on public.admin_rules
  for each row execute procedure set_updated_at();

-- ════════════════════════════════════════════════════════════
-- RULE ALERTS (Audit trail of fired rules)
-- Every time a rule fires against a manager, log it here.
-- ════════════════════════════════════════════════════════════
create table if not exists public.rule_alerts (
  id            bigserial primary key,
  rule_id       bigint references public.admin_rules(id),
  manager_id    bigint references public.users(id),
  alert_date    date not null default current_date,
  alert_type    text not null,             -- mirrors rule_type
  severity      text default 'warning',    -- 'info' | 'warning' | 'critical'
  message       text not null,
  context       jsonb default '{}',        -- raw data that triggered the alert
  is_read       boolean default false,
  read_at       timestamptz,
  read_by       bigint references public.users(id),
  created_at    timestamptz default now()
);
create index if not exists idx_rule_alerts_manager on public.rule_alerts(manager_id);
create index if not exists idx_rule_alerts_date    on public.rule_alerts(alert_date);
create index if not exists idx_rule_alerts_type    on public.rule_alerts(alert_type);
create index if not exists idx_rule_alerts_read    on public.rule_alerts(is_read);

-- ════════════════════════════════════════════════════════════
-- SYNC LOG (Delta sync tracking)
-- Tracks last sync timestamp per user per table.
-- Enables delta sync instead of full table pulls.
-- ════════════════════════════════════════════════════════════
create table if not exists public.sync_log (
  id            bigserial primary key,
  user_id       bigint references public.users(id),
  device_id     text,
  table_name    text not null,
  last_synced_at timestamptz default now(),
  rows_synced   integer default 0,
  sync_type     text default 'pull',  -- 'pull' | 'push' | 'flush'
  created_at    timestamptz default now(),
  unique (user_id, device_id, table_name)
);
create index if not exists idx_sync_log_user  on public.sync_log(user_id);
create index if not exists idx_sync_log_table on public.sync_log(table_name);

-- ════════════════════════════════════════════════════════════
-- GPS ANOMALY LOG
-- Dedicated table for suspicious GPS events.
-- Separate from journey_locations for audit clarity.
-- ════════════════════════════════════════════════════════════
create table if not exists public.gps_anomalies (
  id              bigserial primary key,
  manager_id      bigint references public.users(id),
  journey_id      bigint references public.journeys(id),
  latitude        double precision not null,
  longitude       double precision not null,
  detected_at     timestamptz default now(),
  anomaly_type    text not null,   -- 'speed' | 'jump' | 'mock' | 'stationary'
  anomaly_reason  text,
  speed_kmh       double precision,
  jump_km         double precision,
  is_reviewed     boolean default false,
  reviewed_by     bigint references public.users(id),
  reviewed_at     timestamptz,
  review_note     text
);
create index if not exists idx_gps_anomalies_manager  on public.gps_anomalies(manager_id);
create index if not exists idx_gps_anomalies_journey  on public.gps_anomalies(journey_id);
create index if not exists idx_gps_anomalies_date     on public.gps_anomalies(detected_at);

-- ════════════════════════════════════════════════════════════
-- HELPER: Secure password hashing (bcrypt via pgcrypto)
-- Used by the auth Edge Function's fallback SQL path.
-- ════════════════════════════════════════════════════════════
create or replace function public.hash_password(plain_password text)
returns text language sql security definer as $$
  select crypt(plain_password, gen_salt('bf', 10));
$$;

create or replace function public.verify_password(plain_password text, stored_hash text)
returns boolean language sql security definer as $$
  select stored_hash = crypt(plain_password, stored_hash);
$$;

-- ════════════════════════════════════════════════════════════
-- HELPER: get_manager_today_summary()
-- Called by automation rules to check daily activity.
-- ════════════════════════════════════════════════════════════
create or replace function public.get_manager_today_summary(p_manager_id bigint)
returns table (
  manager_id    bigint,
  visits_today  integer,
  km_today      double precision,
  last_gps_at   timestamptz,
  last_visit_at timestamptz,
  is_on_journey boolean,
  journey_id    bigint
) language sql security definer stable as $$
  select
    u.id as manager_id,
    coalesce(v.cnt, 0) as visits_today,
    coalesce(j.total_km, 0) as km_today,
    jl.timestamp as last_gps_at,
    lv.created_at as last_visit_at,
    (j.id is not null) as is_on_journey,
    j.id as journey_id
  from public.users u
  left join (
    select manager_id, count(*)::integer as cnt
    from public.visits
    where manager_id = p_manager_id and visit_date = current_date and deleted_at is null
    group by manager_id
  ) v on v.manager_id = u.id
  left join lateral (
    select * from public.journeys
    where manager_id = p_manager_id and status = 'active'
    order by start_time desc limit 1
  ) j on true
  left join lateral (
    select timestamp from public.journey_locations
    where journey_id = j.id
    order by timestamp desc limit 1
  ) jl on true
  left join lateral (
    select created_at from public.visits
    where manager_id = p_manager_id and visit_date = current_date and deleted_at is null
    order by created_at desc limit 1
  ) lv on true
  where u.id = p_manager_id;
$$;

-- ════════════════════════════════════════════════════════════
-- HELPER: delta_sync_query()
-- Returns rows from a table modified after a given timestamp.
-- Used by the sync-flush Edge Function for delta sync.
-- ════════════════════════════════════════════════════════════
create or replace function public.get_delta_visits(
  p_manager_id  bigint,
  p_since       timestamptz
)
returns setof public.visits language sql security definer stable as $$
  select * from public.visits
  where manager_id = p_manager_id
    and (created_at > p_since or updated_at > p_since)
  order by coalesce(updated_at, created_at) desc
  limit 500;
$$;

create or replace function public.get_delta_journey_locations(
  p_manager_id  bigint,
  p_since       timestamptz
)
returns setof public.journey_locations language sql security definer stable as $$
  select * from public.journey_locations
  where manager_id = p_manager_id
    and timestamp > p_since
  order by timestamp desc
  limit 1000;
$$;

-- ════════════════════════════════════════════════════════════
-- RLS — Enable on new tables
-- ════════════════════════════════════════════════════════════
alter table public.device_sessions  enable row level security;
alter table public.admin_rules      enable row level security;
alter table public.rule_alerts      enable row level security;
alter table public.sync_log         enable row level security;
alter table public.gps_anomalies    enable row level security;

-- Temporary open policies (same pattern as existing tables)
-- These will be tightened in Phase E when JWT auth is in place.
create policy "allow_all_device_sessions" on public.device_sessions for all using (true) with check (true);
create policy "allow_all_admin_rules"     on public.admin_rules     for all using (true) with check (true);
create policy "allow_all_rule_alerts"     on public.rule_alerts     for all using (true) with check (true);
create policy "allow_all_sync_log"        on public.sync_log        for all using (true) with check (true);
create policy "allow_all_gps_anomalies"   on public.gps_anomalies   for all using (true) with check (true);

-- ════════════════════════════════════════════════════════════
-- REALTIME — add new tables
-- ════════════════════════════════════════════════════════════
alter publication supabase_realtime add table public.rule_alerts;
alter publication supabase_realtime add table public.gps_anomalies;

-- ════════════════════════════════════════════════════════════
-- SEED: Default admin rules
-- These are safe defaults — admin can modify them in dashboard.
-- ════════════════════════════════════════════════════════════
insert into public.admin_rules (name, description, rule_type, config, trigger_type, trigger_cron, action_type, action_config)
values
  (
    'No Visit by 2PM Alert',
    'Fires if a Sales Manager has 0 visits logged by 2 PM on a working day',
    'no_visit',
    '{"by_hour": 14, "min_visits": 1, "skip_weekends": true}',
    'scheduled',
    '0 14 * * 1-5',
    'alert',
    '{"severity": "warning", "notify_admin": true, "message": "No customer visit logged by 2:00 PM"}'
  ),
  (
    'GPS Speed Anomaly',
    'Flags GPS points where speed exceeds 120 km/h — likely fake GPS or vehicle travel',
    'gps_mismatch',
    '{"max_speed_kmh": 120, "max_jump_km": 50}',
    'event',
    '',
    'flag',
    '{"severity": "critical", "notify_admin": true, "message": "Suspicious GPS movement detected"}'
  ),
  (
    'Idle Alert — 30 Minutes',
    'Alerts if a manager on an active journey has not moved more than 50m in 30 minutes',
    'idle_alert',
    '{"idle_minutes": 30, "min_movement_km": 0.05, "during_journey_only": true}',
    'scheduled',
    '*/30 8-19 * * 1-6',
    'alert',
    '{"severity": "info", "notify_admin": false, "message": "Manager may be idle for 30+ minutes"}'
  ),
  (
    'No Activity by EOD',
    'Critical alert if a manager has no status update and no visits by 6 PM',
    'no_activity',
    '{"by_hour": 18, "skip_weekends": true}',
    'scheduled',
    '0 18 * * 1-5',
    'alert',
    '{"severity": "critical", "notify_admin": true, "message": "No field activity recorded today"}'
  ),
  (
    'Daily Visit Minimum',
    'Warning if total visits for the day are below 3 by end of working hours',
    'visit_limit',
    '{"min_visits_by_eod": 3, "check_hour": 17, "skip_weekends": true}',
    'scheduled',
    '0 17 * * 1-5',
    'alert',
    '{"severity": "warning", "notify_admin": false, "message": "Less than 3 visits logged today"}'
  )
on conflict do nothing;

-- ════════════════════════════════════════════════════════════
-- UPDATE sequence guards (prevent conflicts with existing rows)
-- ════════════════════════════════════════════════════════════
select setval('public.admin_rules_id_seq', (select coalesce(max(id), 0) + 1 from public.admin_rules), false);
