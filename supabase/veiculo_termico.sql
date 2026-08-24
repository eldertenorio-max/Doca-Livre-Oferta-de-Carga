-- Térmico / aparelho de frio quando aclimação é Refrigerado ou Congelado.
alter table veiculos add column if not exists marca_termico text;
alter table veiculos add column if not exists temp_min numeric(6,1);
alter table veiculos add column if not exists temp_max numeric(6,1);
