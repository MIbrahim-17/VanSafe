-- Migration: background location sharing via the Traccar Client app.
-- Adds a per-driver secret token used as the device id in Traccar Client; the
-- /api/track endpoint authenticates incoming OsmAnd-protocol pings by it.
-- Run once in the Supabase SQL editor (schema.sql already includes it for fresh
-- installs). Safe to re-run.

alter table public.drivers
  add column if not exists track_token text;

-- Backfill any rows still missing a token.
update public.drivers
  set track_token = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 12)
  where track_token is null;

-- Enforce uniqueness + a default for future inserts.
create unique index if not exists drivers_track_token_key on public.drivers (track_token);

alter table public.drivers
  alter column track_token
  set default substr(md5(random()::text || clock_timestamp()::text), 1, 12);
