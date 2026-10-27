create table if not exists contas_publicas (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  senha_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contas_sessoes (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas_publicas(id) on delete cascade,
  refresh_token text not null unique,
  expira_em timestamptz not null
);

create table if not exists otp_codigos (
  id uuid primary key default gen_random_uuid(),
  finalidade text not null,
  email text not null,
  codigo text not null,
  expira_em timestamptz not null,
  usado_em timestamptz,
  tentativas integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists rota_publico_creditos (
  user_id uuid primary key,
  saldo integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists rota_publico_pix (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  txid text not null unique,
  pacote_id text not null,
  creditos integer not null,
  valor numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists rota_publico_presentes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  creditos integer not null,
  criado_por text,
  criado_em timestamptz not null default now(),
  aplicado_em timestamptz,
  visto_em timestamptz,
  email_enviado_em timestamptz,
  email_erro text
);

create table if not exists rota_publico_cobrancas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  asaas_payment_id text unique,
  asaas_customer_id text,
  tipo text,
  pacote_id text,
  creditos integer not null default 0,
  valor numeric(10,2) not null default 0,
  status text not null default 'pendente',
  payload text,
  imagem text,
  criado_em timestamptz not null default now(),
  pago_em timestamptz,
  email_enviado_em timestamptz
);

create table if not exists mapa_publico_cotas (
  chave text primary key,
  n integer not null default 0,
  inicio timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant all privileges on all tables in schema public to web;

revoke all on contas_publicas from web;
revoke all on contas_sessoes from web;
revoke all on otp_codigos from web;
revoke all on rota_publico_creditos from web;
revoke all on rota_publico_pix from web;
revoke all on rota_publico_presentes from web;
revoke all on rota_publico_cobrancas from web;
revoke all on mapa_publico_cotas from web;
