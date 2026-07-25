-- ============================================================
-- Completa a tabela veiculos + seed das placas de demonstração
-- Execute no SQL Editor do Supabase (uma vez).
-- Não apaga as placas reais já cadastradas (ex.: Ultrafrio).
-- ============================================================

-- 1) Colunas que o app grava no upsert
alter table veiculos add column if not exists renavam text;
alter table veiculos add column if not exists condutor text;
alter table veiculos add column if not exists tipo text;
alter table veiculos add column if not exists marca text;
alter table veiculos add column if not exists modelo text;
alter table veiculos add column if not exists cor text;
alter table veiculos add column if not exists ano_fabricacao text;
alter table veiculos add column if not exists ano_modelo text;
alter table veiculos add column if not exists uf_licenciamento char(2);
alter table veiculos add column if not exists foto_url text;
alter table veiculos add column if not exists fotos jsonb not null default '{}'::jsonb;
alter table veiculos add column if not exists tipo_carroceria text;
alter table veiculos add column if not exists qtd_pallets integer;
alter table veiculos add column if not exists aclimatacao text;
alter table veiculos add column if not exists capacidade_kg numeric(12,2);
alter table veiculos add column if not exists cubagem_m3 numeric(12,2);
alter table veiculos add column if not exists eixos integer;
alter table veiculos add column if not exists frete_minimo numeric(12,2) not null default 0;
alter table veiculos add column if not exists usa_manobrista boolean not null default false;
alter table veiculos add column if not exists padiado boolean not null default false;
alter table veiculos add column if not exists situacao text not null default 'ativo';
alter table veiculos add column if not exists disponivel_mapa boolean not null default true;
alter table veiculos add column if not exists created_at timestamptz not null default now();
alter table veiculos add column if not exists updated_at timestamptz not null default now();

-- Autônomo / placa sem empresa
alter table veiculos alter column transportador_id drop not null;

-- tipo pode faltar em cadastros antigos; default seguro
update veiculos set tipo = 'Outros' where tipo is null or btrim(tipo) = '';
do $$ begin
  alter table veiculos alter column tipo set default 'Outros';
  alter table veiculos alter column tipo set not null;
exception when others then null;
end $$;

create index if not exists idx_veiculos_placa on veiculos(placa);
create index if not exists idx_veiculos_transportador on veiculos(transportador_id);

-- 2) RLS anon (portal não cria sessão Auth)
alter table veiculos enable row level security;

drop policy if exists "anon select veiculos" on veiculos;
create policy "anon select veiculos"
  on veiculos for select to anon using (true);

drop policy if exists "anon insert veiculos" on veiculos;
create policy "anon insert veiculos"
  on veiculos for insert to anon with check (true);

drop policy if exists "anon update veiculos" on veiculos;
create policy "anon update veiculos"
  on veiculos for update to anon using (true) with check (true);

drop policy if exists "anon delete veiculos" on veiculos;
create policy "anon delete veiculos"
  on veiculos for delete to anon using (true);

-- 3) Storage das fotos
insert into storage.buckets (id, name, public)
values ('veiculos-fotos', 'veiculos-fotos', true)
on conflict (id) do update set public = true;

drop policy if exists "anon read veiculos fotos" on storage.objects;
create policy "anon read veiculos fotos"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'veiculos-fotos');

drop policy if exists "anon write veiculos fotos" on storage.objects;
create policy "anon write veiculos fotos"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'veiculos-fotos');

drop policy if exists "anon update veiculos fotos" on storage.objects;
create policy "anon update veiculos fotos"
  on storage.objects for update to anon, authenticated
  using (bucket_id = 'veiculos-fotos')
  with check (bucket_id = 'veiculos-fotos');

drop policy if exists "anon delete veiculos fotos" on storage.objects;
create policy "anon delete veiculos fotos"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'veiculos-fotos');

-- 4) Limpa base64 antigo (não cabe no sync; fotos novas vão ao Storage)
update veiculos
set
  fotos = '{}'::jsonb,
  foto_url = case when foto_url like 'data:%' then null else foto_url end
where fotos::text like '%data:image%'
   or coalesce(foto_url, '') like 'data:%';

-- 5) Placas de demonstração (só se a placa ainda não existir)
-- Transportadoras seed: Santos / Log Nova Era / SafraLog / TransBrasil / RodoSul
insert into veiculos (
  id, placa, transportador_id, tipo, marca, modelo, cor,
  ano_fabricacao, ano_modelo, uf_licenciamento, tipo_carroceria,
  qtd_pallets, aclimatacao, capacidade_kg, cubagem_m3, eixos,
  frete_minimo, usa_manobrista, padiado, situacao, disponivel_mapa, fotos
)
select *
from (
  values
    (
      'a1111111-1111-4111-8111-111111111111'::uuid,
      'ABC1D23',
      '11111111-1111-1111-1111-111111111111'::uuid,
      'Carreta Simples', 'Volvo', 'FH 460', 'Branco',
      '2021', '2022', 'SP', 'Baú',
      28, 'Seco', 28000::numeric, 90::numeric, 3,
      3500::numeric, false, true, 'ativo', true, '{}'::jsonb
    ),
    (
      'a2222222-2222-4222-8222-222222222222'::uuid,
      'XYZ9K88',
      '22222222-2222-2222-2222-222222222222'::uuid,
      'Bitrem', 'Scania', 'R450', 'Prata',
      '2020', '2020', 'SP', 'Sider',
      32, 'Refrigerado', 40000::numeric, 110::numeric, 5,
      5200::numeric, true, false, 'ativo', true, '{}'::jsonb
    ),
    (
      'a3333333-3333-4333-8333-333333333333'::uuid,
      'AUT0N0M',
      '33333333-3333-3333-3333-333333333333'::uuid,
      'Truck', 'Volkswagen', 'Constellation', 'Branco',
      '2019', '2019', 'SP', 'Baú',
      null::int, null::text, 14000::numeric, null::numeric, null::int,
      2800::numeric, false, false, 'ativo', true, '{}'::jsonb
    ),
    (
      'a4444444-4444-4444-8444-444444444444'::uuid,
      'VAN2X45',
      '44444444-4444-4444-4444-444444444444'::uuid,
      'Van / Furgão', 'Mercedes', 'Sprinter', 'Branco',
      '2022', '2023', 'SP', 'Furgão',
      null::int, null::text, 1500::numeric, null::numeric, null::int,
      890::numeric, false, false, 'ativo', true, '{}'::jsonb
    ),
    (
      'a5555555-5555-4555-8555-555555555555'::uuid,
      'RDO5S77',
      '55555555-5555-5555-5555-555555555555'::uuid,
      'Carreta LS', 'DAF', 'XF 480', 'Azul',
      '2021', '2021', 'PR', 'Sider',
      30, null::text, 30000::numeric, null::numeric, null::int,
      4100::numeric, false, true, 'ativo', true, '{}'::jsonb
    ),
    (
      'a6666666-6666-4666-8666-666666666666'::uuid,
      'STS6T01',
      '11111111-1111-1111-1111-111111111111'::uuid,
      'Toco', 'Mercedes', 'Atego', 'Branco',
      '2018', '2018', 'SP', 'Baú',
      null::int, null::text, 8000::numeric, null::numeric, null::int,
      1800::numeric, false, false, 'ativo', true, '{}'::jsonb
    )
) as s(
  id, placa, transportador_id, tipo, marca, modelo, cor,
  ano_fabricacao, ano_modelo, uf_licenciamento, tipo_carroceria,
  qtd_pallets, aclimatacao, capacidade_kg, cubagem_m3, eixos,
  frete_minimo, usa_manobrista, padiado, situacao, disponivel_mapa, fotos
)
where not exists (
  select 1 from veiculos v
  where upper(regexp_replace(v.placa, '[^a-zA-Z0-9]', '', 'g'))
      = upper(regexp_replace(s.placa, '[^a-zA-Z0-9]', '', 'g'))
)
and exists (
  select 1 from transportadores t where t.id = s.transportador_id
);
