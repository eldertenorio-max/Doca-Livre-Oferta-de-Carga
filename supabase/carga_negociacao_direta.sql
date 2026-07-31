-- Negociação direta: novo modo de publicação + destinatários explícitos.
-- Rode no SQL Editor do Supabase.

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'modo_publicacao'
      and e.enumlabel = 'negociacao_direta'
  ) then
    alter type modo_publicacao add value 'negociacao_direta';
  end if;
end $$;

alter table if exists public.cargas
  add column if not exists transportador_direto_ids uuid[] not null default '{}';
