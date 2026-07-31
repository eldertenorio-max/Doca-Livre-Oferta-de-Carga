-- Dimensões do baú/carroceria (metros) para calcular cubagem (m³).
alter table veiculos add column if not exists comprimento_m numeric(10,3);
alter table veiculos add column if not exists largura_m numeric(10,3);
alter table veiculos add column if not exists altura_m numeric(10,3);
