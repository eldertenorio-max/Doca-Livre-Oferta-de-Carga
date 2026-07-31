-- Limpa duplicatas em public.rotas (mesma origem+destino).
-- Mantém o id seed (a111…–a444…) quando existir; senão o mais antigo.
-- Rode no SQL Editor do Supabase.

with ranked as (
  select
    id,
    row_number() over (
      partition by
        lower(trim(origem)),
        lower(trim(destino))
      order by
        case
          when id in (
            'a1111111-1111-1111-1111-111111111111',
            'a2222222-2222-2222-2222-222222222222',
            'a3333333-3333-3333-3333-333333333333',
            'a4444444-4444-4444-4444-444444444444'
          ) then 0
          else 1
        end,
        created_at asc nulls last
    ) as rn
  from public.rotas
)
delete from public.rotas r
using ranked x
where r.id = x.id
  and x.rn > 1;
