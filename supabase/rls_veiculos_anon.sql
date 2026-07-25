-- Escrita de veículos pela chave anon (login do portal não cria sessão Auth).
-- Sem isso o upsert falha e a placa fica só no localStorage do aparelho do Super.
-- Execute no SQL Editor do Supabase.

drop policy if exists "anon select veiculos" on veiculos;
create policy "anon select veiculos"
  on veiculos for select to anon
  using (true);

drop policy if exists "anon insert veiculos" on veiculos;
create policy "anon insert veiculos"
  on veiculos for insert to anon
  with check (true);

drop policy if exists "anon update veiculos" on veiculos;
create policy "anon update veiculos"
  on veiculos for update to anon
  using (true) with check (true);

drop policy if exists "anon delete veiculos" on veiculos;
create policy "anon delete veiculos"
  on veiculos for delete to anon
  using (true);

-- Garante coluna usada pelo mapa
alter table veiculos
  add column if not exists disponivel_mapa boolean not null default true;

-- Marca de edição: define quem vence no merge entre aparelhos
alter table veiculos
  add column if not exists updated_at timestamptz not null default now();

-- Motorista autônomo: placa sem transportadora
alter table veiculos
  alter column transportador_id drop not null;

-- Fotos do veículo em Storage (base64 não trafega no sync)
insert into storage.buckets (id, name, public)
values ('veiculos-fotos', 'veiculos-fotos', true)
on conflict (id) do update set public = true;

drop policy if exists "anon read veiculos fotos" on storage.objects;
create policy "anon read veiculos fotos"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'veiculos-fotos');

drop policy if exists "anon write veiculos fotos" on storage.objects;
create policy "anon write veiculos fotos"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'veiculos-fotos');

drop policy if exists "anon update veiculos fotos" on storage.objects;
create policy "anon update veiculos fotos"
  on storage.objects for update to anon, authenticated
  using (bucket_id = 'veiculos-fotos')
  with check (bucket_id = 'veiculos-fotos');

drop policy if exists "anon delete veiculos fotos" on storage.objects;
create policy "anon delete veiculos fotos"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'veiculos-fotos');
