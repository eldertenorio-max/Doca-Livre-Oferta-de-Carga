-- Marca e modelo do rastreador/localizador no cadastro do veículo.
alter table veiculos add column if not exists marca_rastreador text;
alter table veiculos add column if not exists modelo_rastreador text;
alter table veiculos add column if not exists marca_localizador text;
alter table veiculos add column if not exists modelo_localizador text;
