-- Bot conversation memory: very short per-sender chat history so the WhatsApp /
-- in-app assistant can handle multi-turn follow-ups. Idempotent — safe to re-run
-- on the demo Supabase DB.

create table if not exists public.bot_conversations (
  id uuid primary key default gen_random_uuid(),
  sender text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists bot_conversations_sender
  on public.bot_conversations (sender, created_at desc);
