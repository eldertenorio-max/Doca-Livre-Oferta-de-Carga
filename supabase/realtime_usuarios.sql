-- Habilita Realtime na tabela usuarios (exclusão/edição aparece na hora para todos os Supers).
-- Execute no SQL Editor do Supabase (uma vez).

do $$
begin
  alter publication supabase_realtime add table public.usuarios;
exception
  when duplicate_object then null;
  when others then
    -- Já estava na publication ou nome diferente
    null;
end $$;

-- Garante que DELETE/UPDATE cheguem aos clientes
alter table public.usuarios replica identity full;
