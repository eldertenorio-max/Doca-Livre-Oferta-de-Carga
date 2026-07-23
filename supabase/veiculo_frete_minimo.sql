-- Frete mínimo por veículo/categoria
alter table veiculos add column if not exists frete_minimo numeric(12,2) not null default 0;
