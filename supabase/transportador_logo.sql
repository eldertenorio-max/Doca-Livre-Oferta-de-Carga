-- Logo / foto de perfil do transportador
-- Execute no SQL Editor do Supabase.

alter table public.transportadores
  add column if not exists logo_url text;

comment on column public.transportadores.logo_url is
  'URL da logo da empresa ou foto do responsável (perfil).';

-- O portal usa a chave anon (login local, sem sessão Auth).
-- Sem estas policies o upload da logo falha com RLS e a imagem nunca aparece no mapa.
drop policy if exists "docs upload anon" on storage.objects;
create policy "docs upload anon"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'documentos-transportadores');

drop policy if exists "docs update anon" on storage.objects;
create policy "docs update anon"
  on storage.objects for update to anon, authenticated
  using (bucket_id = 'documentos-transportadores')
  with check (bucket_id = 'documentos-transportadores');

drop policy if exists "docs delete anon" on storage.objects;
create policy "docs delete anon"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'documentos-transportadores');

drop policy if exists "docs read anon" on storage.objects;
create policy "docs read anon"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'documentos-transportadores');
