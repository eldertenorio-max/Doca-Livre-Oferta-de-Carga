-- Tabela de veículos (execute no SQL Editor do Supabase após schema.sql)

create table if not exists veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null,
  transportador_id uuid not null references transportadores(id),
  renavam text,
  condutor text,
  tipo text not null,
  marca text,
  modelo text,
  cor text,
  ano_fabricacao text,
  ano_modelo text,
  uf_licenciamento char(2),
  foto_url text,
  fotos jsonb not null default '{}'::jsonb,
  tipo_carroceria text,
  qtd_pallets integer,
  aclimatacao text,
  capacidade_kg numeric(12,2),
  cubagem_m3 numeric(12,2),
  eixos integer,
  usa_manobrista boolean not null default false,
  padiado boolean not null default false,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'inativo')),
  created_at timestamptz not null default now()
);

alter table veiculos add column if not exists fotos jsonb not null default '{}'::jsonb;
alter table veiculos add column if not exists frete_minimo numeric(12,2) not null default 0;

create index if not exists idx_veiculos_placa on veiculos(placa);
create index if not exists idx_veiculos_transportador on veiculos(transportador_id);

alter table veiculos enable row level security;

create policy "auth all veiculos" on veiculos
  for all to authenticated using (true) with check (true);

-- Campos extras de transportadora (se ainda não existirem)
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
