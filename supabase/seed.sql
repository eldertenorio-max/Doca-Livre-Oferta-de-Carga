-- Seed de dados iniciais (execute após schema.sql)
-- IDs fixos para facilitar testes

insert into transportadores (id, razao_social, nome_fantasia, cnpj, cidade, uf, classificacao, pontuacao, situacao, telefone, email)
values
  ('11111111-1111-1111-1111-111111111111', 'Santos Transportes De Cargas Eireli', 'Santos Transportes', '12.345.678/0001-90', 'Santos', 'SP', 'ouro', 85, 'ativo', '(13) 3000-0001', 'contato@santos.com'),
  ('22222222-2222-2222-2222-222222222222', 'Log Nova Era LTDA', 'Log Nova Era', '23.456.789/0001-01', 'Campinas', 'SP', 'prata', 62, 'ativo', '(19) 3000-0002', 'ops@novaeera.com'),
  ('33333333-3333-3333-3333-333333333333', 'SafraLog Transportes SA', 'SafraLog', '34.567.890/0001-12', 'Ribeirão Preto', 'SP', 'bronze', 44, 'ativo', '(16) 3000-0003', 'frete@safralog.com'),
  ('44444444-4444-4444-4444-444444444444', 'TransBrasil Cargas ME', 'TransBrasil', '45.678.901/0001-23', 'Guarulhos', 'SP', 'ouro', 90, 'ativo', '(11) 3000-0004', 'ops@transbrasil.com'),
  ('55555555-5555-5555-5555-555555555555', 'RodoSul Logística LTDA', 'RodoSul', '56.789.012/0001-34', 'Curitiba', 'PR', 'prata', 55, 'ativo', '(41) 3000-0005', 'contato@rodosul.com')
on conflict (id) do nothing;

insert into grupos_transportadores (id, descricao, situacao, observacao)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Transportadores OURO', 'ativo', 'Grupo premium — classificação ouro'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Transportadores Fixos', 'ativo', 'Parceiros fixos da operação'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Transportadores Spot', 'ativo', 'Mercado spot / ocasionais')
on conflict (id) do nothing;

insert into grupo_transportador_membros (grupo_id, transportador_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '55555555-5555-5555-5555-555555555555')
on conflict do nothing;

insert into rotas (id, descricao, origem, destino, classificacao, frete_tabela, km)
values
  ('r1111111-1111-1111-1111-111111111111', 'JOSE BONIFACIO-SP - GUARUJA-SP', 'José Bonifácio - SP', 'Guarujá - SP', 'A', 7357.26, 480),
  ('r2222222-2222-2222-2222-222222222222', 'CAMPINAS-SP - SANTOS-SP', 'Campinas - SP', 'Santos - SP', 'B', 4200.00, 180),
  ('r3333333-3333-3333-3333-333333333333', 'RIBEIRAO PRETO-SP - GUARULHOS-SP', 'Ribeirão Preto - SP', 'Guarulhos - SP', 'C', 5100.50, 320),
  ('r4444444-4444-4444-4444-444444444444', 'CURITIBA-PR - SAO PAULO-SP', 'Curitiba - PR', 'São Paulo - SP', 'B', 6800.00, 408)
on conflict (id) do nothing;

insert into cargas (
  id, numero, pedido, ordem, tipo_carga, veiculo,
  remetente, remetente_cnpj, origem, destino, destinatario, destinatario_cnpj,
  peso, volumes, num_entregas, pallets, valor_mercadorias, frete_tabela,
  data_carregamento, previsao_entrega, rota_id, classificacao_rota, status
) values
(
  'c1111111-1111-1111-1111-111111111111',
  '128684', '11167526', 'O/69211-2', 'COMERCIAL - CONG - CTRN', 'CARRETA (CONTAINER 40)',
  'DOCA LIVRE OFERTA DE CARGA', '67.620.377/0001-00', 'José Bonifácio - SP', 'Guarujá - SP',
  'DOCA LIVRE / SANTOS BRASIL', '00.000.000/0001-00',
  19054.74, 699, 1, 0, 392530.44, 7357.26,
  now() + interval '1 day', now() + interval '2 days',
  'r1111111-1111-1111-1111-111111111111', 'A', 'nova_carga'
),
(
  'c2222222-2222-2222-2222-222222222222',
  '128685', '11167527', 'O/69212-1', 'COMERCIAL - SECO', 'CARRETA BAU',
  'DOCA LIVRE OFERTA DE CARGA', '67.620.377/0001-00', 'Campinas - SP', 'Santos - SP',
  'PORTO SANTOS LOG', '11.111.111/0001-11',
  12500.00, 420, 1, 12, 180000.00, 4200.00,
  now() + interval '2 days', now() + interval '3 days',
  'r2222222-2222-2222-2222-222222222222', 'B', 'nova_carga'
),
(
  'c3333333-3333-3333-3333-333333333333',
  '128686', '11167528', 'O/69213-1', 'COMERCIAL - CONG', 'BITREM',
  'DOCA LIVRE OFERTA DE CARGA', '67.620.377/0001-00', 'Ribeirão Preto - SP', 'Guarulhos - SP',
  'CD GUARULHOS', '22.222.222/0001-22',
  28000.00, 900, 2, 0, 510000.00, 5100.50,
  now() + interval '1 day', now() + interval '2 days',
  'r3333333-3333-3333-3333-333333333333', 'C', 'nova_carga'
)
on conflict (id) do nothing;
