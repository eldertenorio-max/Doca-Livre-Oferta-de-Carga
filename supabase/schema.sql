-- ============================================================
-- Doca Livre — Oferta de Carga
-- Schema para Supabase (PostgreSQL)
-- Execute no SQL Editor do Supabase
-- ============================================================

-- Extensões
create extension if not exists "pgcrypto";

-- Enums
do $$ begin
  create type user_role as enum ('minerva', 'transportador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type classificacao_rota as enum ('A', 'B', 'C');
exception when duplicate_object then null; end $$;

do $$ begin
  create type classificacao_transportador as enum ('ouro', 'prata', 'bronze');
exception when duplicate_object then null; end $$;

do $$ begin
  create type prioridade as enum ('alta', 'media', 'baixa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type modo_publicacao as enum ('leilao', 'oferta');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_carga as enum (
    'nova_carga', 'negociando', 'propostas', 'recusadas', 'alocadas', 'canceladas', 'suspensas'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_lance as enum ('ativo', 'vencedor', 'perdido', 'recusado', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_documento_transportador as enum (
    'cartao_cnpj',
    'contrato_social',
    'rntrc',
    'comprovante_endereco',
    'doc_responsavel',
    'apolice_seguro'
  );
exception when duplicate_object then null; end $$;

-- Profiles (vinculado a auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text not null,
  usuario text,
  role user_role not null default 'transportador',
  transportador_id uuid,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Transportadores
create table if not exists transportadores (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text not null,
  cnpj text not null unique,
  inscricao_estadual text,
  inscricao_municipal text,
  rntrc text,
  cidade text not null,
  uf char(2) not null,
  endereco text,
  numero text,
  bairro text,
  complemento text,
  cep text,
  classificacao classificacao_transportador not null default 'bronze',
  pontuacao integer not null default 50,
  situacao text not null default 'pendente'
    check (situacao in ('pendente', 'ativo', 'inativo', 'recusado')),
  telefone text,
  email text,
  contato_nome text,
  contato_telefone text,
  motivo_recusa text,
  created_at timestamptz not null default now()
);

-- Migração amigável se a tabela já existia com check antigo
alter table transportadores drop constraint if exists transportadores_situacao_check;
alter table transportadores
  add constraint transportadores_situacao_check
  check (situacao in ('pendente', 'ativo', 'inativo', 'recusado'));

alter table transportadores add column if not exists inscricao_estadual text;
alter table transportadores add column if not exists inscricao_municipal text;
alter table transportadores add column if not exists rntrc text;
alter table transportadores add column if not exists endereco text;
alter table transportadores add column if not exists numero text;
alter table transportadores add column if not exists bairro text;
alter table transportadores add column if not exists complemento text;
alter table transportadores add column if not exists cep text;
alter table transportadores add column if not exists contato_nome text;
alter table transportadores add column if not exists contato_telefone text;
alter table transportadores add column if not exists motivo_recusa text;
alter table transportadores add column if not exists origem_cep text;
alter table transportadores add column if not exists origem_cidade text;
alter table transportadores add column if not exists origem_uf char(2);
alter table transportadores add column if not exists origem_endereco text;
alter table transportadores add column if not exists origem_numero text;
alter table transportadores add column if not exists origem_bairro text;
alter table transportadores add column if not exists origem_complemento text;
alter table transportadores add column if not exists origem_lat double precision;
alter table transportadores add column if not exists origem_lng double precision;

alter table profiles add column if not exists usuario text;
alter table profiles add column if not exists ativo boolean not null default true;

alter table profiles
  drop constraint if exists profiles_transportador_id_fkey;
alter table profiles
  add constraint profiles_transportador_id_fkey
  foreign key (transportador_id) references transportadores(id);

-- Documentos do cadastro público
create table if not exists transportador_documentos (
  id uuid primary key default gen_random_uuid(),
  transportador_id uuid not null references transportadores(id) on delete cascade,
  tipo tipo_documento_transportador not null,
  nome_arquivo text not null,
  storage_path text,
  url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_transportador_documentos_tid
  on transportador_documentos(transportador_id);

-- Grupos de transportadores
create table if not exists grupos_transportadores (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'inativo')),
  observacao text,
  created_at timestamptz not null default now()
);

create table if not exists grupo_transportador_membros (
  grupo_id uuid not null references grupos_transportadores(id) on delete cascade,
  transportador_id uuid not null references transportadores(id) on delete cascade,
  primary key (grupo_id, transportador_id)
);

-- Rotas
create table if not exists rotas (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  origem text not null,
  destino text not null,
  classificacao classificacao_rota not null default 'B',
  frete_tabela numeric(12,2) not null,
  km numeric(10,2) not null default 0,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'inativo')),
  created_at timestamptz not null default now()
);

-- Cargas
create table if not exists cargas (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  pedido text,
  ordem text,
  tipo_carga text,
  veiculo text,
  remetente text,
  remetente_cnpj text,
  origem text not null,
  destino text not null,
  destinatario text,
  destinatario_cnpj text,
  peso numeric(12,2) not null default 0,
  volumes integer not null default 0,
  num_entregas integer not null default 1,
  pallets numeric(10,4) not null default 0,
  valor_mercadorias numeric(14,2) not null default 0,
  frete_tabela numeric(12,2) not null,
  frete_oferta numeric(12,2),
  margem_percentual numeric(5,2),
  data_carregamento timestamptz not null,
  previsao_entrega timestamptz,
  rota_id uuid references rotas(id),
  classificacao_rota classificacao_rota,
  status status_carga not null default 'nova_carga',
  prioridade prioridade,
  modo_publicacao modo_publicacao,
  prazo_leilao_minutos integer,
  prazo_alocacao_minutos integer,
  publicado_em timestamptz,
  expira_em timestamptz,
  alocacao_expira_em timestamptz,
  justificativa_motivo text,
  justificativa_obs text,
  grupo_ids uuid[] not null default '{}',
  grupos_notificados uuid[] not null default '{}',
  transportador_vencedor_id uuid references transportadores(id),
  frete_fechado numeric(12,2),
  placa text,
  motorista text,
  visualizacoes integer not null default 0,
  recusas integer not null default 0,
  observacao text,
  created_at timestamptz not null default now()
);

-- Lances
create table if not exists lances (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references cargas(id) on delete cascade,
  transportador_id uuid not null references transportadores(id),
  valor numeric(12,2) not null,
  status status_lance not null default 'ativo',
  created_at timestamptz not null default now()
);

create index if not exists idx_lances_carga on lances(carga_id);
create index if not exists idx_cargas_status on cargas(status);

-- Interações de pontuação
create table if not exists interacoes_pontuacao (
  id uuid primary key default gen_random_uuid(),
  transportador_id uuid not null references transportadores(id),
  carga_id uuid not null references cargas(id) on delete cascade,
  tipo text not null,
  pontos integer not null,
  created_at timestamptz not null default now()
);

-- Storage: documentos do cadastro (público para o link Abrir na revisão)
insert into storage.buckets (id, name, public)
values ('documentos-transportadores', 'documentos-transportadores', true)
on conflict (id) do update set public = excluded.public;

-- RLS
alter table profiles enable row level security;
alter table transportadores enable row level security;
alter table transportador_documentos enable row level security;
alter table grupos_transportadores enable row level security;
alter table grupo_transportador_membros enable row level security;
alter table rotas enable row level security;
alter table cargas enable row level security;
alter table lances enable row level security;
alter table interacoes_pontuacao enable row level security;

-- Políticas permissivas para MVP (ajuste em produção)
drop policy if exists "auth read profiles" on profiles;
drop policy if exists "auth update own profile" on profiles;
drop policy if exists "auth all transportadores" on transportadores;
drop policy if exists "auth all documentos" on transportador_documentos;
drop policy if exists "auth all grupos" on grupos_transportadores;
drop policy if exists "auth all membros" on grupo_transportador_membros;
drop policy if exists "auth all rotas" on rotas;
drop policy if exists "auth all cargas" on cargas;
drop policy if exists "auth all lances" on lances;
drop policy if exists "auth all interacoes" on interacoes_pontuacao;

create policy "auth read profiles" on profiles for select to authenticated using (true);
create policy "auth update own profile" on profiles for update to authenticated using (auth.uid() = id);
create policy "auth insert profiles" on profiles for insert to authenticated with check (true);

create policy "auth all transportadores" on transportadores for all to authenticated using (true) with check (true);
create policy "auth all documentos" on transportador_documentos for all to authenticated using (true) with check (true);
create policy "auth all grupos" on grupos_transportadores for all to authenticated using (true) with check (true);
create policy "auth all membros" on grupo_transportador_membros for all to authenticated using (true) with check (true);
create policy "auth all rotas" on rotas for all to authenticated using (true) with check (true);
create policy "auth all cargas" on cargas for all to authenticated using (true) with check (true);
create policy "auth all lances" on lances for all to authenticated using (true) with check (true);
create policy "auth all interacoes" on interacoes_pontuacao for all to authenticated using (true) with check (true);

-- Storage policies
drop policy if exists "docs upload auth" on storage.objects;
drop policy if exists "docs read auth" on storage.objects;
drop policy if exists "docs read anon" on storage.objects;
drop policy if exists "docs update auth" on storage.objects;

create policy "docs upload auth"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-transportadores');

create policy "docs read auth"
  on storage.objects for select to authenticated
  using (bucket_id = 'documentos-transportadores');

create policy "docs read anon"
  on storage.objects for select to anon
  using (bucket_id = 'documentos-transportadores');

create policy "docs update auth"
  on storage.objects for update to authenticated
  using (bucket_id = 'documentos-transportadores');

-- Trigger: criar profile ao cadastrar usuário
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, nome, usuario, role, ativo)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'usuario',
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'transportador'),
    case
      when coalesce(new.raw_user_meta_data->>'role', 'transportador') = 'transportador'
        then false
      else true
    end
  )
  on conflict (id) do update set
    email = excluded.email,
    nome = coalesce(excluded.nome, profiles.nome),
    usuario = coalesce(excluded.usuario, profiles.usuario);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Função: atualizar classificação do transportador
create or replace function atualizar_classificacao_transportador(p_id uuid)
returns void
language plpgsql
as $$
declare
  pts integer;
  cls classificacao_transportador;
begin
  select pontuacao into pts from transportadores where id = p_id;
  if pts >= 80 then cls := 'ouro';
  elsif pts >= 50 then cls := 'prata';
  else cls := 'bronze';
  end if;
  update transportadores set classificacao = cls where id = p_id;
end;
$$;

-- Contas do portal (usuarios): ver arquivo usuarios.sql
-- \i usuarios.sql  (ou cole o conteúdo no SQL Editor do Supabase)
