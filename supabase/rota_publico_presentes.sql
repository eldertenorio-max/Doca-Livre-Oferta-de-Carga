-- Presente de créditos da calculadora pública (só Super, só por e-mail).
-- 1) Rode este SQL no Editor.
-- 2) Deploy: supabase functions deploy rota-presente --project-ref imnlbbfgaztfhwndfxwb
-- Secrets já usados no asaas-pix: RESEND_API_KEY / RESEND_FROM

create table if not exists public.rota_publico_presentes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  creditos integer not null check (creditos > 0 and creditos <= 500),
  criado_em timestamptz not null default now(),
  criado_por text not null,
  aplicado_em timestamptz,
  user_id uuid references auth.users(id) on delete set null,
  visto_em timestamptz,
  email_enviado_em timestamptz,
  email_erro text
);

create index if not exists idx_rota_publico_presentes_email
  on public.rota_publico_presentes (email, criado_em desc);

create index if not exists idx_rota_publico_presentes_pendente
  on public.rota_publico_presentes (email)
  where aplicado_em is null;

create index if not exists idx_rota_publico_presentes_nao_visto
  on public.rota_publico_presentes (user_id)
  where visto_em is null and aplicado_em is not null;

alter table public.rota_publico_presentes enable row level security;

create or replace function public.rota_publico_aplicar_presentes_user(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_add integer := 0;
  r record;
begin
  if p_user is null then
    return 0;
  end if;

  select lower(trim(coalesce(email, ''))) into v_email
  from auth.users
  where id = p_user;

  if coalesce(v_email, '') = '' then
    return 0;
  end if;

  insert into public.rota_publico_creditos (user_id, saldo)
  values (p_user, 0)
  on conflict (user_id) do nothing;

  for r in
    select id, creditos
    from public.rota_publico_presentes
    where email = v_email
      and aplicado_em is null
    order by criado_em
    for update skip locked
  loop
    update public.rota_publico_presentes
      set aplicado_em = now(), user_id = p_user
      where id = r.id
        and aplicado_em is null;
    if found then
      update public.rota_publico_creditos
        set saldo = saldo + r.creditos, updated_at = now()
        where user_id = p_user;
      v_add := v_add + r.creditos;
    end if;
  end loop;

  return v_add;
end;
$$;

create or replace function public.rota_publico_presentear(
  p_email text,
  p_creditos integer,
  p_por text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_por text := lower(trim(coalesce(p_por, '')));
  v_creditos integer := coalesce(p_creditos, 0);
  v_id uuid;
  v_uid uuid;
  v_add integer := 0;
  v_saldo integer := 0;
  v_dia integer := 0;
begin
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'erro', 'email_invalido');
  end if;
  if v_creditos < 1 or v_creditos > 500 then
    return jsonb_build_object('ok', false, 'erro', 'creditos_invalidos');
  end if;
  if v_por = '' then
    v_por := 'super';
  end if;

  select count(*)::integer into v_dia
  from public.rota_publico_presentes
  where lower(criado_por) = v_por
    and criado_em > now() - interval '1 day';
  if coalesce(v_dia, 0) >= 40 then
    return jsonb_build_object('ok', false, 'erro', 'limite_diario');
  end if;

  insert into public.rota_publico_presentes (email, creditos, criado_por)
  values (v_email, v_creditos, v_por)
  returning id into v_id;

  select u.id into v_uid
  from auth.users u
  where lower(trim(coalesce(u.email, ''))) = v_email
  order by u.created_at asc
  limit 1;

  if v_uid is not null then
    v_add := public.rota_publico_aplicar_presentes_user(v_uid);
    select saldo into v_saldo
    from public.rota_publico_creditos
    where user_id = v_uid;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'email', v_email,
    'creditos', v_creditos,
    'aplicado', v_uid is not null and coalesce(v_add, 0) > 0,
    'conta_existe', v_uid is not null,
    'saldo', coalesce(v_saldo, 0)
  );
end;
$$;

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
    return jsonb_build_object('ok', false, 'erro', 'nao_autenticado', 'creditos', 0, 'presente', 0);
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
    'presente_ids', to_jsonb(coalesce(v_ids, '{}'::uuid[]))
  );
end;
$$;

create or replace function public.rota_publico_marcar_presente_visto(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_autenticado');
  end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    update public.rota_publico_presentes
      set visto_em = now()
    where user_id = v_uid
      and aplicado_em is not null
      and visto_em is null;
  else
    update public.rota_publico_presentes
      set visto_em = now()
    where user_id = v_uid
      and aplicado_em is not null
      and visto_em is null
      and id = any(p_ids);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

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
    perform public.rota_publico_aplicar_presentes_user(new.id);
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

revoke all on function public.rota_publico_aplicar_presentes_user(uuid) from public, anon, authenticated;
revoke all on function public.rota_publico_presentear(text, integer, text) from public, anon, authenticated;
grant execute on function public.rota_publico_presentear(text, integer, text) to service_role;
grant execute on function public.rota_publico_meus_creditos() to authenticated;
grant execute on function public.rota_publico_marcar_presente_visto(uuid[]) to authenticated;
