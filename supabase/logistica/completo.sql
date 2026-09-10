-- Mapa da Logística — schema completo no projeto do Oferta de Carga
-- Origem histórica: zbjhaupxhriedfsgtlbj. Não rode no projeto antigo.

create extension if not exists pgcrypto;

create table if not exists public.mapa_empresas (
  id text primary key,
  slug text not null unique,
  categoria text not null,
  uf text not null,
  cidade text,
  lat double precision,
  lng double precision,
  origem text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_mapa_empresas_categoria on public.mapa_empresas (categoria);
create index if not exists idx_mapa_empresas_uf on public.mapa_empresas (uf);

create table if not exists public.mapa_usuarios (
  usuario text primary key,
  email text not null,
  senha text not null,
  nome text not null,
  papel text not null,
  nivel_hierarquia text not null,
  superior text,
  empresa_id text,
  empresa_slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_mapa_usuarios_email_lower
  on public.mapa_usuarios (lower(email));

alter table public.mapa_empresas enable row level security;
alter table public.mapa_usuarios enable row level security;

drop policy if exists "mapa_empresas_select" on public.mapa_empresas;
drop policy if exists "mapa_empresas_write" on public.mapa_empresas;
drop policy if exists "mapa_usuarios_select" on public.mapa_usuarios;
drop policy if exists "mapa_usuarios_write" on public.mapa_usuarios;

create policy "mapa_empresas_select"
  on public.mapa_empresas for select
  to anon, authenticated
  using (true);

create policy "mapa_empresas_write"
  on public.mapa_empresas for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "mapa_usuarios_select"
  on public.mapa_usuarios for select
  to anon, authenticated
  using (true);

create policy "mapa_usuarios_write"
  on public.mapa_usuarios for all
  to anon, authenticated
  using (true)
  with check (true);

insert into public.mapa_usuarios (usuario, email, senha, nome, papel, nivel_hierarquia, superior, empresa_id, empresa_slug)
values
  ('Diego', 'diego@docalivre.com', 'diego123', 'Diego', 'super', 'super', null, null, null),
  ('Elder', 'elder@docalivre.com', 'Elder123', 'Elder', 'super', 'super', null, null, null),
  ('Braspress', 'braspress@docalivre.com', 'braspress123', 'Braspress', 'empresa', 'operador', 'Diego', 'tr-braspress', 'braspress')
on conflict (usuario) do update
  set email = excluded.email,
      senha = excluded.senha,
      nome = excluded.nome,
      papel = excluded.papel,
      nivel_hierarquia = excluded.nivel_hierarquia,
      superior = excluded.superior,
      empresa_id = excluded.empresa_id,
      empresa_slug = excluded.empresa_slug,
      updated_at = now();

-- Feed

create table if not exists public.mapa_feed_posts (
  id uuid primary key default gen_random_uuid(),
  empresa_id text,
  empresa_slug text,
  empresa_nome text not null,
  autor_usuario text not null,
  autor_nome text not null,
  tipo text not null default 'servico'
    check (tipo in ('servico', 'capacidade', 'parceria', 'aviso')),
  texto text not null,
  imagem_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_mapa_feed_posts_created on public.mapa_feed_posts (created_at desc);

create table if not exists public.mapa_feed_curtidas (
  post_id uuid not null references public.mapa_feed_posts(id) on delete cascade,
  usuario text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, usuario)
);

create table if not exists public.mapa_feed_comentarios (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.mapa_feed_posts(id) on delete cascade,
  autor_usuario text not null,
  autor_nome text not null,
  texto text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_mapa_feed_comentarios_post on public.mapa_feed_comentarios (post_id, created_at);

create table if not exists public.mapa_notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_destino text not null,
  tipo text not null check (tipo in ('curtida', 'comentario', 'publicacao')),
  post_id uuid,
  de_usuario text,
  de_nome text,
  resumo text not null,
  lida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_mapa_notificacoes_destino
  on public.mapa_notificacoes (usuario_destino, created_at desc);

alter table public.mapa_feed_posts enable row level security;
alter table public.mapa_feed_curtidas enable row level security;
alter table public.mapa_feed_comentarios enable row level security;
alter table public.mapa_notificacoes enable row level security;

drop policy if exists "mapa_feed_posts_all" on public.mapa_feed_posts;
drop policy if exists "mapa_feed_curtidas_all" on public.mapa_feed_curtidas;
drop policy if exists "mapa_feed_comentarios_all" on public.mapa_feed_comentarios;
drop policy if exists "mapa_notificacoes_all" on public.mapa_notificacoes;

create policy "mapa_feed_posts_all"
  on public.mapa_feed_posts for all
  to anon, authenticated
  using (true) with check (true);

create policy "mapa_feed_curtidas_all"
  on public.mapa_feed_curtidas for all
  to anon, authenticated
  using (true) with check (true);

create policy "mapa_feed_comentarios_all"
  on public.mapa_feed_comentarios for all
  to anon, authenticated
  using (true) with check (true);

create policy "mapa_notificacoes_all"
  on public.mapa_notificacoes for all
  to anon, authenticated
  using (true) with check (true);

insert into public.mapa_feed_posts (id, empresa_nome, autor_usuario, autor_nome, tipo, texto)
select
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Doca Livre',
  'Diego',
  'Diego',
  'aviso',
  'Bem-vindos ao feed do Mapa da Logística. Publique aqui serviços, capacidade de frota, parcerias e avisos operacionais para a rede.'
where not exists (
  select 1 from public.mapa_feed_posts where id = '00000000-0000-0000-0000-000000000001'::uuid
);

-- Mídias do feed

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

notify pgrst, 'reload schema';
