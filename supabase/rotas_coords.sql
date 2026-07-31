-- Coordenadas de origem/destino nas rotas cadastradas.
-- Rode no SQL Editor do Supabase.

alter table if exists public.rotas
  add column if not exists origem_lat double precision,
  add column if not exists origem_lng double precision,
  add column if not exists destino_lat double precision,
  add column if not exists destino_lng double precision;
