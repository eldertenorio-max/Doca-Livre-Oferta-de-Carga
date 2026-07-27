-- Contato do destinatário na carga (WhatsApp + e-mail)
alter table public.cargas
  add column if not exists destinatario_whatsapp text;

alter table public.cargas
  add column if not exists destinatario_email text;

comment on column public.cargas.destinatario_whatsapp is
  'WhatsApp do destinatário (contato da entrega).';

comment on column public.cargas.destinatario_email is
  'E-mail(s) do destinatário (um ou mais, separados por vírgula).';

notify pgrst, 'reload schema';
