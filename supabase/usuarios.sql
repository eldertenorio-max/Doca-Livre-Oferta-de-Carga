-- Tabela de usuários do portal (Oferta de Carga).
-- Rodar no SQL Editor do Supabase do projeto Oferta de Carga.
-- Observação: autenticação Auth continua em auth.users; profiles espelha o auth.
-- Esta tabela guarda as contas de portal (usuário/senha local + vínculo operacional).

create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  usuario text not null,
  email text not null,
  -- Hash/senha apenas para migração do modo local; preferir Auth do Supabase em produção
  senha_hash text,
  nome text not null,
  role text not null default 'minerva'
    check (role in ('minerva', 'transportador', 'super')),
  nivel text default 'operador'
    check (nivel is null or nivel in ('super', 'gestor', 'operador')),
  perfil_operacional text
    check (
      perfil_operacional is null
      or perfil_operacional in ('administrador', 'operador', 'consulta')
    ),
  transportador_id uuid references public.transportadores(id) on delete set null,
  empresa_org_id text,
  ativo boolean not null default true,
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_usuarios_usuario_lower
  on public.usuarios (lower(usuario));

create unique index if not exists idx_usuarios_email_lower
  on public.usuarios (lower(email));

create index if not exists idx_usuarios_transportador
  on public.usuarios (transportador_id);

create index if not exists idx_usuarios_role
  on public.usuarios (role);

alter table public.usuarios enable row level security;

drop policy if exists "auth read usuarios" on public.usuarios;
drop policy if exists "auth write usuarios" on public.usuarios;

-- Leitura autenticada (ajuste depois se quiser restringir a super)
create policy "auth read usuarios"
  on public.usuarios
  for select
  to authenticated
  using (true);

-- Escrita autenticada (Portal / Super)
create policy "auth write usuarios"
  on public.usuarios
  for all
  to authenticated
  using (true)
  with check (true);

-- Contas demo iniciais (só insere se o usuário ainda não existir)
insert into public.usuarios (usuario, email, nome, role, nivel, perfil_operacional, ativo)
select v.usuario, v.email, v.nome, v.role, v.nivel, v.perfil_operacional, v.ativo
from (
  values
    ('diego', 'diego@docalivre.com', 'Diego', 'super', 'super', 'administrador', true),
    ('elder', 'elder@docalivre.com', 'Elder', 'super', 'super', 'administrador', true),
    ('minerva', 'minerva@docalivre.com', 'Minerva Operações', 'minerva', 'operador', 'operador', true),
    ('santos', 'santos@transportes.com', 'Santos Transportes', 'transportador', 'operador', null::text, true)
) as v(usuario, email, nome, role, nivel, perfil_operacional, ativo)
where not exists (
  select 1 from public.usuarios u where lower(u.usuario) = lower(v.usuario)
);
