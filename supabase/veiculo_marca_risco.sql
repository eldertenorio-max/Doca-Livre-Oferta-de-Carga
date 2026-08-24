-- Marca do rastreador/localizador no cadastro do veículo (matching da oferta).
alter table veiculos add column if not exists marca_rastreador text;
alter table veiculos add column if not exists marca_localizador text;
