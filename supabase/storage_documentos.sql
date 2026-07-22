-- Bucket de documentos do cadastro de transportador
-- Rode no SQL Editor do Supabase se "Abrir" documentos der Bucket not found

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-transportadores',
  'documentos-transportadores',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set public = excluded.public;

-- Leitura pública (links Abrir) + upload autenticado
drop policy if exists "docs upload auth" on storage.objects;
drop policy if exists "docs read auth" on storage.objects;
drop policy if exists "docs update auth" on storage.objects;
drop policy if exists "docs read public" on storage.objects;
drop policy if exists "docs read anon" on storage.objects;

create policy "docs upload auth"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-transportadores');

create policy "docs update auth"
  on storage.objects for update to authenticated
  using (bucket_id = 'documentos-transportadores');

create policy "docs read public"
  on storage.objects for select to authenticated
  using (bucket_id = 'documentos-transportadores');

create policy "docs read anon"
  on storage.objects for select to anon
  using (bucket_id = 'documentos-transportadores');
