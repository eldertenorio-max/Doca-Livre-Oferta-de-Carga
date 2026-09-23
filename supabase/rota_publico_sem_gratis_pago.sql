-- Depois da primeira compra, a conta não usa mais os 2 grátis do dia.
-- Rode no SQL Editor (o site já trata saldo > 0 sem este SQL).

create or replace function public.rota_publico_meus_creditos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_saldo integer;
  v_presente integer := 0;
  v_ids uuid[] := '{}';
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_autenticado', 'creditos', 0, 'presente', 0, 'comprou', false);
  end if;

  insert into public.rota_publico_creditos (user_id, saldo)
  values (v_uid, 0)
  on conflict (user_id) do nothing;

  perform public.rota_publico_aplicar_presentes_user(v_uid);

  select coalesce(sum(creditos), 0), coalesce(array_agg(id), '{}'::uuid[])
    into v_presente, v_ids
  from public.rota_publico_presentes
  where user_id = v_uid
    and aplicado_em is not null
    and visto_em is null;

  select saldo into v_saldo
  from public.rota_publico_creditos
  where user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'creditos', coalesce(v_saldo, 0),
    'presente', coalesce(v_presente, 0),
    'presente_ids', to_jsonb(coalesce(v_ids, '{}'::uuid[])),
    'comprou', coalesce(v_saldo, 0) > 0
      or exists (select 1 from public.rota_publico_pix where user_id = v_uid)
  );
end;
$$;

grant execute on function public.rota_publico_meus_creditos() to authenticated;
