-- Foto de perfil do usuário do portal (compartilhada entre aparelhos).
-- Rodar no SQL Editor do Supabase.

alter table public.usuarios
  add column if not exists avatar_url text;

comment on column public.usuarios.avatar_url is
  'URL pública da foto de perfil (Storage) ou data URL de fallback.';

-- Mantém também em profiles (contas Auth / cadastro público).
alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'URL da foto de perfil do usuário (Storage ou data URL).';
