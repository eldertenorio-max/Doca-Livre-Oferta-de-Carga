-- Aba Viagens: status operacional pós-alocação + avaliação motorista/veículo
-- Rode no SQL Editor do Supabase após schema / oferta_extensoes.

alter table public.cargas
  add column if not exists status_viagem text
    check (
      status_viagem is null
      or status_viagem in (
        'aguardando_inicio',
        'rota_iniciada',
        'rota_finalizada',
        'cancelada'
      )
    );

alter table public.cargas add column if not exists viagem_iniciada_em timestamptz;
alter table public.cargas add column if not exists viagem_finalizada_em timestamptz;
alter table public.cargas add column if not exists viagem_cancelada_em timestamptz;
alter table public.cargas add column if not exists motivo_cancelamento_viagem text;

alter table public.cargas add column if not exists avaliacao_motorista numeric(2,1);
alter table public.cargas add column if not exists avaliacao_veiculo numeric(2,1);
alter table public.cargas add column if not exists avaliacao_comentario text;
alter table public.cargas add column if not exists avaliado_em timestamptz;

-- Alocadas existentes entram em aguardando início
update public.cargas
set status_viagem = 'aguardando_inicio'
where status = 'alocadas'
  and (status_viagem is null or status_viagem = '');

-- Média no veículo (opcional; motorista já tem em motorista_avaliacao.sql)
alter table public.veiculos add column if not exists avaliacao numeric(2,1);
alter table public.veiculos add column if not exists total_avaliacoes integer default 0;

comment on column public.cargas.status_viagem is
  'Aba Viagens: aguardando_inicio | rota_iniciada | rota_finalizada | cancelada';

notify pgrst, 'reload schema';
