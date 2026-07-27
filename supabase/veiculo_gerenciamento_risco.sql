-- Gerenciamento de risco no cadastro de veículo
alter table veiculos add column if not exists gerenciamento_risco text;
alter table veiculos add column if not exists rastreador_dados text;

comment on column veiculos.gerenciamento_risco is
  'rastreador | localizador | nenhum';
comment on column veiculos.rastreador_dados is
  'Dados do equipamento (IMEI, serial, fornecedor…) quando gerenciamento_risco = rastreador';

update veiculos
set gerenciamento_risco = 'nenhum'
where gerenciamento_risco is null or btrim(gerenciamento_risco) = '';
