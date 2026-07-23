-- Rode no SQL Editor do Supabase (uma vez) para o cadastro público funcionar.
-- Corrige: Could not find the 'raio_km' column / origem_* / origem_cadastro

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

-- Origem residencial + raio de pesquisa
alter table transportadores add column if not exists origem_cep text;
alter table transportadores add column if not exists origem_cidade text;
alter table transportadores add column if not exists origem_uf char(2);
alter table transportadores add column if not exists origem_endereco text;
alter table transportadores add column if not exists origem_numero text;
alter table transportadores add column if not exists origem_bairro text;
alter table transportadores add column if not exists origem_complemento text;
alter table transportadores add column if not exists origem_lat double precision;
alter table transportadores add column if not exists origem_lng double precision;
alter table transportadores add column if not exists raio_km integer;

-- Link público vs painel
alter table transportadores add column if not exists origem_cadastro text;
alter table transportadores drop constraint if exists transportadores_origem_cadastro_check;
alter table transportadores
  add constraint transportadores_origem_cadastro_check
  check (origem_cadastro is null or origem_cadastro in ('link', 'painel'));

update transportadores
set origem_cadastro = 'link'
where origem_cadastro is null and situacao = 'pendente';

update transportadores
set origem_cadastro = 'painel'
where origem_cadastro is null;

-- Atualiza o cache do PostgREST (evita "schema cache")
notify pgrst, 'reload schema';
