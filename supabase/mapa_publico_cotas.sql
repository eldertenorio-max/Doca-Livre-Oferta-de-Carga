-- Cota das 2 buscas grátis do mapa público.
-- Contada no servidor (IP + visitante + aparelho), como Qualp / Rotas Brasil.
-- Assim vale em aba nova, janela anônima e outro navegador na mesma rede.
-- Execute no SQL Editor do projeto imnlbbfgaztfhwndfxwb.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.mapa_publico_cotas (
  chave text primary key,
  n integer not null default 0,
  inicio timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mapa_publico_cotas enable row level security;

drop policy if exists "anon select mapa_publico_cotas" on public.mapa_publico_cotas;
drop policy if exists "anon all mapa_publico_cotas" on public.mapa_publico_cotas;

create index if not exists mapa_publico_cotas_updated_idx
  on public.mapa_publico_cotas (updated_at);

create or replace function public.mapa_publico_cota_aplicar(
  p_chaves text[],
  p_consumir boolean,
  p_limite integer default 2
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer := 0;
  v_n integer;
  v_inicio timestamptz;
  v_inicio_keep timestamptz := now();
  v_chave text;
  v_agora timestamptz := now();
  v_achou boolean := false;
begin
  if p_chaves is null or array_length(p_chaves, 1) is null then
    return jsonb_build_object('ok', false, 'usadas', 0, 'restam', p_limite, 'esgotado', false);
  end if;

  foreach v_chave in array p_chaves loop
    if v_chave is null or length(v_chave) < 4 or length(v_chave) > 120 then
      continue;
    end if;
    select c.n, c.inicio into v_n, v_inicio
    from public.mapa_publico_cotas c
    where c.chave = v_chave;
    if found then
      if v_agora - v_inicio >= interval '24 hours' then
        v_n := 0;
        v_inicio := v_agora;
      else
        v_achou := true;
        if v_inicio < v_inicio_keep then
          v_inicio_keep := v_inicio;
        end if;
      end if;
      if v_n > v_max then
        v_max := v_n;
      end if;
    end if;
  end loop;

  if not v_achou then
    v_inicio_keep := v_agora;
  end if;

  if p_consumir then
    if v_max >= p_limite then
      return jsonb_build_object(
        'ok', false,
        'usadas', p_limite,
        'restam', 0,
        'esgotado', true
      );
    end if;
    v_max := v_max + 1;
    foreach v_chave in array p_chaves loop
      if v_chave is null or length(v_chave) < 4 or length(v_chave) > 120 then
        continue;
      end if;
      insert into public.mapa_publico_cotas (chave, n, inicio, updated_at)
      values (v_chave, v_max, v_inicio_keep, v_agora)
      on conflict (chave) do update set
        n = excluded.n,
        inicio = excluded.inicio,
        updated_at = excluded.updated_at;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'usadas', least(v_max, p_limite),
    'restam', greatest(0, p_limite - v_max),
    'esgotado', v_max >= p_limite
  );
end;
$$;

revoke all on function public.mapa_publico_cota_aplicar(text[], boolean, integer) from public;
revoke all on function public.mapa_publico_cota_aplicar(text[], boolean, integer) from anon, authenticated;
grant execute on function public.mapa_publico_cota_aplicar(text[], boolean, integer) to service_role;

create or replace function public.mapa_publico_cota_cliente(
  p_visitor text,
  p_device text,
  p_consumir boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_ip text := '';
  v_chaves text[] := '{}';
  v_visitor text := coalesce(nullif(btrim(p_visitor), ''), '');
  v_device text := coalesce(nullif(btrim(p_device), ''), '');
begin
  begin
    v_headers := current_setting('request.headers', true)::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_ip := btrim(coalesce(
    v_headers->>'cf-connecting-ip',
    split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1),
    v_headers->>'x-real-ip',
    v_headers->>'x-client-ip',
    ''
  ));

  if v_ip <> '' then
    v_chaves := array_append(
      v_chaves,
      'ip:' || substr(encode(extensions.digest('doca-mapa-cota:' || v_ip, 'sha256'), 'hex'), 1, 40)
    );
  end if;
  if v_visitor ~ '^[a-zA-Z0-9:_-]{8,80}$' then
    v_chaves := array_append(v_chaves, 'vid:' || v_visitor);
  end if;
  if v_device ~ '^[a-zA-Z0-9:_-]{8,80}$' then
    v_chaves := array_append(v_chaves, 'dev:' || v_device);
  end if;

  if array_length(v_chaves, 1) is null then
    return jsonb_build_object('ok', true, 'usadas', 0, 'restam', 2, 'esgotado', false);
  end if;

  return public.mapa_publico_cota_aplicar(v_chaves, p_consumir, 2);
end;
$$;

revoke all on function public.mapa_publico_cota_cliente(text, text, boolean) from public;
grant execute on function public.mapa_publico_cota_cliente(text, text, boolean) to anon, authenticated;
