-- Pontos de passagem (waypoints) nas rotas cadastradas.
-- Rode no SQL Editor do Supabase.

alter table if exists public.rotas
  add column if not exists pontos_passagem jsonb default '[]'::jsonb;
