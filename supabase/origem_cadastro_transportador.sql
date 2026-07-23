-- Origem do cadastro: link público vs painel do embarcador
-- Rode no SQL Editor do Supabase (uma vez).

alter table transportadores
  add column if not exists origem_cadastro text;

alter table transportadores drop constraint if exists transportadores_origem_cadastro_check;
alter table transportadores
  add constraint transportadores_origem_cadastro_check
  check (origem_cadastro is null or origem_cadastro in ('link', 'painel'));

-- Heurística para linhas antigas: pendentes costumam vir do link público
update transportadores
set origem_cadastro = 'link'
where origem_cadastro is null and situacao = 'pendente';

update transportadores
set origem_cadastro = 'painel'
where origem_cadastro is null;
