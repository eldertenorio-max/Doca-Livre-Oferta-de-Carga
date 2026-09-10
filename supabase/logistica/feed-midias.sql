-- Mídias do feed (foto, vídeo, áudio e arquivos)

alter table public.mapa_feed_posts
  add column if not exists midias jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit)
values ('feed-midias', 'feed-midias', true, 52428800)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "feed_midias_select" on storage.objects;
drop policy if exists "feed_midias_insert" on storage.objects;
drop policy if exists "feed_midias_update" on storage.objects;
drop policy if exists "feed_midias_delete" on storage.objects;

create policy "feed_midias_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'feed-midias');

create policy "feed_midias_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'feed-midias');

create policy "feed_midias_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'feed-midias')
  with check (bucket_id = 'feed-midias');

create policy "feed_midias_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'feed-midias');
