-- ============================================================
-- Web Push — assinaturas dos dispositivos (PWA instalado)
-- Execute no SQL Editor do Supabase.
-- ============================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  transportador_id text,
  user_id text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_transportador_idx
  on public.push_subscriptions (transportador_id);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "anon select push_subscriptions" on public.push_subscriptions;
drop policy if exists "anon insert push_subscriptions" on public.push_subscriptions;
drop policy if exists "anon update push_subscriptions" on public.push_subscriptions;
drop policy if exists "anon delete push_subscriptions" on public.push_subscriptions;

-- Portal usa chave anon (sem Auth session)
create policy "anon select push_subscriptions"
  on public.push_subscriptions for select to anon using (true);

create policy "anon insert push_subscriptions"
  on public.push_subscriptions for insert to anon with check (true);

create policy "anon update push_subscriptions"
  on public.push_subscriptions for update to anon using (true) with check (true);

create policy "anon delete push_subscriptions"
  on public.push_subscriptions for delete to anon using (true);
