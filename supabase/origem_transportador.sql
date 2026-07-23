-- Origem residencial do transportador (não confundir com endereço do CNPJ)
alter table transportadores add column if not exists origem_cep text;
alter table transportadores add column if not exists origem_cidade text;
alter table transportadores add column if not exists origem_uf char(2);
alter table transportadores add column if not exists origem_endereco text;
alter table transportadores add column if not exists origem_numero text;
alter table transportadores add column if not exists origem_bairro text;
alter table transportadores add column if not exists origem_complemento text;
alter table transportadores add column if not exists origem_lat double precision;
alter table transportadores add column if not exists origem_lng double precision;
alter table transportadores add column if not exists raio_km integer;
