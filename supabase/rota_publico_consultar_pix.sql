-- Conferência anti-golpe: cada PIX da calculadora tem código único (txid).
-- Rode no SQL Editor (também já está em rota_publico_creditos.sql).
-- Depois: Financeiro → Conferir PIX da calculadora, cole o código do WhatsApp.

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
  v_quando timestamptz;
  v_email text;
  v_pacote_id text;
  v_pix_creditos integer;
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
      select p.created_at, p.pacote_id, p.creditos, u.email, c.saldo
        into v_quando, v_pacote_id, v_pix_creditos, v_email, v_saldo
      from public.rota_publico_pix p
      left join auth.users u on u.id = p.user_id
      left join public.rota_publico_creditos c on c.user_id = p.user_id
      where p.txid = v_txid;
      return jsonb_build_object(
        'ok', false,
        'erro', 'ja_usado',
        'ja_creditado', true,
        'quando', v_quando,
        'pacote_id', v_pacote_id,
        'email', v_email,
        'creditos', coalesce(v_saldo, 0),
        'txid', v_txid
      );
  end;

  update public.rota_publico_creditos
  set saldo = saldo + v_creditos, updated_at = now()
  where user_id = v_uid
  returning saldo into v_saldo;

  return jsonb_build_object('ok', true, 'creditos', coalesce(v_saldo, 0));
end;
$$;

create or replace function public.rota_publico_consultar_pix(p_txid text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txid text := upper(regexp_replace(trim(coalesce(p_txid, '')), '[^A-Za-z0-9]', '', 'g'));
  v_quando timestamptz;
  v_email text;
  v_pacote_id text;
  v_creditos integer;
  v_valor numeric(10,2);
  v_saldo integer;
  v_uid uuid;
begin
  if length(v_txid) < 6 then
    return jsonb_build_object('ok', false, 'erro', 'codigo_curto');
  end if;

  select p.user_id, p.created_at, p.pacote_id, p.creditos, p.valor, u.email, c.saldo
    into v_uid, v_quando, v_pacote_id, v_creditos, v_valor, v_email, v_saldo
  from public.rota_publico_pix p
  left join auth.users u on u.id = p.user_id
  left join public.rota_publico_creditos c on c.user_id = p.user_id
  where p.txid = v_txid;

  if v_uid is null then
    return jsonb_build_object(
      'ok', true,
      'encontrado', false,
      'ja_creditado', false,
      'txid', v_txid
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'encontrado', true,
    'ja_creditado', true,
    'txid', v_txid,
    'email', v_email,
    'pacote_id', v_pacote_id,
    'creditos', v_creditos,
    'valor', v_valor,
    'quando', v_quando,
    'saldo_atual', coalesce(v_saldo, 0)
  );
end;
$$;

grant execute on function public.rota_publico_creditar_pacote(text, text) to authenticated;
grant execute on function public.rota_publico_consultar_pix(text) to anon, authenticated;
