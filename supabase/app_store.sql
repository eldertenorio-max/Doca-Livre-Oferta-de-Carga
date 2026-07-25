-- Store genérico do Oferta de Carga (fonte da verdade no banco).
-- Substitui localStorage de config, hierarquia, permissões e pagamentos.
-- Execute no SQL Editor do Supabase.

create table if not exists public.app_store (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_store enable row level security;

drop policy if exists "anon all app_store" on public.app_store;
create policy "anon all app_store"
  on public.app_store
  for all to anon, authenticated
  using (true)
  with check (true);

-- RLS motoristas (escrita anon — mesmo padrão de veiculos)
alter table if exists public.motoristas enable row level security;

drop policy if exists "anon select motoristas" on public.motoristas;
create policy "anon select motoristas"
  on public.motoristas for select to anon using (true);

drop policy if exists "anon insert motoristas" on public.motoristas;
create policy "anon insert motoristas"
  on public.motoristas for insert to anon with check (true);

drop policy if exists "anon update motoristas" on public.motoristas;
create policy "anon update motoristas"
  on public.motoristas for update to anon using (true) with check (true);

drop policy if exists "anon delete motoristas" on public.motoristas;
create policy "anon delete motoristas"
  on public.motoristas for delete to anon using (true);
