-- Migration: route optimization, daily attendance, and fuel-savings history.
-- Run once in the Supabase SQL editor (safe to re-run).

-- 1) Children pickup coordinates (geocoded from the parent's pickup address) ---
alter table public.children add column if not exists pickup_lat double precision;
alter table public.children add column if not exists pickup_lng double precision;

-- 2) Base route per driver -----------------------------------------------------
create table if not exists public.routes (
  driver_id uuid primary key references public.drivers (id) on delete cascade,
  home_address text not null default '',
  home_lat double precision,
  home_lng double precision,
  school_name text not null default '',
  school_lat double precision,
  school_lng double precision,
  child_order uuid[] not null default '{}',         -- manual pickup order
  fuel_avg_kmpl numeric(5, 2) not null default 10,  -- vehicle fuel average
  updated_at timestamptz not null default now()
);

-- 3) Daily attendance (present by default; we store deviations + parent marks) -
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  driver_id uuid references public.drivers (id) on delete set null,
  parent_id uuid not null references public.profiles (id) on delete cascade,
  date date not null default current_date,
  status text not null default 'present' check (status in ('present', 'absent')),
  marked_by text not null default 'driver' check (marked_by in ('driver', 'parent')),
  created_at timestamptz not null default now(),
  unique (child_id, date)
);
create index if not exists attendance_driver_date on public.attendance (driver_id, date);

-- 4) Per-day route metrics (one row per driver/day/period) ---------------------
create table if not exists public.route_logs (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  date date not null default current_date,
  period text not null check (period in ('morning', 'afternoon')),
  stops int not null default 0,
  optimized_distance_m double precision not null default 0,
  unoptimized_distance_m double precision not null default 0,
  duration_s double precision not null default 0,
  fuel_cost numeric(10, 2) not null default 0,         -- optimized cost (PKR)
  fuel_saved numeric(10, 2) not null default 0,        -- saved vs unoptimized (PKR)
  distance_saved_m double precision not null default 0,
  time_saved_s double precision not null default 0,
  engine text not null default 'haversine',            -- google | osrm | haversine
  created_at timestamptz not null default now(),
  unique (driver_id, date, period)
);
create index if not exists route_logs_driver_date on public.route_logs (driver_id, date desc);

-- 5) Row Level Security --------------------------------------------------------
alter table public.routes enable row level security;
alter table public.attendance enable row level security;
alter table public.route_logs enable row level security;

-- routes: a driver manages only their own base route.
drop policy if exists routes_all on public.routes;
create policy routes_all on public.routes for all
  using (auth.uid() = driver_id) with check (auth.uid() = driver_id);

-- attendance: a parent manages their own child's attendance; a driver may
-- read/write attendance for children currently linked to them.
drop policy if exists attendance_parent_all on public.attendance;
create policy attendance_parent_all on public.attendance for all
  using (auth.uid() = parent_id) with check (auth.uid() = parent_id);
drop policy if exists attendance_driver_all on public.attendance;
create policy attendance_driver_all on public.attendance for all
  using (
    exists (
      select 1 from public.children c
      where c.id = attendance.child_id and c.driver_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.children c
      where c.id = attendance.child_id and c.driver_id = auth.uid()
    )
  );

-- route_logs: a driver manages only their own logs.
drop policy if exists route_logs_all on public.route_logs;
create policy route_logs_all on public.route_logs for all
  using (auth.uid() = driver_id) with check (auth.uid() = driver_id);
