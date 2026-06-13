-- VanSafe database schema (Supabase / Postgres)
-- Run this in the Supabase SQL editor for a fresh project.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('parent', 'driver')),
  name text not null,
  email text not null,
  whatsapp text not null,
  city text not null default '',
  area text not null default '',
  school text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key references public.profiles (id) on delete cascade,
  area text default '',
  areas text[] not null default '{}',
  schools text[] not null default '{}',
  vehicle_type text default 'Mini Van' check (vehicle_type in ('Mini Van', 'Standard Van', 'Hi-Roof')),
  vehicle_model text not null default '',
  plate text default '',
  capacity int not null default 8,
  official_capacity int not null default 8,
  occupancy int not null default 0,
  make_model text not null default '',
  color text not null default '',
  year int,
  bio text default '',
  cnic_url text,
  vehicle_doc_url text,
  verified boolean not null default false,
  rating numeric(2, 1) not null default 0,
  review_count int not null default 0,
  created_at timestamptz not null default now()
);

-- Each child has their own profile and independent driver link (nullable).
create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  school text not null default '',
  pickup_address text not null default '',
  driver_id uuid references public.drivers (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists children_parent on public.children (parent_id);
create index if not exists children_driver on public.children (driver_id);

-- At most 5 children per parent.
create or replace function public.enforce_child_limit()
returns trigger as $$
begin
  if (select count(*) from public.children where parent_id = new.parent_id) >= 5 then
    raise exception 'A parent can have at most 5 children';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_child_limit on public.children;
create trigger trg_child_limit
  before insert on public.children
  for each row execute function public.enforce_child_limit();

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  parent_id uuid not null references public.profiles (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists locations_driver_time on public.locations (driver_id, created_at desc);

create table if not exists public.tracking_sessions (
  driver_id uuid primary key references public.drivers (id) on delete cascade,
  active boolean not null default false,
  status text not null default 'idle',
  started_at timestamptz,
  pings_today int not null default 0,
  last_ping_date date
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  type text not null check (type in ('departed', 'arrived', 'stationary', 'route_deviation', 'info')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists alerts_parent_time on public.alerts (parent_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Rating recompute trigger
-- ---------------------------------------------------------------------------

create or replace function public.recompute_driver_rating()
returns trigger as $$
begin
  update public.drivers d
  set
    rating = coalesce((select round(avg(r.rating)::numeric, 1) from public.reviews r where r.driver_id = d.id), 0),
    review_count = (select count(*) from public.reviews r where r.driver_id = d.id)
  where d.id = coalesce(new.driver_id, old.driver_id);
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_recompute_rating on public.reviews;
create trigger trg_recompute_rating
  after insert or update or delete on public.reviews
  for each row execute function public.recompute_driver_rating();

-- ---------------------------------------------------------------------------
-- New-user trigger: create a profile + driver row from auth metadata
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger as $$
declare
  meta jsonb := new.raw_user_meta_data;
  urole text := coalesce(meta ->> 'role', 'parent');
begin
  insert into public.profiles (id, role, name, email, whatsapp, city)
  values (
    new.id,
    urole,
    coalesce(meta ->> 'name', 'New User'),
    new.email,
    coalesce(meta ->> 'whatsapp', ''),
    coalesce(meta ->> 'city', '')
  );

  if urole = 'driver' then
    insert into public.drivers (
      id, vehicle_type, vehicle_model, plate, capacity, official_capacity,
      make_model, color, year
    ) values (
      new.id,
      coalesce(nullif(meta ->> 'vehicle_type', ''), 'Mini Van'),
      coalesce(meta ->> 'vehicle_model', ''),
      coalesce(meta ->> 'plate', ''),
      coalesce((meta ->> 'capacity')::int, 8),
      coalesce((meta ->> 'official_capacity')::int, (meta ->> 'capacity')::int, 8),
      coalesce(meta ->> 'make_model', ''),
      coalesce(meta ->> 'color', ''),
      nullif(meta ->> 'year', '')::int
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.children enable row level security;
alter table public.reviews enable row level security;
alter table public.locations enable row level security;
alter table public.tracking_sessions enable row level security;
alter table public.alerts enable row level security;

-- profiles: readable by authenticated users; writable only by self.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (auth.role() = 'authenticated');
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for update using (auth.uid() = id);

-- drivers: readable by everyone authenticated; writable only by the driver.
drop policy if exists drivers_read on public.drivers;
create policy drivers_read on public.drivers for select using (true);
drop policy if exists drivers_write on public.drivers;
create policy drivers_write on public.drivers for update using (auth.uid() = id);
drop policy if exists drivers_insert on public.drivers;
create policy drivers_insert on public.drivers for insert with check (auth.uid() = id);

-- children: parent manages their own; drivers can read children linked to them.
drop policy if exists children_parent_all on public.children;
create policy children_parent_all on public.children for all
  using (auth.uid() = parent_id) with check (auth.uid() = parent_id);
drop policy if exists children_driver_read on public.children;
create policy children_driver_read on public.children for select
  using (auth.uid() = driver_id);

-- reviews: readable by all; only a parent with a child linked to the driver may write.
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select using (true);
drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews for insert
  with check (
    auth.uid() = parent_id
    and exists (
      select 1 from public.children c
      where c.parent_id = auth.uid() and c.driver_id = reviews.driver_id
    )
  );

-- locations: driver writes own; linked parents read.
drop policy if exists locations_insert on public.locations;
create policy locations_insert on public.locations for insert with check (auth.uid() = driver_id);
drop policy if exists locations_read on public.locations;
create policy locations_read on public.locations for select
  using (
    auth.uid() = driver_id
    or exists (
      select 1 from public.children c
      where c.parent_id = auth.uid() and c.driver_id = locations.driver_id
    )
  );

-- tracking_sessions: driver manages own; linked parents read.
drop policy if exists ts_all on public.tracking_sessions;
create policy ts_all on public.tracking_sessions for all using (auth.uid() = driver_id) with check (auth.uid() = driver_id);
drop policy if exists ts_read on public.tracking_sessions;
create policy ts_read on public.tracking_sessions for select
  using (
    auth.uid() = driver_id
    or exists (
      select 1 from public.children c
      where c.parent_id = auth.uid() and c.driver_id = tracking_sessions.driver_id
    )
  );

-- alerts: parent reads own.
drop policy if exists alerts_read on public.alerts;
create policy alerts_read on public.alerts for select using (auth.uid() = parent_id);

-- ---------------------------------------------------------------------------
-- Storage bucket for documents
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects for select using (bucket_id = 'documents');
drop policy if exists documents_write on storage.objects;
create policy documents_write on storage.objects for insert
  with check (bucket_id = 'documents' and auth.role() = 'authenticated');
