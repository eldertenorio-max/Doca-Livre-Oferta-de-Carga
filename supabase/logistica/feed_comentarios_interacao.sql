-- Respostas e curtidas em comentários do feed do Mapa da Logística.
-- Rode no SQL Editor do Supabase (projeto do mapa).

alter table public.mapa_feed_comentarios
  add column if not exists resposta_a uuid references public.mapa_feed_comentarios(id) on delete cascade;

create index if not exists idx_mapa_feed_comentarios_resposta
  on public.mapa_feed_comentarios (resposta_a);

create table if not exists public.mapa_feed_comentario_curtidas (
  comentario_id uuid not null references public.mapa_feed_comentarios(id) on delete cascade,
  usuario text not null,
  created_at timestamptz not null default now(),
  primary key (comentario_id, usuario)
);

alter table public.mapa_feed_comentario_curtidas enable row level security;

drop policy if exists "mapa_feed_comentario_curtidas_all" on public.mapa_feed_comentario_curtidas;

create policy "mapa_feed_comentario_curtidas_all"
  on public.mapa_feed_comentario_curtidas for all
  to anon, authenticated
  using (true) with check (true);
