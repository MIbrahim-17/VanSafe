-- Migration: add city (profiles) + extended vehicle info (drivers).
-- Run this once in the Supabase SQL editor on an existing VanSafe database.

-- 1. New columns -----------------------------------------------------------
alter table public.profiles add column if not exists city text not null default '';

alter table public.drivers add column if not exists make_model text not null default '';
alter table public.drivers add column if not exists color text not null default '';
alter table public.drivers add column if not exists year int;

-- 2. Updated new-user trigger: read city + vehicle info from signup metadata
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
      id, vehicle_type, plate, capacity, make_model, color, year
    ) values (
      new.id,
      coalesce(nullif(meta ->> 'vehicle_type', ''), 'Van'),
      coalesce(meta ->> 'plate', ''),
      coalesce((meta ->> 'capacity')::int, 12),
      coalesce(meta ->> 'make_model', ''),
      coalesce(meta ->> 'color', ''),
      nullif(meta ->> 'year', '')::int
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- 3. Backfill cities + vehicle details for the seeded demo accounts --------
update public.profiles set city = 'Karachi'
  where id in (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ) and (city is null or city = '');

update public.drivers set make_model = 'Toyota Hiace', color = 'White', year = 2018
  where id = '11111111-1111-1111-1111-111111111111';
update public.drivers set make_model = 'Suzuki APV', color = 'Silver', year = 2020
  where id = '22222222-2222-2222-2222-222222222222';
update public.drivers set make_model = 'Suzuki Bolan', color = 'White', year = 2016
  where id = '33333333-3333-3333-3333-333333333333';
update public.drivers set make_model = 'Toyota Hiace', color = 'Blue', year = 2019
  where id = '44444444-4444-4444-4444-444444444444';
