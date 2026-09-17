-- Cadastro e-mail/senha da calculadora pública.
-- Não cria perfil/login no sistema Oferta de Carga.
-- Rode no SQL Editor depois de rota_publico_creditos.sql (e presentes, se já usou).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(new.raw_app_meta_data->>'provider', '') = 'google'
     or coalesce(new.raw_app_meta_data->'providers', '[]'::jsonb) ? 'google'
     or coalesce(new.raw_user_meta_data->>'origem', '') = 'rota_publico' then
    insert into public.rota_publico_creditos (user_id, saldo)
    values (new.id, 0)
    on conflict (user_id) do nothing;
    if to_regprocedure('public.rota_publico_aplicar_presentes_user(uuid)') is not null then
      perform public.rota_publico_aplicar_presentes_user(new.id);
    end if;
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
