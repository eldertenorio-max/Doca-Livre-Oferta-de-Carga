-- Localização por veículo (base no mapa da frota).
-- Rode no SQL Editor do Supabase.

alter table if exists public.veiculos
  add column if not exists origem_cep text,
  add column if not exists origem_cidade text,
  add column if not exists origem_uf text,
  add column if not exists origem_endereco text,
  add column if not exists origem_numero text,
  add column if not exists origem_bairro text,
  add column if not exists origem_complemento text,
  add column if not exists origem_lat double precision,
  add column if not exists origem_lng double precision,
  add column if not exists raio_km numeric(10,2);
