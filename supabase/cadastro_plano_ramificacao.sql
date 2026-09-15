-- Ramificação e plano no cadastro do Oferta de Carga (depois do PIX).
-- Execute no SQL Editor.

alter table public.transportadores
  add column if not exists ramificacao text;

alter table public.transportadores
  add column if not exists plano text;

alter table public.transportadores drop constraint if exists transportadores_ramificacao_check;
alter table public.transportadores
  add constraint transportadores_ramificacao_check
  check (
    ramificacao is null
    or ramificacao in ('embarcador', 'unidade', 'transportadora', 'motorista')
  );
