-- ============================================================
-- Aprovação/recusa de cadastro pelo painel Minerva
-- O front usa a chave anon (login do portal NÃO cria sessão Auth).
-- Sem estas policies o UPDATE em transportadores não grava nada
-- (PostgREST retorna sucesso com 0 linhas) e o refresh volta a "pendente".
-- Execute no SQL Editor do Supabase.
-- ============================================================

-- Transportadores: anon pode atualizar (aprovar / recusar / editar)
drop policy if exists "anon update transportadores" on transportadores;
create policy "anon update transportadores"
  on transportadores for update to anon
  using (true) with check (true);

-- Profiles: liberar/bloquear login após decisão
drop policy if exists "anon update profiles" on profiles;
create policy "anon update profiles"
  on profiles for update to anon
  using (true) with check (true);

-- Leitura de profiles (painel / sync)
drop policy if exists "anon select profiles" on profiles;
create policy "anon select profiles"
  on profiles for select to anon
  using (true);
