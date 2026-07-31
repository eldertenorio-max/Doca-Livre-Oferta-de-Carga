-- Perfil público da transportadora (estilo página Transvias)
-- Rode no SQL Editor do Supabase.

alter table public.transportadores
  add column if not exists perfil_publico jsonb default '{}'::jsonb;

comment on column public.transportadores.perfil_publico is
  'Conteúdo do perfil público: especialidades, apresentacao, servicos, referencias, cobertura, galeria';

notify pgrst, 'reload schema';
