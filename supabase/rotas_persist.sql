-- Permite gravar/ler rotas no cadastro (anon + authenticated), alinhado ao kanban_sync.
-- Rode no SQL Editor do Supabase se rotas novas não persistirem na tabela `rotas`.

alter table if exists public.rotas enable row level security;

drop policy if exists "anon select rotas" on public.rotas;
create policy "anon select rotas"
  on public.rotas for select
  to anon, authenticated
  using (true);

drop policy if exists "anon upsert rotas" on public.rotas;
create policy "anon upsert rotas"
  on public.rotas for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "auth all rotas" on public.rotas;
create policy "auth all rotas"
  on public.rotas for all
  to authenticated
  using (true)
  with check (true);
