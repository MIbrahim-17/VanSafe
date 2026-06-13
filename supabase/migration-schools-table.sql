-- Migration: a `schools` table populated by the OSM scraper
-- (scripts/scrape-schools.mjs). The app reads this to augment the built-in
-- catalog in the city -> area -> school pickers. Run once in the SQL editor.

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  area text not null default 'Other',
  name text not null,
  lat double precision,
  lng double precision,
  source text not null default 'osm',
  created_at timestamptz not null default now()
);

-- One row per school name per city (lets the scraper upsert idempotently).
create unique index if not exists schools_city_name on public.schools (city, name);
create index if not exists schools_city_area on public.schools (city, area);

alter table public.schools enable row level security;

-- Anyone may read the catalog; writes happen via the service-role scraper.
drop policy if exists schools_read on public.schools;
create policy schools_read on public.schools for select using (true);
