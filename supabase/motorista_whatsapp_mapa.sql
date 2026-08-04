-- WhatsApp do motorista no Mapa da Frota (opcional)
alter table if exists public.motoristas
  add column if not exists whatsapp_no_mapa boolean not null default false;

notify pgrst, 'reload schema';
