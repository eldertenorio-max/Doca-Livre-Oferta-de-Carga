-- Foto de perfil do usuário (Super / embarcador / transportador)
-- Preferir supabase/usuario_avatar.sql (grava em usuarios + profiles).

alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'URL da foto de perfil do usuário (Storage ou data URL).';
