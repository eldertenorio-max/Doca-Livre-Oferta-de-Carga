-- Vincula as 39 placas da planilha Dalonso e copia o endereço da transportadora.
-- Rode no SQL Editor do Supabase (opcional se preferir só reimportar pela UI).

do $$
declare
  tid uuid;
  n int;
begin
  select id into tid
  from transportadores
  where lower(coalesce(nome_fantasia, '') || ' ' || coalesce(razao_social, '')) like '%dalonso%'
  order by created_at nulls last
  limit 1;

  if tid is null then
    raise exception 'Transportadora Dalonso não encontrada (nome_fantasia/razao_social com DALONSO).';
  end if;

  update veiculos v
  set
    transportador_id = tid,
    updated_at = now(),
    disponivel_mapa = true,
    origem_cep = coalesce(nullif(trim(v.origem_cep), ''), nullif(trim(t.origem_cep), ''), nullif(trim(t.cep), '')),
    origem_cidade = coalesce(nullif(trim(v.origem_cidade), ''), nullif(trim(t.origem_cidade), ''), nullif(trim(t.cidade), '')),
    origem_uf = coalesce(nullif(trim(v.origem_uf), ''), nullif(trim(t.origem_uf), ''), nullif(trim(t.uf), ''), 'SP'),
    origem_endereco = coalesce(nullif(trim(v.origem_endereco), ''), nullif(trim(t.origem_endereco), ''), nullif(trim(t.endereco), '')),
    origem_numero = coalesce(nullif(trim(v.origem_numero), ''), nullif(trim(t.origem_numero), ''), nullif(trim(t.numero), '')),
    origem_bairro = coalesce(nullif(trim(v.origem_bairro), ''), nullif(trim(t.origem_bairro), ''), nullif(trim(t.bairro), '')),
    origem_complemento = coalesce(nullif(trim(v.origem_complemento), ''), nullif(trim(t.origem_complemento), ''), nullif(trim(t.complemento), '')),
    origem_lat = coalesce(v.origem_lat, t.origem_lat),
    origem_lng = coalesce(v.origem_lng, t.origem_lng),
    raio_km = coalesce(v.raio_km, t.raio_km, 50)
  from transportadores t
  where t.id = tid
    and upper(regexp_replace(v.placa, '[^A-Za-z0-9]', '', 'g')) in (
      'BYF4B24', 'RGB2H00', 'QMX9C17', 'QUS3C17', 'PXP6711', 'DZI2099',
      'QPA5J25', 'QOO1C07', 'FWM7308', 'GKE8E42', 'FXO0B87', 'QQQ7I23',
      'RFY7D49', 'IUJ7C46', 'GFG0E18', 'RUZ9B63', 'SIM4F38', 'AXX0E81',
      'FPA7D38', 'GBJ8E17', 'DTA3F33', 'EFV2061', 'RNL3B80', 'PPC9E97',
      'FFO4A63', 'FPN0I63', 'PZV6J58', 'DVM6E68', 'EPZ5J25', 'FPZ5A27',
      'GAA8I51', 'QOJ7E89', 'DPM3D01', 'EPI1B79', 'GHE3596', 'SSV2F63',
      'EWS3A58', 'FLF2B76', 'FGL3J26'
    );

  get diagnostics n = row_count;
  raise notice 'Atualizadas % placa(s) para transportadora %', n, tid;
end $$;
