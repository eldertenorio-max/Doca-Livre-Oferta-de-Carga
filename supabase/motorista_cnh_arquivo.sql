-- Anexo da CNH (foto ou PDF) no cadastro de motorista.
alter table if exists public.motoristas
  add column if not exists cnh_arquivo_url text;

alter table if exists public.motoristas
  add column if not exists cnh_arquivo_nome text;
