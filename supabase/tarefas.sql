-- Kanban de tarefas do transportador (opcional / futuro sync remoto).
-- O app grava localmente hoje; rode este SQL se quiser persistir no Supabase.

create table if not exists public.tarefas (
  id text primary key,
  transportador_id text not null,
  titulo text not null,
  descricao text,
  status text not null default 'pendente'
    check (status in ('pendente','aprovadas','em_desenvolvimento','em_testes','finalizadas','canceladas')),
  prioridade text not null default 'media'
    check (prioridade in ('baixa','media','alta','urgente')),
  responsavel text,
  solicitado_por text,
  tags jsonb not null default '[]'::jsonb,
  imagens jsonb not null default '[]'::jsonb,
  data_inicio date,
  prazo_entrega date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tarefas_transportador_idx on public.tarefas (transportador_id);
create index if not exists tarefas_status_idx on public.tarefas (status);

alter table public.tarefas enable row level security;

drop policy if exists "tarefas_select_anon" on public.tarefas;
create policy "tarefas_select_anon" on public.tarefas for select to anon, authenticated using (true);

drop policy if exists "tarefas_insert_anon" on public.tarefas;
create policy "tarefas_insert_anon" on public.tarefas for insert to anon, authenticated with check (true);

drop policy if exists "tarefas_update_anon" on public.tarefas;
create policy "tarefas_update_anon" on public.tarefas for update to anon, authenticated using (true) with check (true);

drop policy if exists "tarefas_delete_anon" on public.tarefas;
create policy "tarefas_delete_anon" on public.tarefas for delete to anon, authenticated using (true);
