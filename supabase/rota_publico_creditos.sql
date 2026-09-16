-- Créditos da calculadora pública (ofertadecarga.com.br).
-- Login Google (Supabase Auth) — não mistura com o portal do sistema.
-- Execute no SQL Editor depois de ligar o provider Google em Authentication → Providers.
-- Redirect URLs: https://ofertadecarga.com.br/  e  http://localhost:5173/

create table if not exists public.rota_publico_creditos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  saldo integer not null default 0 check (saldo >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.rota_publico_pix (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  txid text not null,
  pacote_id text not null,
  creditos integer not null check (creditos > 0),
  valor numeric(10,2) not null,
  created_at timestamptz not null default now(),
  unique (txid)
);

create index if not exists idx_rota_publico_pix_user
  on public.rota_publico_pix (user_id, created_at desc);

alter table public.rota_publico_creditos enable row level security;
alter table public.rota_publico_pix enable row level security;

drop policy if exists "rota creditos select own" on public.rota_publico_creditos;
create policy "rota creditos select own"
  on public.rota_publico_creditos for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "rota pix select own" on public.rota_publico_pix;
create policy "rota pix select own"
  on public.rota_publico_pix for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.rota_publico_meus_creditos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_saldo integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_autenticado', 'creditos', 0);
  end if;
  insert into public.rota_publico_creditos (user_id, saldo)
  values (v_uid, 0)
  on conflict (user_id) do nothing;
  select saldo into v_saldo
  from public.rota_publico_creditos
  where user_id = v_uid;
  return jsonb_build_object('ok', true, 'creditos', coalesce(v_saldo, 0));
end;
$$;

create or replace function public.rota_publico_consumir_credito()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_saldo integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_autenticado', 'creditos', 0);
  end if;
  insert into public.rota_publico_creditos (user_id, saldo)
  values (v_uid, 0)
  on conflict (user_id) do nothing;

  update public.rota_publico_creditos
  set saldo = saldo - 1, updated_at = now()
  where user_id = v_uid and saldo >= 1
  returning saldo into v_saldo;

  if not found then
    select saldo into v_saldo from public.rota_publico_creditos where user_id = v_uid;
    return jsonb_build_object('ok', false, 'creditos', coalesce(v_saldo, 0));
  end if;
  return jsonb_build_object('ok', true, 'creditos', v_saldo);
end;
$$;

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

create or replace function public.rota_publico_migrar_local(p_saldo integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_add integer := greatest(0, least(coalesce(p_saldo, 0), 200));
  v_saldo integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_autenticado', 'creditos', 0);
  end if;
  insert into public.rota_publico_creditos (user_id, saldo)
  values (v_uid, 0)
  on conflict (user_id) do nothing;
  if v_add > 0 then
    update public.rota_publico_creditos
    set saldo = saldo + v_add, updated_at = now()
    where user_id = v_uid
    returning saldo into v_saldo;
  else
    select saldo into v_saldo from public.rota_publico_creditos where user_id = v_uid;
  end if;
  return jsonb_build_object('ok', true, 'creditos', coalesce(v_saldo, 0));
end;
$$;

grant execute on function public.rota_publico_meus_creditos() to authenticated;
grant execute on function public.rota_publico_consumir_credito() to authenticated;
grant execute on function public.rota_publico_creditar_pacote(text, text) to authenticated;
grant execute on function public.rota_publico_migrar_local(integer) to authenticated;

-- Google da calculadora NÃO cria transportador no sistema.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(new.raw_app_meta_data->>'provider', '') = 'google'
     or coalesce(new.raw_app_meta_data->'providers', '[]'::jsonb) ? 'google' then
    insert into public.rota_publico_creditos (user_id, saldo)
    values (new.id, 0)
    on conflict (user_id) do nothing;
    return new;
  end if;
  insert into public.profiles (id, email, nome, usuario, role, ativo)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'usuario',
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'transportador'),
    case
      when coalesce(new.raw_user_meta_data->>'role', 'transportador') = 'transportador'
        then false
      else true
    end
  )
  on conflict (id) do update set
    email = excluded.email,
    nome = coalesce(excluded.nome, profiles.nome),
    usuario = coalesce(excluded.usuario, profiles.usuario);
  return new;
end;
$$;
