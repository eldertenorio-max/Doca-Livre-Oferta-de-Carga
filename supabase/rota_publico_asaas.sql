-- PIX automático via Asaas (créditos da calculadora + plano).
-- 1) Rode este SQL no Editor.
-- 2) Secrets da Edge Function asaas-pix:
--    ASAAS_API_KEY          (Integrações → API Key no Asaas)
--    ASAAS_WEBHOOK_TOKEN    (mesmo valor do authToken do webhook no Asaas)
--    RESEND_API_KEY / RESEND_FROM  (já usados no portal-otp)
-- 3) Deploy: supabase functions deploy asaas-pix --project-ref imnlbbfgaztfhwndfxwb
-- 4) Webhook no Asaas (Integrações → Webhooks):
--    URL: https://imnlbbfgaztfhwndfxwb.supabase.co/functions/v1/asaas-pix?apikey=SUA_ANON_KEY
--    Eventos: PAYMENT_RECEIVED, PAYMENT_CONFIRMED
--    authToken: o mesmo ASAAS_WEBHOOK_TOKEN
--    Header enviado pelo Asaas: asaas-access-token

create table if not exists public.rota_publico_cobrancas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  asaas_payment_id text not null unique,
  asaas_customer_id text,
  tipo text not null check (tipo in ('credito', 'plano')),
  pacote_id text not null,
  creditos integer not null default 0,
  valor numeric(10,2) not null,
  status text not null default 'pendente',
  email text,
  email_enviado_em timestamptz,
  email_erro text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_rota_publico_cobrancas_user
  on public.rota_publico_cobrancas (user_id, created_at desc);

create index if not exists idx_rota_publico_cobrancas_email
  on public.rota_publico_cobrancas (email, created_at desc);

alter table public.rota_publico_cobrancas enable row level security;

drop policy if exists "rota cobrancas select own" on public.rota_publico_cobrancas;
create policy "rota cobrancas select own"
  on public.rota_publico_cobrancas for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.rota_publico_creditar_asaas(
  p_user uuid,
  p_txid text,
  p_pacote text,
  p_creditos integer,
  p_valor numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo integer;
begin
  if p_user is null or coalesce(p_txid, '') = '' or coalesce(p_creditos, 0) <= 0 then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;

  insert into public.rota_publico_creditos (user_id, saldo)
  values (p_user, 0)
  on conflict (user_id) do nothing;

  begin
    insert into public.rota_publico_pix (user_id, txid, pacote_id, creditos, valor)
    values (p_user, p_txid, trim(coalesce(p_pacote, '')), p_creditos, coalesce(p_valor, 0));
  exception
    when unique_violation then
      select saldo into v_saldo from public.rota_publico_creditos where user_id = p_user;
      return jsonb_build_object('ok', true, 'ja_creditado', true, 'creditos', coalesce(v_saldo, 0));
  end;

  update public.rota_publico_creditos
  set saldo = saldo + p_creditos, updated_at = now()
  where user_id = p_user
  returning saldo into v_saldo;

  return jsonb_build_object('ok', true, 'ja_creditado', false, 'creditos', coalesce(v_saldo, 0));
end;
$$;

revoke all on function public.rota_publico_creditar_asaas(uuid, text, text, integer, numeric) from public, anon, authenticated;
grant execute on function public.rota_publico_creditar_asaas(uuid, text, text, integer, numeric) to service_role;

create or replace function public.rota_publico_consultar_pix(p_txid text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txid text := regexp_replace(trim(coalesce(p_txid, '')), '[^A-Za-z0-9_]', '', 'g');
  v_quando timestamptz;
  v_email text;
  v_pacote_id text;
  v_creditos integer;
  v_valor numeric(10,2);
  v_saldo integer;
  v_uid uuid;
  v_status text;
begin
  if length(v_txid) < 6 then
    return jsonb_build_object('ok', false, 'erro', 'codigo_curto');
  end if;

  select p.user_id, p.created_at, p.pacote_id, p.creditos, p.valor, u.email, c.saldo
    into v_uid, v_quando, v_pacote_id, v_creditos, v_valor, v_email, v_saldo
  from public.rota_publico_pix p
  left join auth.users u on u.id = p.user_id
  left join public.rota_publico_creditos c on c.user_id = p.user_id
  where p.txid = v_txid or upper(p.txid) = upper(v_txid);

  if v_uid is not null then
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
      'saldo_atual', coalesce(v_saldo, 0),
      'status', 'pago'
    );
  end if;

  select b.user_id, coalesce(b.paid_at, b.created_at), b.pacote_id, b.creditos, b.valor, b.email, b.status, c.saldo
    into v_uid, v_quando, v_pacote_id, v_creditos, v_valor, v_email, v_status, v_saldo
  from public.rota_publico_cobrancas b
  left join public.rota_publico_creditos c on c.user_id = b.user_id
  where b.asaas_payment_id = v_txid or upper(b.asaas_payment_id) = upper(v_txid);

  if found then
    return jsonb_build_object(
      'ok', true,
      'encontrado', v_status in ('pago', 'pendente'),
      'ja_creditado', v_status = 'pago' and coalesce(v_creditos, 0) > 0,
      'txid', v_txid,
      'email', v_email,
      'pacote_id', v_pacote_id,
      'creditos', v_creditos,
      'valor', v_valor,
      'quando', v_quando,
      'saldo_atual', coalesce(v_saldo, 0),
      'status', v_status
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'encontrado', false,
    'ja_creditado', false,
    'txid', v_txid
  );
end;
$$;

grant execute on function public.rota_publico_consultar_pix(text) to anon, authenticated;
