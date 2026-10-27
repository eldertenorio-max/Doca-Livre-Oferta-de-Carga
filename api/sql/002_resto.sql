alter table rotas add column if not exists origem_lat double precision;
alter table rotas add column if not exists origem_lng double precision;
alter table rotas add column if not exists destino_lat double precision;
alter table rotas add column if not exists destino_lng double precision;
alter table rotas add column if not exists pontos_passagem jsonb;

create table if not exists profiles (
  id uuid primary key,
  email text,
  nome text,
  usuario text,
  role text,
  transportador_id uuid references transportadores(id),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  avatar_url text
);

create table if not exists grupos_transportadores (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  situacao text not null default 'ativo',
  observacao text,
  created_at timestamptz not null default now()
);

create table if not exists grupo_transportador_membros (
  grupo_id uuid not null references grupos_transportadores(id) on delete cascade,
  transportador_id uuid not null references transportadores(id) on delete cascade,
  primary key (grupo_id, transportador_id)
);

create table if not exists veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text,
  transportador_id uuid references transportadores(id),
  renavam text,
  condutor text,
  tipo text,
  marca text,
  modelo text,
  cor text,
  ano_fabricacao text,
  ano_modelo text,
  uf_licenciamento text,
  foto_url text,
  fotos jsonb,
  tipo_carroceria text,
  qtd_pallets integer,
  aclimatacao text,
  capacidade_kg numeric(12,2),
  cubagem_m3 numeric(12,2),
  eixos integer,
  usa_manobrista boolean not null default false,
  padiado boolean not null default false,
  situacao text not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  avaliacao numeric(8,2),
  total_avaliacoes integer not null default 0,
  frete_minimo numeric(12,2) not null default 0,
  altura_m numeric(8,2),
  largura_m numeric(8,2),
  comprimento_m numeric(8,2),
  disponivel_mapa boolean not null default true,
  gerenciamento_risco text,
  origem_bairro text,
  origem_cep text,
  origem_cidade text,
  origem_complemento text,
  origem_endereco text,
  origem_lat double precision,
  origem_lng double precision,
  origem_numero text,
  origem_uf text,
  raio_km integer,
  rastreador_dados jsonb
);

create table if not exists motoristas (
  id uuid primary key default gen_random_uuid(),
  transportador_id uuid references transportadores(id) on delete cascade,
  veiculo_id uuid references veiculos(id) on delete set null,
  autonomo boolean not null default false,
  nome text,
  cpf text,
  cnh text,
  categoria_cnh text,
  validade_cnh date,
  telefone text,
  situacao text not null default 'ativo',
  created_at timestamptz not null default now()
);

create table if not exists interacoes_pontuacao (
  id uuid primary key default gen_random_uuid(),
  transportador_id uuid references transportadores(id),
  carga_id uuid references cargas(id) on delete cascade,
  tipo text,
  pontos integer,
  created_at timestamptz not null default now()
);

create table if not exists app_store (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text,
  auth text,
  transportador_id text,
  user_id text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mapa_empresas (
  id text primary key,
  slug text,
  categoria text,
  uf text,
  cidade text,
  lat double precision,
  lng double precision,
  origem text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists mapa_usuarios (
  usuario text primary key,
  email text,
  senha text,
  nome text,
  papel text,
  nivel_hierarquia text,
  superior text,
  empresa_id text,
  empresa_slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mapa_feed_posts (
  id uuid primary key default gen_random_uuid(),
  empresa_id text,
  empresa_slug text,
  empresa_nome text,
  autor_usuario text,
  autor_nome text,
  tipo text,
  texto text,
  imagem_url text,
  midias jsonb,
  created_at timestamptz not null default now()
);

create table if not exists mapa_feed_curtidas (
  post_id uuid not null references mapa_feed_posts(id) on delete cascade,
  usuario text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, usuario)
);

create table if not exists mapa_feed_comentarios (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references mapa_feed_posts(id) on delete cascade,
  autor_usuario text,
  autor_nome text,
  texto text,
  resposta_a uuid,
  created_at timestamptz not null default now()
);

create table if not exists mapa_feed_comentario_curtidas (
  comentario_id uuid not null references mapa_feed_comentarios(id) on delete cascade,
  usuario text not null,
  created_at timestamptz not null default now(),
  primary key (comentario_id, usuario)
);

create table if not exists mapa_notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_destino text,
  tipo text,
  post_id uuid,
  de_usuario text,
  de_nome text,
  resumo text,
  lida boolean not null default false,
  created_at timestamptz not null default now()
);

do $$ begin
  create role web nologin;
exception when duplicate_object then null; end $$;

grant usage on schema public to web;
grant all privileges on all tables in schema public to web;
grant all privileges on all sequences in schema public to web;
grant web to ofertacargaadmin;
