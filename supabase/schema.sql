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
alter table public.users drop column if exists plain_password;
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
  customer_code text,
  gst_number   text default '',
  owner_name   text default '',
  type         text default 'Retailer',
  address      text default '',
  phone        text default '',
  territory    text default '',
  city         text default '',
  state        text default '',
  branch       text default '',
  zone         text default '',
  company_id   text default '',
  status       text default 'active',
  latitude     double precision,
  longitude    double precision,
  visit_count  integer default 0,
  last_visited timestamptz,
  created_by   bigint references public.users(id),
  updated_by   bigint references public.users(id),
  source       text default 'app',
  synced_at    timestamptz,
  archived_at  timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz default now(),
  updated_at   timestamptz
);
create index if not exists idx_customers_territory  on public.customers(territory);
create index if not exists idx_customers_created_by on public.customers(created_by);
create index if not exists idx_customers_name_trgm  on public.customers using gin(name gin_trgm_ops);
create index if not exists idx_customers_phone      on public.customers(phone);
create index if not exists idx_customers_gst        on public.customers(gst_number);
create index if not exists idx_customers_status     on public.customers(status);

create table if not exists public.customer_contacts (
  id           bigserial primary key,
  customer_id   bigint references public.customers(id) on delete cascade,
  contact_name  text not null,
  contact_role  text default '',
  phone         text default '',
  email         text default '',
  is_primary    boolean default false,
  created_by    bigint references public.users(id),
  updated_by    bigint references public.users(id),
  source        text default 'app',
  synced_at     timestamptz,
  archived_at   timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz
);
create index if not exists idx_customer_contacts_customer on public.customer_contacts(customer_id);
create index if not exists idx_customer_contacts_phone    on public.customer_contacts(phone);

drop trigger if exists trg_customer_contacts_updated on public.customer_contacts;
create trigger trg_customer_contacts_updated
  before update on public.customer_contacts
  for each row execute procedure set_updated_at();

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
  contact_person text default '',
  contact_phone text default '',
  check_in_at   timestamptz,
  check_out_at  timestamptz,
  image_thumb   text,
  created_by    bigint references public.users(id),
  updated_by    bigint references public.users(id),
  source        text default 'app',
  synced_at     timestamptz,
  archived_at   timestamptz,
  deleted_at    timestamptz,
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
create index if not exists idx_visits_status   on public.visits(status);

create table if not exists public.visit_notes (
  id            bigserial primary key,
  visit_id       bigint references public.visits(id) on delete cascade,
  customer_id    bigint references public.customers(id),
  manager_id     bigint references public.users(id),
  note_type      text default 'general',
  note_text      text not null,
  language_code  text default 'en',
  created_by     bigint references public.users(id),
  updated_by     bigint references public.users(id),
  source         text default 'app',
  synced_at      timestamptz,
  archived_at    timestamptz,
  deleted_at     timestamptz,
  created_at     timestamptz default now(),
  updated_at     timestamptz
);
create index if not exists idx_visit_notes_visit     on public.visit_notes(visit_id);
create index if not exists idx_visit_notes_customer  on public.visit_notes(customer_id);

drop trigger if exists trg_visit_notes_updated on public.visit_notes;
create trigger trg_visit_notes_updated
  before update on public.visit_notes
  for each row execute procedure set_updated_at();

create table if not exists public.tasks (
  id              bigserial primary key,
  manager_id       bigint references public.users(id),
  customer_id      bigint references public.customers(id),
  visit_id         bigint references public.visits(id),
  title            text not null,
  description      text default '',
  status           text default 'open',
  priority         text default 'medium',
  due_at           timestamptz,
  completed_at     timestamptz,
  reminder_at      timestamptz,
  reminder_type    text default 'push',
  assigned_by      bigint references public.users(id),
  created_by       bigint references public.users(id),
  updated_by       bigint references public.users(id),
  source           text default 'app',
  synced_at        timestamptz,
  archived_at      timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz
);
create index if not exists idx_tasks_manager   on public.tasks(manager_id);
create index if not exists idx_tasks_customer  on public.tasks(customer_id);
create index if not exists idx_tasks_status    on public.tasks(status);
create index if not exists idx_tasks_due_at    on public.tasks(due_at);

drop trigger if exists trg_tasks_updated on public.tasks;
create trigger trg_tasks_updated
  before update on public.tasks
  for each row execute procedure set_updated_at();

create table if not exists public.sales_orders (
  id               bigserial primary key,
  manager_id        bigint references public.users(id),
  customer_id       bigint references public.customers(id),
  visit_id          bigint references public.visits(id),
  order_number      text,
  order_status      text default 'draft',
  order_total       double precision default 0,
  currency_code     text default 'INR',
  created_by        bigint references public.users(id),
  updated_by        bigint references public.users(id),
  source            text default 'app',
  synced_at         timestamptz,
  archived_at       timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz
);
create index if not exists idx_sales_orders_customer on public.sales_orders(customer_id);
create index if not exists idx_sales_orders_manager  on public.sales_orders(manager_id);
create index if not exists idx_sales_orders_status   on public.sales_orders(order_status);

drop trigger if exists trg_sales_orders_updated on public.sales_orders;
create trigger trg_sales_orders_updated
  before update on public.sales_orders
  for each row execute procedure set_updated_at();

create table if not exists public.payments (
  id               bigserial primary key,
  customer_id       bigint references public.customers(id),
  sales_order_id    bigint references public.sales_orders(id),
  manager_id        bigint references public.users(id),
  payment_status    text default 'pending',
  amount            double precision default 0,
  paid_at           timestamptz,
  payment_mode      text default '',
  reference_number  text default '',
  created_by        bigint references public.users(id),
  updated_by        bigint references public.users(id),
  source            text default 'app',
  synced_at         timestamptz,
  archived_at       timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz
);
create index if not exists idx_payments_customer on public.payments(customer_id);
create index if not exists idx_payments_order    on public.payments(sales_order_id);
create index if not exists idx_payments_status   on public.payments(payment_status);

drop trigger if exists trg_payments_updated on public.payments;
create trigger trg_payments_updated
  before update on public.payments
  for each row execute procedure set_updated_at();

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
alter publication supabase_realtime add table public.visits;
alter publication supabase_realtime add table public.journeys;
alter publication supabase_realtime add table public.journey_locations;
alter publication supabase_realtime add table public.status_history;
alter publication supabase_realtime add table public.daily_sales_reports;
alter publication supabase_realtime add table public.product_day;
alter publication supabase_realtime add table public.customers;
alter publication supabase_realtime add table public.targets;

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
alter table public.customer_contacts   enable row level security;
alter table public.visit_notes         enable row level security;
alter table public.tasks               enable row level security;
alter table public.sales_orders        enable row level security;
alter table public.payments            enable row level security;

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
create policy "allow_all_customer_contacts"   on public.customer_contacts   for all using (true) with check (true);
create policy "allow_all_visit_notes"         on public.visit_notes         for all using (true) with check (true);
create policy "allow_all_tasks"               on public.tasks               for all using (true) with check (true);
create policy "allow_all_sales_orders"        on public.sales_orders        for all using (true) with check (true);
create policy "allow_all_payments"            on public.payments            for all using (true) with check (true);

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

create or replace view public.manager_daily_snapshot as
select
  u.id as manager_id,
  u.full_name as manager_name,
  u.territory,
  current_date as snapshot_date,
  coalesce(v.total_visits, 0) as total_visits,
  coalesce(v.unique_customers, 0) as unique_customers,
  coalesce(r.total_sales, 0) as total_sales,
  coalesce(r.total_profit, 0) as total_profit,
  coalesce(t.open_tasks, 0) as open_tasks,
  coalesce(t.overdue_tasks, 0) as overdue_tasks
from public.users u
left join (
  select manager_id, visit_date, count(*) as total_visits, count(distinct customer_id) as unique_customers
  from public.visits
  where deleted_at is null
  group by manager_id, visit_date
) v on v.manager_id = u.id and v.visit_date = current_date
left join (
  select manager_id, date, sum(sales_achievement) as total_sales, sum(profit_achievement) as total_profit
  from public.daily_sales_reports
  group by manager_id, date
) r on r.manager_id = u.id and r.date = current_date
left join (
  select manager_id,
         count(*) filter (where status <> 'completed' and deleted_at is null) as open_tasks,
         count(*) filter (where status <> 'completed' and due_at < now() and deleted_at is null) as overdue_tasks
  from public.tasks
  group by manager_id
) t on t.manager_id = u.id
where u.role = 'Sales Manager' and u.is_active = true;

create or replace view public.customer_timeline_summary as
select
  c.id as customer_id,
  c.name as customer_name,
  c.owner_name,
  c.phone,
  c.territory,
  c.status,
  c.last_visited,
  coalesce(v.total_visits, 0) as total_visits,
  coalesce(v.last_visit_at, c.last_visited) as last_visit_at,
  coalesce(t.open_tasks, 0) as open_tasks,
  coalesce(o.total_orders, 0) as total_orders,
  coalesce(p.total_payments, 0) as total_payments
from public.customers c
left join (
  select customer_id, count(*) as total_visits, max(created_at) as last_visit_at
  from public.visits
  where deleted_at is null
  group by customer_id
) v on v.customer_id = c.id
left join (
  select customer_id, count(*) as open_tasks
  from public.tasks
  where status <> 'completed' and deleted_at is null
  group by customer_id
) t on t.customer_id = c.id
left join (
  select customer_id, count(*) as total_orders
  from public.sales_orders
  where deleted_at is null
  group by customer_id
) o on o.customer_id = c.id
left join (
  select customer_id, sum(amount) as total_payments
  from public.payments
  where deleted_at is null
  group by customer_id
) p on p.customer_id = c.id
where c.deleted_at is null;

-- ═══════════════════════════════════════════════════════════
-- LIVE MANAGER STATE (single-source admin dashboard view)
-- ═══════════════════════════════════════════════════════════
create or replace view public.manager_live_state as
select
  u.id,
  u.full_name as name,
  u.username,
  coalesce(nullif(u.territory, ''), '—') as territory,
  coalesce(u.email, '') as email,
  coalesce(u.phone, '') as phone,
  coalesce(curr.status, 'In-Office') as status,
  curr.timestamp as last_update,
  coalesce(vcount.visits_today, 0) as visits_today,
  case
    when last_visit.id is null then null
    else jsonb_build_object(
      'name', last_visit.location,
      'lat', last_visit.latitude,
      'lng', last_visit.longitude,
      'time', last_visit.created_at,
      'customer_name', coalesce(last_visit.client_name, last_visit.customer_name, ''),
      'visit_number', coalesce(vcount.visits_today, 0)
    )
  end as last_location,
  case
    when gps.id is null then null
    else jsonb_build_object(
      'lat', gps.latitude,
      'lng', gps.longitude,
      'time', gps.timestamp,
      'speed', gps.speed_kmh
    )
  end as last_gps,
  case
    when active_journey.id is null then null
    else jsonb_build_object(
      'id', active_journey.id,
      'started_at', active_journey.start_time,
      'visit_count', coalesce(vcount.visits_today, 0),
      'suspicious_flags', coalesce(active_journey.suspicious_flags, 0)
    )
  end as active_journey,
  case
    when latest_target.id is null then null
    else jsonb_build_object(
      'id', latest_target.id,
      'manager_id', latest_target.manager_id,
      'visit_target', latest_target.visit_target,
      'sales_target', latest_target.sales_target,
      'month', latest_target.month,
      'year', latest_target.year
    )
  end as target,
  coalesce(today_report.sales_achievement, 0) as today_sales
from public.users u
left join lateral (
  select sh.status, sh.timestamp
  from public.status_history sh
  where sh.manager_id = u.id
  order by sh.timestamp desc
  limit 1
) curr on true
left join lateral (
  select count(*)::integer as visits_today
  from public.visits v
  where v.manager_id = u.id and v.visit_date = current_date
) vcount on true
left join lateral (
  select v.id, v.location, v.latitude, v.longitude, v.created_at, v.client_name, v.customer_name
  from public.visits v
  where v.manager_id = u.id and v.visit_date = current_date
  order by v.created_at desc
  limit 1
) last_visit on true
left join lateral (
  select j.id, j.start_time, j.suspicious_flags
  from public.journeys j
  where j.manager_id = u.id and j.status = 'active'
  order by j.start_time desc
  limit 1
) active_journey on true
left join lateral (
  select jl.id, jl.latitude, jl.longitude, jl.timestamp, jl.speed_kmh
  from public.journey_locations jl
  where jl.journey_id = active_journey.id
  order by jl.timestamp desc
  limit 1
) gps on true
left join lateral (
  select t.*
  from public.targets t
  where t.manager_id = u.id
  order by t.year desc, t.month desc
  limit 1
) latest_target on true
left join lateral (
  select dsr.sales_achievement
  from public.daily_sales_reports dsr
  where dsr.manager_id = u.id and dsr.date = current_date
  limit 1
) today_report on true
where u.role = 'Sales Manager'
  and coalesce(u.is_active, true) = true;

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
