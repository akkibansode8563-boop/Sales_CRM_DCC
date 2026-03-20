-- ============================================================
-- DCC SalesForce CRM — Supabase Database Schema
-- Run this entire script in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── USERS ────────────────────────────────────────────────
create table if not exists public.users (
  id            bigserial primary key,
  username      text unique not null,
  password_hash text not null,
  plain_password text,
  full_name     text not null,
  role          text not null default 'Sales Manager',
  email         text default '',
  phone         text default '',
  territory     text default '',
  is_active     boolean default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz,
  deleted_at    timestamptz
);

-- ─── STATUS HISTORY ───────────────────────────────────────
create table if not exists public.status_history (
  id          bigserial primary key,
  manager_id  bigint references public.users(id),
  status      text not null,
  timestamp   timestamptz default now()
);
create index if not exists idx_status_manager on public.status_history(manager_id);

-- ─── CUSTOMERS ────────────────────────────────────────────
create table if not exists public.customers (
  id          bigserial primary key,
  name        text not null,
  owner_name  text default '',
  type        text default 'Retailer',
  address     text default '',
  phone       text default '',
  territory   text default '',
  latitude    double precision,
  longitude   double precision,
  visit_count integer default 0,
  last_visited timestamptz,
  created_by  bigint references public.users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz
);
create index if not exists idx_customers_territory on public.customers(territory);

-- ─── BRANDS ───────────────────────────────────────────────
create table if not exists public.brands (
  id         bigserial primary key,
  name       text unique not null,
  created_at timestamptz default now()
);

-- ─── PRODUCTS ─────────────────────────────────────────────
create table if not exists public.products (
  id         bigserial primary key,
  brand_id   bigint references public.brands(id),
  brand_name text default '',
  name       text not null,
  category   text default '',
  created_at timestamptz default now()
);

-- ─── JOURNEYS ─────────────────────────────────────────────
create table if not exists public.journeys (
  id                bigserial primary key,
  manager_id        bigint references public.users(id),
  date              date not null,
  start_time        timestamptz default now(),
  start_location    text default 'Starting Point',
  start_latitude    double precision,
  start_longitude   double precision,
  end_time          timestamptz,
  end_location      text,
  end_latitude      double precision,
  end_longitude     double precision,
  status            text default 'active',
  total_visits      integer default 0,
  total_km          double precision default 0,
  idle_alerts       integer default 0,
  suspicious_flags  integer default 0,
  created_at        timestamptz default now()
);
create index if not exists idx_journeys_manager on public.journeys(manager_id);
create index if not exists idx_journeys_date on public.journeys(date);
create index if not exists idx_journeys_status on public.journeys(status);

-- ─── JOURNEY LOCATIONS (GPS Trail) ────────────────────────
create table if not exists public.journey_locations (
  id                bigserial primary key,
  journey_id        bigint references public.journeys(id),
  manager_id        bigint references public.users(id),
  latitude          double precision not null,
  longitude         double precision not null,
  timestamp         timestamptz default now(),
  speed_kmh         double precision default 0,
  is_suspicious     boolean default false,
  suspicious_reason text default ''
);
create index if not exists idx_jloc_journey on public.journey_locations(journey_id);
create index if not exists idx_jloc_manager on public.journey_locations(manager_id);

-- ─── VISITS ───────────────────────────────────────────────
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
  created_at    timestamptz default now(),
  updated_at    timestamptz
);
create index if not exists idx_visits_manager on public.visits(manager_id);
create index if not exists idx_visits_date on public.visits(visit_date);
create index if not exists idx_visits_customer on public.visits(customer_id);

-- ─── TARGETS ──────────────────────────────────────────────
create table if not exists public.targets (
  id            bigserial primary key,
  manager_id    bigint references public.users(id),
  visit_target  integer default 0,
  sales_target  double precision default 0,
  month         integer not null,
  year          integer not null,
  created_at    timestamptz default now(),
  unique(manager_id, month, year)
);

-- ─── DAILY SALES REPORTS ──────────────────────────────────
create table if not exists public.daily_sales_reports (
  id                   bigserial primary key,
  manager_id           bigint references public.users(id),
  date                 date not null,
  sales_target         double precision default 0,
  sales_achievement    double precision default 0,
  profit_target        double precision default 0,
  profit_achievement   double precision default 0,
  profit_percentage    double precision default 0,
  sales_percentage     double precision default 0,
  created_at           timestamptz default now(),
  updated_at           timestamptz,
  unique(manager_id, date)
);
create index if not exists idx_reports_manager on public.daily_sales_reports(manager_id);
create index if not exists idx_reports_date on public.daily_sales_reports(date);

-- ─── PRODUCT DAY ENTRIES ──────────────────────────────────
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
  updated_at      timestamptz
);
create index if not exists idx_product_day_manager on public.product_day(manager_id);
create index if not exists idx_product_day_date on public.product_day(date);

-- ─── OFFLINE QUEUE ────────────────────────────────────────
create table if not exists public.offline_queue (
  id          bigserial primary key,
  device_id   text,
  type        text not null,
  payload     jsonb not null,
  status      text default 'pending',
  queued_at   timestamptz default now(),
  synced_at   timestamptz
);

-- ─── ENABLE REALTIME on key tables ────────────────────────
alter publication supabase_realtime add table public.visits;
alter publication supabase_realtime add table public.journeys;
alter publication supabase_realtime add table public.journey_locations;
alter publication supabase_realtime add table public.status_history;
alter publication supabase_realtime add table public.daily_sales_reports;

-- ─── ROW LEVEL SECURITY ───────────────────────────────────
-- We use service_role key server-side, anon key for client
-- For this PWA, we use anon key + disable RLS for now (enable later with proper auth)
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

-- Allow all operations for anon (app handles its own auth)
-- In production: replace with proper JWT policies
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

-- ─── SEED DATA ────────────────────────────────────────────
-- Admin user (password: Admin@123)
insert into public.users (id, username, password_hash, plain_password, full_name, role, email, is_active)
values (1, 'admin', 'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7', 'Admin@123', 'System Administrator', 'Admin', 'admin@dcc.com', true)
on conflict (username) do nothing;

-- Sample brands
insert into public.brands (name) values ('Brand Alpha'), ('Brand Beta'), ('Brand Gamma')
on conflict (name) do nothing;

-- Sample customers
insert into public.customers (name, owner_name, type, address, phone, territory, latitude, longitude)
values
  ('ABC Distributors', 'Ramesh Shah',  'Distributor', 'Andheri West, Mumbai', '9000000001', 'Mumbai West', 19.1383, 72.8273),
  ('XYZ Traders',      'Suresh Patel', 'Retailer',    'Bandra, Mumbai',       '9000000002', 'Mumbai West', 19.0596, 72.8295),
  ('PQR Wholesalers',  'Amit Kumar',   'Wholesaler',  'Kurla, Mumbai',        '9000000003', 'Mumbai East', 19.0728, 72.8826),
  ('MNO Infotech',     'Priya Sharma', 'Dealer',      'Thane, Mumbai',        '9000000004', 'Mumbai East', 19.2183, 72.9781)
on conflict do nothing;

-- Sequence reset to avoid ID conflicts
select setval('public.users_id_seq', (select max(id) from public.users));
select setval('public.brands_id_seq', (select max(id) from public.brands));
select setval('public.customers_id_seq', (select max(id) from public.customers));
