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
