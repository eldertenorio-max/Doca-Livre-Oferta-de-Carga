-- Pacotes da calculadora: 50 / R$ 29,90 · 100 / R$ 59,90 · 200 / R$ 99,90
-- Rode no SQL Editor se rota_publico_creditar_pacote já existir.

create or replace function public.rota_publico_creditar_pacote(p_pacote text, p_txid text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_creditos integer;
  v_valor numeric(10,2);
  v_saldo integer;
  v_txid text := upper(trim(coalesce(p_txid, '')));
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_autenticado', 'creditos', 0);
  end if;
  if v_txid = '' or length(v_txid) > 32 then
    return jsonb_build_object('ok', false, 'erro', 'txid_invalido', 'creditos', 0);
  end if;

  v_creditos := case trim(coalesce(p_pacote, ''))
    when '50' then 50
    when '100' then 100
    when '200' then 200
    else null
  end;
  v_valor := case trim(coalesce(p_pacote, ''))
    when '50' then 29.90
    when '100' then 59.90
    when '200' then 99.90
    else null
  end;
  if v_creditos is null then
    return jsonb_build_object('ok', false, 'erro', 'pacote_invalido', 'creditos', 0);
  end if;

  insert into public.rota_publico_creditos (user_id, saldo)
  values (v_uid, 0)
  on conflict (user_id) do nothing;

  begin
    insert into public.rota_publico_pix (user_id, txid, pacote_id, creditos, valor)
    values (v_uid, v_txid, trim(p_pacote), v_creditos, v_valor);
  exception
    when unique_violation then
      select saldo into v_saldo from public.rota_publico_creditos where user_id = v_uid;
      return jsonb_build_object('ok', false, 'erro', 'ja_usado', 'creditos', coalesce(v_saldo, 0));
  end;

  update public.rota_publico_creditos
  set saldo = saldo + v_creditos, updated_at = now()
  where user_id = v_uid
  returning saldo into v_saldo;

  return jsonb_build_object('ok', true, 'creditos', coalesce(v_saldo, 0));
end;
$$;

grant execute on function public.rota_publico_creditar_pacote(text, text) to authenticated;
