-- Doca Livre — Mapa da Logística
-- Tabelas atuais no projeto zbjhaupxhriedfsgtlbj.
-- Quando unificar: rode este arquivo no SQL Editor do Oferta de Carga
-- e copie os dados; depois aponte VITE_LOGISTICA_* para o mesmo projeto do Oferta.

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
