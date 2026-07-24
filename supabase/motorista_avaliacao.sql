-- Foto e avaliação do motorista (Mapa da Frota)
alter table motoristas add column if not exists foto_url text;
alter table motoristas add column if not exists avaliacao numeric(2,1);
alter table motoristas add column if not exists total_avaliacoes integer default 0;

notify pgrst, 'reload schema';
