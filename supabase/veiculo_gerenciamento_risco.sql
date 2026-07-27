-- Gerenciamento de risco no cadastro de veículo
-- Execute no SQL Editor do Supabase (uma vez).

alter table veiculos
  add column if not exists gerenciamento_risco text
  check (
    gerenciamento_risco is null
    or gerenciamento_risco in ('rastreador', 'localizador', 'nenhum')
  );

alter table veiculos
  add column if not exists rastreador_dados text;

comment on column veiculos.gerenciamento_risco is
  'rastreador | localizador | nenhum';
comment on column veiculos.rastreador_dados is
  'Dados do rastreador (IMEI, ID, etc.) quando gerenciamento_risco = rastreador';
