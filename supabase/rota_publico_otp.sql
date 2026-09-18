-- Códigos de e-mail da calculadora pública (criar conta / esqueci a senha).
-- Rode no SQL Editor. Depois: supabase functions deploy rota-publico-otp --project-ref imnlbbfgaztfhwndfxwb

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.portal_email_codigos'::regclass
      and contype = 'c'
  loop
    execute format('alter table public.portal_email_codigos drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.portal_email_codigos
  add constraint portal_email_codigos_finalidade_check
  check (finalidade in ('cadastro', 'senha', 'rota_cadastro', 'rota_senha'));

create or replace function public.rota_publico_auth_por_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid;
  v_origem text;
  v_role text;
  v_providers jsonb;
begin
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'erro', 'email_invalido');
  end if;

  select
    u.id,
    coalesce(u.raw_user_meta_data->>'origem', ''),
    coalesce(u.raw_user_meta_data->>'role', ''),
    coalesce(u.raw_app_meta_data->'providers', '[]'::jsonb)
  into v_id, v_origem, v_role, v_providers
  from auth.users u
  where lower(trim(coalesce(u.email, ''))) = v_email
  order by u.created_at asc
  limit 1;

  if v_id is null then
    return jsonb_build_object('ok', true, 'existe', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'existe', true,
    'id', v_id,
    'origem', v_origem,
    'role', v_role,
    'providers', v_providers
  );
end;
$$;

revoke all on function public.rota_publico_auth_por_email(text) from public, anon, authenticated;
grant execute on function public.rota_publico_auth_por_email(text) to service_role;
