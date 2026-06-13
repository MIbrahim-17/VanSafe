-- VanSafe demo seed data.
-- Run AFTER schema.sql, in the Supabase SQL editor.
-- Creates loginable demo accounts (password for all: "password123") plus
-- populated drivers, reviews, route pings and one parent<->driver link so the
-- browse / match / tracking screens look alive immediately.

-- Helper: insert a confirmed auth user. The on_auth_user_created trigger then
-- creates the matching profiles/drivers rows from raw_user_meta_data.
-- Drop any earlier overloads so the call below isn't ambiguous.
drop function if exists public.seed_user(uuid, text, text, text, text);
drop function if exists public.seed_user(uuid, text, text, text, text, text);

create or replace function public.seed_user(
  uid uuid, uemail text, uname text, urole text, uwa text, ucity text default 'Karachi'
) returns void as $$
begin
  -- NOTE: the token columns must be '' (not NULL). GoTrue scans them into
  -- non-nullable strings at login; NULLs cause "Database error querying schema".
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    uemail, crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('role', urole, 'name', uname, 'whatsapp', uwa, 'city', ucity),
    now(), now(),
    '', '', '', '', '', '', '', ''
  )
  on conflict (id) do nothing;
end;
$$ language plpgsql;

-- Demo drivers
select public.seed_user('11111111-1111-1111-1111-111111111111', 'imran.driver@vansafe.test', 'Imran Khan',   'driver', '+923001112233');
select public.seed_user('22222222-2222-2222-2222-222222222222', 'bilal.driver@vansafe.test', 'Bilal Ahmed',  'driver', '+923004445566');
select public.seed_user('33333333-3333-3333-3333-333333333333', 'saleem.driver@vansafe.test', 'Saleem Raza',  'driver', '+923007778899');
select public.seed_user('44444444-4444-4444-4444-444444444444', 'kashif.driver@vansafe.test','Kashif Iqbal', 'driver', '+923009990011');

-- Demo parent
select public.seed_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sara.parent@vansafe.test', 'Sara Malik', 'parent', '+923211234567');

-- Flesh out driver profiles
update public.drivers set
  area = 'Gulshan-e-Iqbal', areas = '{"Gulshan-e-Iqbal"}',
  schools = '{"The City School Gulshan","Beaconhouse Gulshan"}',
  vehicle_type = 'Hi-Roof', vehicle_model = 'Toyota Hiace (Standard)',
  plate = 'ABC-123', capacity = 14, official_capacity = 14, occupancy = 11,
  make_model = 'Toyota Hiace (Standard)', color = 'White', year = 2018,
  bio = '8 years driving school routes in Gulshan. Punctual and safety-first.',
  cnic_url = 'seed://cnic', vehicle_doc_url = 'seed://vehicle', verified = true
where id = '11111111-1111-1111-1111-111111111111';

update public.drivers set
  area = 'North Nazimabad', areas = '{"North Nazimabad"}',
  schools = '{"Beaconhouse North Nazimabad","Generation''s North Nazimabad"}',
  vehicle_type = 'Standard Van', vehicle_model = 'Suzuki APV',
  plate = 'XYZ-987', capacity = 8, official_capacity = 8, occupancy = 4,
  make_model = 'Suzuki APV', color = 'Silver', year = 2020,
  bio = 'Careful driver, AC van, female attendant on board.',
  cnic_url = 'seed://cnic', vehicle_doc_url = 'seed://vehicle', verified = true
where id = '22222222-2222-2222-2222-222222222222';

update public.drivers set
  area = 'Gulshan-e-Iqbal', areas = '{"Gulshan-e-Iqbal"}',
  schools = '{"The City School Gulshan","The Educators Gulshan"}',
  vehicle_type = 'Mini Van', vehicle_model = 'Suzuki Bolan (Carry Dabba)',
  plate = 'LMN-456', capacity = 8, official_capacity = 8, occupancy = 13,
  make_model = 'Suzuki Bolan (Carry Dabba)', color = 'White', year = 2016,
  bio = 'Serving Gulshan for 5 years. Almost full — book early!',
  cnic_url = 'seed://cnic', verified = false
where id = '33333333-3333-3333-3333-333333333333';

update public.drivers set
  area = 'Clifton', areas = '{"Clifton","Defence"}',
  schools = '{"Beaconhouse Clifton","The City School Defence"}',
  vehicle_type = 'Hi-Roof', vehicle_model = 'Toyota Hiace (High Roof)',
  plate = 'PQR-321', capacity = 17, official_capacity = 17, occupancy = 16,
  make_model = 'Toyota Hiace (High Roof)', color = 'Blue', year = 2019,
  bio = 'Clifton & Defence routes. GPS tracked, parents always informed.',
  verified = false
where id = '44444444-4444-4444-4444-444444444444';

-- Reviews
insert into public.reviews (driver_id, parent_id, rating, comment) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, 'Always on time and very gentle with the kids.'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, 'Reliable, sometimes 5 mins late in rain but messages ahead.'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, 'The attendant makes me feel safe about my daughter.'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3, 'Good driver but the van is quite full and a bit cramped.');

-- Demo parent's neighbourhood + child's school (used by browse/match filters)
update public.profiles
  set area = 'Gulshan-e-Iqbal', school = 'The City School Gulshan'
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Two demo children, each linked to a different driver (multi-child demo)
insert into public.children (parent_id, name, school, pickup_address, driver_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ayesha', 'The City School Gulshan', 'House 12, Block 5, Gulshan-e-Iqbal', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Hamza',  'The Educators Gulshan',   'House 12, Block 5, Gulshan-e-Iqbal', '33333333-3333-3333-3333-333333333333')
on conflict do nothing;

-- A short route history for Imran (Gulshan-e-Iqbal, Karachi) over the last ~5 min
insert into public.locations (driver_id, lat, lng, created_at) values
  ('11111111-1111-1111-1111-111111111111', 24.9180, 67.0971, now() - interval '5 minutes'),
  ('11111111-1111-1111-1111-111111111111', 24.9195, 67.0985, now() - interval '4 minutes'),
  ('11111111-1111-1111-1111-111111111111', 24.9210, 67.0999, now() - interval '3 minutes'),
  ('11111111-1111-1111-1111-111111111111', 24.9228, 67.1012, now() - interval '2 minutes'),
  ('11111111-1111-1111-1111-111111111111', 24.9242, 67.1025, now() - interval '1 minute'),
  ('11111111-1111-1111-1111-111111111111', 24.9250, 67.1031, now() - interval '20 seconds');

insert into public.tracking_sessions (driver_id, active, status, started_at, pings_today, last_ping_date)
values ('11111111-1111-1111-1111-111111111111', true, 'moving', now() - interval '5 minutes', 6, current_date)
on conflict (driver_id) do update set
  active = excluded.active, status = excluded.status,
  started_at = excluded.started_at, pings_today = excluded.pings_today,
  last_ping_date = excluded.last_ping_date;

-- A short route history for Saleem (Hamza's driver), also in Gulshan
insert into public.locations (driver_id, lat, lng, created_at) values
  ('33333333-3333-3333-3333-333333333333', 24.9300, 67.0850, now() - interval '4 minutes'),
  ('33333333-3333-3333-3333-333333333333', 24.9285, 67.0875, now() - interval '3 minutes'),
  ('33333333-3333-3333-3333-333333333333', 24.9270, 67.0900, now() - interval '2 minutes'),
  ('33333333-3333-3333-3333-333333333333', 24.9255, 67.0915, now() - interval '1 minute'),
  ('33333333-3333-3333-3333-333333333333', 24.9245, 67.0925, now() - interval '25 seconds');

insert into public.tracking_sessions (driver_id, active, status, started_at, pings_today, last_ping_date)
values ('33333333-3333-3333-3333-333333333333', true, 'moving', now() - interval '4 minutes', 5, current_date)
on conflict (driver_id) do update set
  active = excluded.active, status = excluded.status,
  started_at = excluded.started_at, pings_today = excluded.pings_today,
  last_ping_date = excluded.last_ping_date;
