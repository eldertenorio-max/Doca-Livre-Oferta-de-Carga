-- Políticas para a chave publishable/anon (MVP)
-- Sem isso o front não enxerga o seed.

drop policy if exists "anon select transportadores" on transportadores;
create policy "anon select transportadores" on transportadores for select to anon using (true);

drop policy if exists "anon select grupos" on grupos_transportadores;
create policy "anon select grupos" on grupos_transportadores for select to anon using (true);

drop policy if exists "anon select membros" on grupo_transportador_membros;
create policy "anon select membros" on grupo_transportador_membros for select to anon using (true);

drop policy if exists "anon select rotas" on rotas;
create policy "anon select rotas" on rotas for select to anon using (true);

drop policy if exists "anon select cargas" on cargas;
create policy "anon select cargas" on cargas for select to anon using (true);

drop policy if exists "anon select lances" on lances;
create policy "anon select lances" on lances for select to anon using (true);

drop policy if exists "anon select veiculos" on veiculos;
create policy "anon select veiculos" on veiculos for select to anon using (true);

drop policy if exists "anon select documentos" on transportador_documentos;
create policy "anon select documentos" on transportador_documentos for select to anon using (true);

-- Cadastro público: insert após signUp (authenticated) já coberto;
-- permite insert de transportador pendente pelo usuário autenticado.
-- Storage: já tem policies authenticated no schema.
