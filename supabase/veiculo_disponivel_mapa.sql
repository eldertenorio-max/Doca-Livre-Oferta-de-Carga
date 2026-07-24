-- Disponibilidade no Mapa da Frota por placa (veículo)
-- Execute no SQL Editor do Supabase.

alter table veiculos
  add column if not exists disponivel_mapa boolean not null default true;

comment on column veiculos.disponivel_mapa is
  'Se true, a placa aparece no Mapa da Frota como disponível para carregar.';
