-- Migration: real Pakistan vehicle catalog + official-capacity safety benchmark.
-- Run once in the Supabase SQL editor (safe to re-run).
--
-- Changes:
--   * vehicle_type categories: 'Van'/'Wagon' -> 'Mini Van'/'Standard Van'/'Hi-Roof'
--   * new columns: vehicle_model (catalog model name), official_capacity (benchmark)
--   * handle_new_user trigger reads the new metadata fields

-- 1) New columns ------------------------------------------------------------
alter table public.drivers
  add column if not exists vehicle_model text not null default '';
alter table public.drivers
  add column if not exists official_capacity int not null default 8;

-- 2) Re-map the vehicle_type check constraint to size categories ------------
-- Drop the old constraint (name is auto-generated; find & drop defensively).
do $$
declare con text;
begin
  select conname into con
  from pg_constraint
  where conrelid = 'public.drivers'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%vehicle_type%';
  if con is not null then
    execute format('alter table public.drivers drop constraint %I', con);
  end if;
end $$;

-- Map any existing legacy values to the new categories.
update public.drivers set vehicle_type = 'Mini Van'     where vehicle_type = 'Wagon';
update public.drivers set vehicle_type = 'Standard Van' where vehicle_type = 'Van';
-- 'Hi-Roof' is unchanged.

alter table public.drivers
  add constraint drivers_vehicle_type_check
  check (vehicle_type in ('Mini Van', 'Standard Van', 'Hi-Roof'));

-- 3) Backfill: existing rows treat their current capacity as the benchmark,
--    and seed vehicle_model from make_model when available.
update public.drivers
  set official_capacity = greatest(capacity, 1)
  where official_capacity is null or official_capacity = 0;
update public.drivers
  set vehicle_model = make_model
  where vehicle_model = '' and make_model <> '';

-- 4) Update the signup trigger to populate the new fields -------------------
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
