-- ============================================================
-- DCC SalesForce CRM — Supabase Production Schema v2
-- Run in Supabase SQL Editor → New Query → Run
-- ============================================================

-- ── Extensions ────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";  -- for fast text search

-- ── Helpers ───────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin NEW.updated_at = now(); return NEW; end;
$$;

-- ═══════════════════════════════════════════════════════════
-- USERS
-- ═══════════════════════════════════════════════════════════
create table if not exists public.users (
  id             bigserial primary key,
  username       text unique not null,
  password_hash  text not null,
  plain_password text,
  full_name      text not null,
  role           text not null default 'Sales Manager',
  email          text default '',
  phone          text default '',
  territory      text default '',
  is_active      boolean default true,
  -- audit
  created_at     timestamptz default now(),
  updated_at     timestamptz,
  deleted_at     timestamptz,
  last_login_at  timestamptz,
  login_count    integer default 0
);
create index if not exists idx_users_role       on public.users(role);
create index if not exists idx_users_territory  on public.users(territory);
create index if not exists idx_users_active     on public.users(is_active);

drop trigger if exists trg_users_updated on public.users;
create trigger trg_users_updated
  before update on public.users
  for each row execute procedure set_updated_at();

-- ═══════════════════════════════════════════════════════════
-- LOGIN AUDIT LOG
-- ═══════════════════════════════════════════════════════════
create table if not exists public.login_logs (
  id          bigserial primary key,
  user_id     bigint references public.users(id),
  username    text not null,
  role        text,
  device_info text,
  ip_address  text,
  action      text default 'login',   -- login | logout | failed
  logged_at   timestamptz default now()
);
create index if not exists idx_login_logs_user on public.login_logs(user_id);
create index if not exists idx_login_logs_date on public.login_logs(logged_at);

-- ═══════════════════════════════════════════════════════════
-- STATUS HISTORY
-- ═══════════════════════════════════════════════════════════
create table if not exists public.status_history (
  id          bigserial primary key,
  manager_id  bigint references public.users(id),
  status      text not null,
  timestamp   timestamptz default now(),
  -- year/month for fast filtering
  year        smallint generated always as (extract(year from timestamp)::smallint) stored,
  month       smallint generated always as (extract(month from timestamp)::smallint) stored
);
create index if not exists idx_status_manager on public.status_history(manager_id);
create index if not exists idx_status_ym      on public.status_history(year, month);

-- ═══════════════════════════════════════════════════════════
-- CUSTOMERS
-- ═══════════════════════════════════════════════════════════
create table if not exists public.customers (
  id           bigserial primary key,
  name         text not null,
  owner_name   text default '',
  type         text default 'Retailer',
  address      text default '',
  phone        text default '',
  territory    text default '',
  latitude     double precision,
  longitude    double precision,
  visit_count  integer default 0,
  last_visited timestamptz,
  created_by   bigint references public.users(id),
  created_at   timestamptz default now(),
  updated_at   timestamptz
);
create index if not exists idx_customers_territory  on public.customers(territory);
create index if not exists idx_customers_created_by on public.customers(created_by);
create index if not exists idx_customers_name_trgm  on public.customers using gin(name gin_trgm_ops);

drop trigger if exists trg_customers_updated on public.customers;
create trigger trg_customers_updated
  before update on public.customers
  for each row execute procedure set_updated_at();

-- ═══════════════════════════════════════════════════════════
-- BRANDS
-- ═══════════════════════════════════════════════════════════
create table if not exists public.brands (
  id         bigserial primary key,
  name       text unique not null,
  created_at timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════
-- PRODUCTS
-- ═══════════════════════════════════════════════════════════
create table if not exists public.products (
  id         bigserial primary key,
  brand_id   bigint references public.brands(id),
  brand_name text default '',
  name       text not null,
  category   text default '',
  created_at timestamptz default now()
);
create index if not exists idx_products_brand on public.products(brand_id);

-- ═══════════════════════════════════════════════════════════
-- JOURNEYS
-- ═══════════════════════════════════════════════════════════
create table if not exists public.journeys (
  id               bigserial primary key,
  manager_id       bigint references public.users(id),
  date             date not null,
  start_time       timestamptz default now(),
  start_location   text default 'Starting Point',
  start_latitude   double precision,
  start_longitude  double precision,
  end_time         timestamptz,
  end_location     text,
  end_latitude     double precision,
  end_longitude    double precision,
  status           text default 'active',
  total_visits     integer default 0,
  total_km         double precision default 0,
  idle_alerts      integer default 0,
  suspicious_flags integer default 0,
  created_at       timestamptz default now(),
  -- year/month for fast YoY queries
  year             smallint generated always as (extract(year from date)::smallint) stored,
  month            smallint generated always as (extract(month from date)::smallint) stored
);
create index if not exists idx_journeys_manager on public.journeys(manager_id);
create index if not exists idx_journeys_date    on public.journeys(date);
create index if not exists idx_journeys_status  on public.journeys(status);
create index if not exists idx_journeys_ym      on public.journeys(year, month);

-- ═══════════════════════════════════════════════════════════
-- JOURNEY LOCATIONS (GPS trail)
-- ═══════════════════════════════════════════════════════════
create table if not exists public.journey_locations (
  id                bigserial primary key,
  journey_id        bigint references public.journeys(id) on delete cascade,
  manager_id        bigint references public.users(id),
  latitude          double precision not null,
  longitude         double precision not null,
  timestamp         timestamptz default now(),
  speed_kmh         double precision default 0,
  is_suspicious     boolean default false,
  suspicious_reason text default ''
);
create index if not exists idx_jloc_journey   on public.journey_locations(journey_id);
create index if not exists idx_jloc_manager   on public.journey_locations(manager_id);
create index if not exists idx_jloc_timestamp on public.journey_locations(timestamp);

-- ═══════════════════════════════════════════════════════════
-- VISITS
-- ═══════════════════════════════════════════════════════════
create table if not exists public.visits (
  id            bigserial primary key,
  manager_id    bigint references public.users(id),
  customer_id   bigint references public.customers(id),
  customer_name text default '',
  client_name   text default '',
  client_type   text default 'Retailer',
  visit_type    text default 'Field Visit',
  visit_date    date not null,
  location      text default '',
  latitude      double precision,
  longitude     double precision,
  status        text default 'Completed',
  notes         text default '',
  sale_amount   double precision default 0,
  journey_id    bigint references public.journeys(id),
  -- Contact details captured at time of visit
  contact_person text default '',
  contact_phone  text default '',
  -- Media
  photo         text default '',
  voice_note    text default '',
  created_at    timestamptz default now(),
  updated_at    timestamptz,
  -- year/month for fast YoY queries
  year          smallint generated always as (extract(year from visit_date)::smallint) stored,
  month         smallint generated always as (extract(month from visit_date)::smallint) stored
);
create index if not exists idx_visits_manager  on public.visits(manager_id);
create index if not exists idx_visits_date     on public.visits(visit_date);
create index if not exists idx_visits_customer on public.visits(customer_id);
create index if not exists idx_visits_ym       on public.visits(year, month);
create index if not exists idx_visits_journey  on public.visits(journey_id);

drop trigger if exists trg_visits_updated on public.visits;
create trigger trg_visits_updated
  before update on public.visits
  for each row execute procedure set_updated_at();

-- ═══════════════════════════════════════════════════════════
-- TARGETS
-- ═══════════════════════════════════════════════════════════
create table if not exists public.targets (
  id            bigserial primary key,
  manager_id    bigint references public.users(id),
  visit_target  integer default 0,
  sales_target  double precision default 0,
  month         smallint not null,
  year          smallint not null,
  created_at    timestamptz default now(),
  updated_at    timestamptz,
  unique(manager_id, month, year)
);
create index if not exists idx_targets_manager on public.targets(manager_id);
create index if not exists idx_targets_ym      on public.targets(year, month);

drop trigger if exists trg_targets_updated on public.targets;
create trigger trg_targets_updated
  before update on public.targets
  for each row execute procedure set_updated_at();

-- ═══════════════════════════════════════════════════════════
-- DAILY SALES REPORTS
-- ═══════════════════════════════════════════════════════════
create table if not exists public.daily_sales_reports (
  id                  bigserial primary key,
  manager_id          bigint references public.users(id),
  date                date not null,
  sales_target        double precision default 0,
  sales_achievement   double precision default 0,
  profit_target       double precision default 0,
  profit_achievement  double precision default 0,
  profit_percentage   double precision default 0,
  sales_percentage    double precision default 0,
  created_at          timestamptz default now(),
  updated_at          timestamptz,
  -- year/month for fast YoY queries
  year                smallint generated always as (extract(year from date)::smallint) stored,
  month               smallint generated always as (extract(month from date)::smallint) stored,
  unique(manager_id, date)
);
create index if not exists idx_reports_manager on public.daily_sales_reports(manager_id);
create index if not exists idx_reports_date    on public.daily_sales_reports(date);
create index if not exists idx_reports_ym      on public.daily_sales_reports(year, month);

drop trigger if exists trg_reports_updated on public.daily_sales_reports;
create trigger trg_reports_updated
  before update on public.daily_sales_reports
  for each row execute procedure set_updated_at();

-- ═══════════════════════════════════════════════════════════
-- PRODUCT DAY ENTRIES
-- ═══════════════════════════════════════════════════════════
create table if not exists public.product_day (
  id              bigserial primary key,
  manager_id      bigint references public.users(id),
  date            date not null,
  brand           text default '',
  brand_id        bigint references public.brands(id),
  product_name    text default '',
  product_id      bigint references public.products(id),
  target_qty      integer default 0,
  achieved_qty    integer default 0,
  target_amount   double precision default 0,
  achieved_amount double precision default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz,
  -- year/month for fast YoY queries
  year            smallint generated always as (extract(year from date)::smallint) stored,
  month           smallint generated always as (extract(month from date)::smallint) stored
);
create index if not exists idx_product_day_manager on public.product_day(manager_id);
create index if not exists idx_product_day_date    on public.product_day(date);
create index if not exists idx_product_day_brand   on public.product_day(brand_id);
create index if not exists idx_product_day_ym      on public.product_day(year, month);

drop trigger if exists trg_product_day_updated on public.product_day;
create trigger trg_product_day_updated
  before update on public.product_day
  for each row execute procedure set_updated_at();

-- ═══════════════════════════════════════════════════════════
-- OFFLINE QUEUE
-- ═══════════════════════════════════════════════════════════
create table if not exists public.offline_queue (
  id         bigserial primary key,
  device_id  text,
  type       text not null,
  payload    jsonb not null,
  status     text default 'pending',
  queued_at  timestamptz default now(),
  synced_at  timestamptz
);
create index if not exists idx_offline_status on public.offline_queue(status);

-- ═══════════════════════════════════════════════════════════
-- REALTIME — enable on all key tables
-- ═══════════════════════════════════════════════════════════
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.visits; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.journeys; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.journey_locations; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.status_history; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_sales_reports; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.product_day; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.customers; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.targets; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ═══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════
alter table public.users               enable row level security;
alter table public.visits              enable row level security;
alter table public.journeys            enable row level security;
alter table public.journey_locations   enable row level security;
alter table public.status_history      enable row level security;
alter table public.customers           enable row level security;
alter table public.brands              enable row level security;
alter table public.products            enable row level security;
alter table public.targets             enable row level security;
alter table public.daily_sales_reports enable row level security;
alter table public.product_day         enable row level security;
alter table public.login_logs          enable row level security;

-- Open policies (app handles its own auth via password hash)
-- These allow the anon key to read/write — your app validates identity
create policy "allow_all_users"               on public.users               for all using (true) with check (true);
create policy "allow_all_visits"              on public.visits              for all using (true) with check (true);
create policy "allow_all_journeys"            on public.journeys            for all using (true) with check (true);
create policy "allow_all_journey_locations"   on public.journey_locations   for all using (true) with check (true);
create policy "allow_all_status_history"      on public.status_history      for all using (true) with check (true);
create policy "allow_all_customers"           on public.customers           for all using (true) with check (true);
create policy "allow_all_brands"              on public.brands              for all using (true) with check (true);
create policy "allow_all_products"            on public.products            for all using (true) with check (true);
create policy "allow_all_targets"             on public.targets             for all using (true) with check (true);
create policy "allow_all_daily_reports"       on public.daily_sales_reports for all using (true) with check (true);
create policy "allow_all_product_day"         on public.product_day         for all using (true) with check (true);
create policy "allow_all_login_logs"          on public.login_logs          for all using (true) with check (true);

-- ═══════════════════════════════════════════════════════════
-- YEAR-ON-YEAR VIEW — pre-built for fast dashboard queries
-- ═══════════════════════════════════════════════════════════
create or replace view public.yoy_sales_summary as
select
  r.manager_id,
  u.full_name   as manager_name,
  u.territory,
  r.year,
  r.month,
  sum(r.sales_achievement)  as total_sales,
  sum(r.profit_achievement) as total_profit,
  sum(r.sales_target)       as total_target,
  count(*)                  as report_days,
  case when sum(r.sales_target) > 0
       then round((sum(r.sales_achievement) / sum(r.sales_target) * 100)::numeric, 1)
       else 0
  end as achievement_pct
from public.daily_sales_reports r
join public.users u on u.id = r.manager_id
group by r.manager_id, u.full_name, u.territory, r.year, r.month
order by r.year desc, r.month desc;

-- Monthly visits summary
create or replace view public.yoy_visits_summary as
select
  v.manager_id,
  u.full_name  as manager_name,
  u.territory,
  v.year,
  v.month,
  count(*)     as total_visits,
  count(distinct v.customer_id) as unique_customers,
  count(distinct v.visit_date)  as active_days
from public.visits v
join public.users u on u.id = v.manager_id
group by v.manager_id, u.full_name, u.territory, v.year, v.month
order by v.year desc, v.month desc;

-- ═══════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════
insert into public.users (id, username, password_hash, full_name, role, email, is_active)
values (1, 'admin', 'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7', 'System Administrator', 'Admin', 'admin@dcc.com', true)
on conflict (username) do nothing;

insert into public.brands (name) values ('Brand Alpha'), ('Brand Beta'), ('Brand Gamma')
on conflict (name) do nothing;

insert into public.customers (name, owner_name, type, address, phone, territory, latitude, longitude)
values
  ('ABC Distributors', 'Ramesh Shah',  'Distributor', 'Andheri West, Mumbai', '9000000001', 'Mumbai West', 19.1383, 72.8273),
  ('XYZ Traders',      'Suresh Patel', 'Retailer',    'Bandra, Mumbai',       '9000000002', 'Mumbai West', 19.0596, 72.8295),
  ('PQR Wholesalers',  'Amit Kumar',   'Wholesaler',  'Kurla, Mumbai',        '9000000003', 'Mumbai East', 19.0728, 72.8826),
  ('MNO Infotech',     'Priya Sharma', 'Dealer',      'Thane, Mumbai',        '9000000004', 'Mumbai East', 19.2183, 72.9781)
on conflict do nothing;

select setval('public.users_id_seq',    (select max(id) from public.users));
select setval('public.brands_id_seq',   (select max(id) from public.brands));
select setval('public.customers_id_seq',(select max(id) from public.customers));

-- ─── MIGRATION: Add missing columns to visits (run if schema already deployed) ─
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS contact_person text default '';
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS contact_phone  text default '';
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS photo         text default '';
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS voice_note    text default '';

-- ═══════════════════════════════════════════════════════════
-- PERFORMANCE: Composite indexes (v2 additions)
-- ═══════════════════════════════════════════════════════════
-- Compound index for the most common admin query: "visits by manager on a date"
create index if not exists idx_visits_manager_date
  on public.visits(manager_id, visit_date);

-- Journey locations: fast trail retrieval sorted by time
create index if not exists idx_jloc_journey_ts
  on public.journey_locations(journey_id, timestamp);

-- Daily reports: fast per-manager date range lookup
create index if not exists idx_reports_manager_date
  on public.daily_sales_reports(manager_id, date);

-- Product day: fast per-manager + date queries
create index if not exists idx_product_day_manager_date
  on public.product_day(manager_id, date);

-- Targets: fast per-manager + year/month lookups
create index if not exists idx_targets_manager_ym
  on public.targets(manager_id, year, month);

-- ═══════════════════════════════════════════════════════════
-- ERROR LOGS
-- ═══════════════════════════════════════════════════════════
<<<<<<< HEAD
-- 12. error_logs (For Global Error Logger)
CREATE TABLE IF NOT EXISTS public.error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,                     -- Optional, if logged in
    username TEXT,                    -- Optional, if logged in
    message TEXT NOT NULL,
    source TEXT,
    lineno INTEGER,
    colno INTEGER,
    error_object JSONB,
    userAgent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS error_logs_created_at_idx ON public.error_logs (created_at DESC);


-- ==============================================================================
-- 13. ENTERPRISE AUDIT TRAIL LOGGING (MNC Compliance)
-- Provides a strict, immutable ledger of all insert, update, delete operations.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name TEXT NOT NULL,         -- The table affected
    action TEXT NOT NULL,             -- INSERT, UPDATE, DELETE
    record_id UUID NOT NULL,          -- ID of the modified record
    old_data JSONB,                   -- State before modification
    new_data JSONB,                   -- State after modification
    changed_by UUID,                  -- The user who performed the action (from auth.uid())
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_logs_record_id_idx ON public.audit_logs (record_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);

-- Generic Audit Trigger Function
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_logs (table_name, action, record_id, new_data, changed_by)
        VALUES (TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(NEW), auth.uid());
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.audit_logs (table_name, action, record_id, old_data, new_data, changed_by)
        VALUES (TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(OLD), to_jsonb(NEW), auth.uid());
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_logs (table_name, action, record_id, old_data, changed_by)
        VALUES (TG_TABLE_NAME, TG_OP, OLD.id, to_jsonb(OLD), auth.uid());
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach Audit Triggers to Critical Entities Only
-- (Safe mechanism to replace if already exists: Drop then Create)

DROP TRIGGER IF EXISTS audit_customers_trigger ON public.customers;
CREATE TRIGGER audit_customers_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_visits_trigger ON public.visits;
CREATE TRIGGER audit_visits_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_journeys_trigger ON public.journeys;
CREATE TRIGGER audit_journeys_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.journeys
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_daily_sales_reports_trigger ON public.daily_sales_reports;
CREATE TRIGGER audit_daily_sales_reports_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.daily_sales_reports
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- ==============================================================================
-- END OF SUPABASE SCHEMA
-- ==============================================================================
=======
create table if not exists public.error_logs (
  id            bigserial primary key,
  user_id       bigint references public.users(id) on delete set null,
  error_message text,
  stack_trace   text,
  url           text,
  created_at    timestamptz default now()
);
create index if not exists idx_error_logs_user on public.error_logs(user_id);
>>>>>>> ecb89041b24eaef3779c80e7f2d9a9ecd541facf
create index if not exists idx_error_logs_date on public.error_logs(created_at);

alter table public.error_logs enable row level security;
create policy "allow_all_error_logs" on public.error_logs for all using (true) with check (true);

-- ═══════════════════════════════════════════════════════════
-- SYNC LOGS
-- ═══════════════════════════════════════════════════════════
create table if not exists public.sync_logs (
  id          bigserial primary key,
  device_id   text,
  user_id     bigint references public.users(id) on delete set null,
  synced_at   timestamptz default now(),
  pushed      integer default 0,
  pulled      integer default 0,
  conflicts   integer default 0,
  error       text
);
create index if not exists idx_sync_logs_user on public.sync_logs(user_id);
create index if not exists idx_sync_logs_date on public.sync_logs(synced_at);

alter table public.sync_logs enable row level security;
create policy "allow_all_sync_logs" on public.sync_logs for all using (true) with check (true);

-- ═══════════════════════════════════════════════════════════
-- RPC: get_live_status_batch
-- Replaces N×5 individual queries with a single SQL call.
-- Called by the Admin Dashboard LiveField view.
-- Returns one row per active Sales Manager.
-- ═══════════════════════════════════════════════════════════
create or replace function public.get_live_status_batch(target_date date)
returns table (
  manager_id         bigint,
  manager_name       text,
  manager_username   text,
  territory          text,
  email              text,
  phone              text,
  curr_status        text,
  last_status_at     timestamptz,
  visits_today       bigint,
  today_sales        numeric,
  active_journey_id  bigint,
  journey_started_at timestamptz,
  suspicious_flags   integer,
  last_gps_lat       double precision,
  last_gps_lng       double precision,
  last_gps_time      timestamptz,
  last_gps_speed     double precision
)
language sql
stable
as $$
  with
  -- Most recent status per manager
  latest_status as (
    select distinct on (manager_id)
      manager_id, status, timestamp
    from public.status_history
    order by manager_id, timestamp desc
  ),
  -- Today's visit count per manager
  today_visits as (
    select manager_id, count(*) as cnt, coalesce(sum(sale_amount), 0) as total_sales
    from public.visits
    where visit_date = target_date
    group by manager_id
  ),
  -- Active journey per manager
  active_journey as (
    select distinct on (manager_id)
      id as journey_id, manager_id, start_time,
      suspicious_flags, status
    from public.journeys
    where status = 'active' and date = target_date
    order by manager_id, start_time desc
  ),
  -- Last GPS location per active journey
  last_gps as (
    select distinct on (jl.manager_id)
      jl.manager_id,
      jl.latitude, jl.longitude, jl.timestamp, jl.speed_kmh
    from public.journey_locations jl
    inner join active_journey aj on aj.journey_id = jl.journey_id
    order by jl.manager_id, jl.timestamp desc
  )
  select
    u.id                              as manager_id,
    u.full_name                       as manager_name,
    u.username                        as manager_username,
    u.territory,
    u.email,
    u.phone,
    coalesce(ls.status, 'In-Office')  as curr_status,
    ls.timestamp                      as last_status_at,
    coalesce(tv.cnt, 0)               as visits_today,
    coalesce(tv.total_sales, 0)       as today_sales,
    aj.journey_id                     as active_journey_id,
    aj.start_time                     as journey_started_at,
    coalesce(aj.suspicious_flags, 0)  as suspicious_flags,
    lg.latitude                       as last_gps_lat,
    lg.longitude                      as last_gps_lng,
    lg.timestamp                      as last_gps_time,
    lg.speed_kmh                      as last_gps_speed
  from public.users u
  left join latest_status  ls on ls.manager_id = u.id
  left join today_visits   tv on tv.manager_id = u.id
  left join active_journey aj on aj.manager_id = u.id
  left join last_gps       lg on lg.manager_id = u.id
  where u.role = 'Sales Manager'
    and u.is_active = true
  order by u.full_name
$$;

