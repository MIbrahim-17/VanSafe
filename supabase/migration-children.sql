-- Migration: multiple children per parent.
-- Replaces the one-link-per-parent `links` model with a `children` table where
-- each child independently links to a driver (driver_id may be null = unlinked).
-- Run once in the Supabase SQL editor.

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

-- Carry over any existing links as children (only if the old table exists).
do $$
begin
  if to_regclass('public.links') is not null then
    insert into public.children (parent_id, name, school, driver_id, created_at)
    select parent_id, child_name, school, driver_id, created_at
    from public.links
    on conflict do nothing;
  end if;
end $$;

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

-- RLS: a parent manages their own children; a driver may read children linked
-- to them (so the driver dashboard can list passengers).
alter table public.children enable row level security;
drop policy if exists children_parent_all on public.children;
create policy children_parent_all on public.children for all
  using (auth.uid() = parent_id) with check (auth.uid() = parent_id);
drop policy if exists children_driver_read on public.children;
create policy children_driver_read on public.children for select
  using (auth.uid() = driver_id);

-- Re-point dependent policies from links -> children.
drop policy if exists locations_read on public.locations;
create policy locations_read on public.locations for select using (
  auth.uid() = driver_id
  or exists (
    select 1 from public.children c
    where c.parent_id = auth.uid() and c.driver_id = locations.driver_id
  )
);

drop policy if exists ts_read on public.tracking_sessions;
create policy ts_read on public.tracking_sessions for select using (
  auth.uid() = driver_id
  or exists (
    select 1 from public.children c
    where c.parent_id = auth.uid() and c.driver_id = tracking_sessions.driver_id
  )
);

drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews for insert with check (
  auth.uid() = parent_id
  and exists (
    select 1 from public.children c
    where c.parent_id = auth.uid() and c.driver_id = reviews.driver_id
  )
);

-- Old links table is no longer used.
drop table if exists public.links cascade;
