-- ============================================================
-- Sync do Kanban entre todos os usuários (Realtime + polling)
-- Execute no SQL Editor do projeto Supabase da Oferta de Carga
-- ============================================================

create table if not exists kanban_sync (
  id text primary key default 'main',
  payload jsonb not null default '{}'::jsonb,
  client_id text,
  updated_at timestamptz not null default now()
);

insert into kanban_sync (id, payload)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

-- Necessário para postgres_changes enviar a linha completa no UPDATE
alter table kanban_sync replica identity full;

alter table kanban_sync enable row level security;

drop policy if exists "anon read kanban_sync" on kanban_sync;
create policy "anon read kanban_sync"
  on kanban_sync for select to anon, authenticated
  using (true);

drop policy if exists "anon upsert kanban_sync" on kanban_sync;
create policy "anon upsert kanban_sync"
  on kanban_sync for all to anon, authenticated
  using (true)
  with check (true);

-- Realtime
do $$
begin
  alter publication supabase_realtime add table kanban_sync;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
