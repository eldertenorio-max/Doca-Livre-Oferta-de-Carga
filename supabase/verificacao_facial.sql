-- Verificação facial do transportador (cadastro + nova cobrança de tempos em tempos).
alter table transportadores add column if not exists facial_descriptor jsonb;
alter table transportadores add column if not exists facial_foto_url text;
alter table transportadores add column if not exists facial_verificado_em timestamptz;
alter table transportadores add column if not exists facial_proxima_em timestamptz;
alter table transportadores add column if not exists facial_historico jsonb not null default '[]'::jsonb;
