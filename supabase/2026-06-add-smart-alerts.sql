-- Migration: allow the new smart-notification alert types on an existing DB.
-- Run this once in the Supabase SQL editor (schema.sql already includes them
-- for fresh installs). Safe to re-run.

alter table public.alerts drop constraint if exists alerts_type_check;

alter table public.alerts
  add constraint alerts_type_check
  check (type in (
    'departed', 'arrived', 'stationary', 'route_deviation',
    'traffic_delay', 'arriving_soon', 'info'
  ));

-- Active route direction, used for mid-route traffic re-checks.
alter table public.tracking_sessions
  add column if not exists period text check (period in ('morning', 'afternoon'));
