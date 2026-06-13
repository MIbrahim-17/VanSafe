-- Migration: structured area/school selection.
-- profiles gain a parent's area + child's school; drivers gain a multi-area list.
-- Run once in the Supabase SQL editor on an existing VanSafe database.

alter table public.profiles add column if not exists area text not null default '';
alter table public.profiles add column if not exists school text not null default '';

alter table public.drivers add column if not exists areas text[] not null default '{}';

-- Backfill the seeded demo rows ------------------------------------------------
-- Seeded drivers are in Karachi; map their single area into the new areas[].
update public.drivers set areas = array[area] where area <> '' and areas = '{}';

-- Normalise seeded drivers' schools/areas to catalog names so school filtering
-- and AI matching line up with the new dropdowns.
update public.drivers set areas = '{"Gulshan-e-Iqbal"}',
  schools = '{"The City School Gulshan","Beaconhouse Gulshan"}'
  where id = '11111111-1111-1111-1111-111111111111';
update public.drivers set areas = '{"North Nazimabad"}',
  schools = '{"Beaconhouse North Nazimabad","Generation''s North Nazimabad"}'
  where id = '22222222-2222-2222-2222-222222222222';
update public.drivers set areas = '{"Gulshan-e-Iqbal"}',
  schools = '{"The City School Gulshan","The Educators Gulshan"}'
  where id = '33333333-3333-3333-3333-333333333333';
update public.drivers set areas = '{"Clifton","Defence"}',
  schools = '{"Beaconhouse Clifton","The City School Defence"}'
  where id = '44444444-4444-4444-4444-444444444444';

-- Demo parent (Sara): area + child's school used by browse/match filters.
update public.profiles
  set area = 'Gulshan-e-Iqbal', school = 'The City School Gulshan'
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
update public.links set school = 'The City School Gulshan'
  where parent_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
