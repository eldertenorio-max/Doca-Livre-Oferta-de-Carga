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
  create type modo_publicacao as enum ('leilao', 'oferta', 'negociacao_direta');
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
    'cartao_cnpj', 'contrato_social', 'rntrc', 'comprovante_endereco', 'doc_responsavel', 'apolice_seguro'
  );
exception when duplicate_object then null; end $$;

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
  origem_cep text,
  origem_cidade text,
  origem_uf char(2),
  origem_endereco text,
  origem_numero text,
  origem_bairro text,
  origem_complemento text,
  origem_lat double precision,
  origem_lng double precision,
  raio_km integer,
  origem_cadastro text,
  disponivel_mapa boolean not null default true,
  facial_descriptor jsonb,
  facial_foto_url text,
  facial_verificado_em timestamptz,
  facial_proxima_em timestamptz,
  facial_historico jsonb not null default '[]'::jsonb,
  facial_reset_em timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists transportador_documentos (
  id uuid primary key default gen_random_uuid(),
  transportador_id uuid not null references transportadores(id) on delete cascade,
  tipo tipo_documento_transportador not null,
  nome_arquivo text not null,
  storage_path text,
  url text,
  created_at timestamptz not null default now()
);

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
  transportador_direto_ids uuid[] not null default '{}',
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

create table if not exists lances (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references cargas(id) on delete cascade,
  transportador_id uuid not null references transportadores(id),
  valor numeric(12,2) not null,
  status status_lance not null default 'ativo',
  created_at timestamptz not null default now()
);

create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  usuario text not null,
  email text not null,
  senha_hash text,
  nome text not null,
  role text not null default 'minerva'
    check (role in ('minerva', 'transportador', 'super')),
  nivel text default 'operador'
    check (nivel is null or nivel in ('super', 'gestor', 'operador')),
  perfil_operacional text
    check (
      perfil_operacional is null
      or perfil_operacional in ('administrador', 'operador', 'consulta')
    ),
  transportador_id uuid references transportadores(id) on delete set null,
  empresa_org_id text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_usuarios_usuario_lower on usuarios (lower(usuario));
create unique index if not exists idx_usuarios_email_lower on usuarios (lower(email));
create index if not exists idx_lances_carga on lances(carga_id);
create index if not exists idx_cargas_status on cargas(status);

create table if not exists kanban_sync (
  id text primary key default 'main',
  payload jsonb not null default '{}'::jsonb,
  client_id text,
  updated_at timestamptz not null default now()
);

insert into kanban_sync (id, payload)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

alter table transportadores add column if not exists logo_url text;
alter table transportadores add column if not exists perfil_publico jsonb;
alter table transportadores add column if not exists plano text;
alter table transportadores add column if not exists ramificacao text;

alter table cargas add column if not exists avaliacao_comentario text;
alter table cargas add column if not exists avaliacao_motorista text;
alter table cargas add column if not exists avaliacao_veiculo text;
alter table cargas add column if not exists avaliado_em timestamptz;
alter table cargas add column if not exists destinatario_email text;
alter table cargas add column if not exists destinatario_whatsapp text;
alter table cargas add column if not exists motivo_cancelamento_viagem text;
alter table cargas add column if not exists status_viagem text;
alter table cargas add column if not exists viagem_cancelada_em timestamptz;
alter table cargas add column if not exists viagem_finalizada_em timestamptz;
alter table cargas add column if not exists viagem_iniciada_em timestamptz;

alter table usuarios add column if not exists auth_user_id uuid;
alter table usuarios add column if not exists avatar_url text;
