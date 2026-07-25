-- Logo / foto de perfil do transportador
-- Execute no SQL Editor do Supabase.

alter table public.transportadores
  add column if not exists logo_url text;

comment on column public.transportadores.logo_url is
  'URL da logo da empresa ou foto do responsável (perfil).';
