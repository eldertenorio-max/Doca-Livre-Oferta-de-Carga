-- Foto e avaliação do motorista (Mapa da Frota)
-- Cria a tabela se ainda não existir (comum se oferta_extensoes.sql não rodou).

-- Dependência: veículos (FK opcional)
create table if not exists veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null,
  transportador_id uuid references transportadores(id),
  tipo text not null default 'Truck',
  frete_minimo numeric(12,2) not null default 0,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'inativo')),
  created_at timestamptz not null default now()
);

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
alter table motoristas add column if not exists foto_url text;
alter table motoristas add column if not exists avaliacao numeric(2,1);
alter table motoristas add column if not exists total_avaliacoes integer default 0;

create index if not exists idx_motoristas_transportador on motoristas(transportador_id);

alter table motoristas enable row level security;
drop policy if exists "auth all motoristas" on motoristas;
create policy "auth all motoristas" on motoristas for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
