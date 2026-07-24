-- ============================================================
-- Exclusão de transportadora pelo painel (Super Usuário)
-- O front usa a chave anon (login do portal NÃO cria sessão Auth).
-- Sem estas policies o DELETE não apaga nada (PostgREST retorna
-- sucesso com 0 linhas) e o refresh de 15s traz o cadastro de volta.
-- Execute no SQL Editor do Supabase.
-- ============================================================

-- Transportadores: anon pode excluir
drop policy if exists "anon delete transportadores" on transportadores;
create policy "anon delete transportadores"
  on transportadores for delete to anon
  using (true);

-- Documentos vinculados
drop policy if exists "anon delete transportador_documentos" on transportador_documentos;
create policy "anon delete transportador_documentos"
  on transportador_documentos for delete to anon
  using (true);

-- Vínculo com grupos
drop policy if exists "anon delete grupo_membros" on grupo_transportador_membros;
create policy "anon delete grupo_membros"
  on grupo_transportador_membros for delete to anon
  using (true);

-- Arquivos no Storage (documentos da transportadora)
drop policy if exists "docs delete anon" on storage.objects;
create policy "docs delete anon"
  on storage.objects for delete to anon
  using (bucket_id = 'documentos-transportadores');
