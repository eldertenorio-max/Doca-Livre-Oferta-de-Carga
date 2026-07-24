-- Disponibilidade no Mapa da Frota (transportador liga/desliga)
alter table transportadores
  add column if not exists disponivel_mapa boolean not null default true;

notify pgrst, 'reload schema';
