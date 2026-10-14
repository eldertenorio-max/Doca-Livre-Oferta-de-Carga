-- Créditos dados pelo super podem passar de 500 (até 10.000).
do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'rota_publico_presentes'
      and con.contype = 'c'
  loop
    execute format('alter table public.rota_publico_presentes drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.rota_publico_presentes
  add constraint rota_publico_presentes_creditos_check
  check (creditos > 0 and creditos <= 10000);
