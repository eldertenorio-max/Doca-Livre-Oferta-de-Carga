-- Feed e notificações do Mapa da Logística

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
