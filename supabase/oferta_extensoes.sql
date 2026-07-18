-- Extensões da especificação (exceto integração avançada Controle de Fretes).
-- Aplicar após schema.sql em ambientes já existentes.

do $$ begin
  alter type status_carga add value if not exists 'canceladas';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type status_carga add value if not exists 'suspensas';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type status_lance add value if not exists 'cancelado';
exception when duplicate_object then null; end $$;

alter table cargas
  add column if not exists frete_minimo numeric(12,2),
  add column if not exists frete_maximo numeric(12,2),
  add column if not exists pausado_em timestamptz,
  add column if not exists tempo_restante_ms bigint,
  add column if not exists veiculo_id uuid,
  add column if not exists motorista_id uuid,
  add column if not exists criado_por uuid,
  add column if not exists publicado_por uuid,
  add column if not exists motivo_cancelamento text;

create table if not exists motoristas (
  id uuid primary key default gen_random_uuid(),
  transportador_id uuid references transportadores(id) on delete cascade,
  veiculo_id uuid references veiculos(id) on delete set null,
  autonomo boolean not null default false,
  nome text not null,
  cpf text,
  cnh text,
  categoria_cnh text,
  validade_cnh date,
  telefone text,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'inativo')),
  created_at timestamptz not null default now()
);

alter table motoristas add column if not exists veiculo_id uuid references veiculos(id) on delete set null;
alter table motoristas add column if not exists autonomo boolean not null default false;
alter table motoristas alter column transportador_id drop not null;

create index if not exists idx_motoristas_transportador on motoristas(transportador_id);

do $$ begin
  alter table cargas
    add constraint cargas_veiculo_id_fkey
    foreign key (veiculo_id) references veiculos(id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table cargas
    add constraint cargas_motorista_id_fkey
    foreign key (motorista_id) references motoristas(id);
exception when duplicate_object then null; end $$;

create table if not exists historico_propostas (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references cargas(id) on delete cascade,
  lance_id uuid references lances(id) on delete set null,
  transportador_id uuid not null references transportadores(id),
  valor_anterior numeric(12,2),
  valor_novo numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_historico_propostas_carga on historico_propostas(carga_id);

create table if not exists notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  role text,
  transportador_id uuid references transportadores(id) on delete cascade,
  titulo text not null,
  mensagem text not null,
  carga_id uuid references cargas(id) on delete set null,
  lida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notificacoes_user on notificacoes(user_id);
create index if not exists idx_notificacoes_transportador on notificacoes(transportador_id);

alter table motoristas enable row level security;
alter table historico_propostas enable row level security;
alter table notificacoes enable row level security;

drop policy if exists "auth all motoristas" on motoristas;
drop policy if exists "auth all historico_propostas" on historico_propostas;
drop policy if exists "auth all notificacoes" on notificacoes;

create policy "auth all motoristas" on motoristas for all to authenticated using (true) with check (true);
create policy "auth all historico_propostas" on historico_propostas for all to authenticated using (true) with check (true);
create policy "auth all notificacoes" on notificacoes for all to authenticated using (true) with check (true);

-- Auditoria opcional em historico (se a tabela já existir com colunas diferentes, ignore erros)
do $$ begin
  alter table historico add column if not exists ator_id uuid;
  alter table historico add column if not exists ator_nome text;
  alter table historico add column if not exists ip text;
  alter table historico add column if not exists user_agent text;
exception when undefined_table then null; end $$;
