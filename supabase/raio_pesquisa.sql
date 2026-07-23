-- Raio máximo (km) entre origem residencial e local de carregamento
alter table transportadores add column if not exists raio_km integer;
