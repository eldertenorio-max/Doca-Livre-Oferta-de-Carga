import type { Transportador, Veiculo } from '../types'
import { chaveCoordFrota } from './mapaFrota'

/** 50 municípios BR com coordenadas distintas para espalhar a frota no mapa. */
const ENDERECOS_DISTRIBUICAO: Array<{
  cidade: string
  uf: string
  lat: number
  lng: number
  endereco: string
  bairro: string
  numero: string
  cep: string
}> = [
  { cidade: 'São Paulo', uf: 'SP', lat: -23.5505, lng: -46.6333, endereco: 'Av. Paulista', bairro: 'Bela Vista', numero: '1000', cep: '01310-100' },
  { cidade: 'Campinas', uf: 'SP', lat: -22.9099, lng: -47.0626, endereco: 'Av. Norte-Sul', bairro: 'Centro', numero: '500', cep: '13010-100' },
  { cidade: 'Santos', uf: 'SP', lat: -23.9608, lng: -46.3336, endereco: 'Av. Ana Costa', bairro: 'Gonzaga', numero: '220', cep: '11060-001' },
  { cidade: 'Guarulhos', uf: 'SP', lat: -23.4538, lng: -46.5333, endereco: 'Av. Monteiro Lobato', bairro: 'Cumbica', numero: '3400', cep: '07180-000' },
  { cidade: 'Ribeirão Preto', uf: 'SP', lat: -21.1775, lng: -47.8103, endereco: 'Av. Presidente Vargas', bairro: 'Jardim Sumaré', numero: '1500', cep: '14025-000' },
  { cidade: 'Sorocaba', uf: 'SP', lat: -23.5015, lng: -47.4526, endereco: 'Av. Ipanema', bairro: 'Éden', numero: '800', cep: '18087-000' },
  { cidade: 'São José dos Campos', uf: 'SP', lat: -23.1896, lng: -45.8841, endereco: 'Av. São João', bairro: 'Jardim das Indústrias', numero: '1200', cep: '12240-000' },
  { cidade: 'Jundiaí', uf: 'SP', lat: -23.1857, lng: -46.8978, endereco: 'Av. Jundiaí', bairro: 'Anhangabaú', numero: '450', cep: '13208-050' },
  { cidade: 'Piracicaba', uf: 'SP', lat: -22.7253, lng: -47.6493, endereco: 'Av. Independência', bairro: 'Centro', numero: '900', cep: '13400-340' },
  { cidade: 'Bauru', uf: 'SP', lat: -22.3145, lng: -49.0587, endereco: 'Av. Nações Unidas', bairro: 'Vila Contorno', numero: '1100', cep: '17013-000' },
  { cidade: 'Marília', uf: 'SP', lat: -22.2139, lng: -49.9457, endereco: 'Av. Sampaio Vidal', bairro: 'Centro', numero: '620', cep: '17500-000' },
  { cidade: 'Presidente Prudente', uf: 'SP', lat: -22.1256, lng: -51.3883, endereco: 'Av. Washington Luiz', bairro: 'Vila Nova', numero: '700', cep: '19010-090' },
  { cidade: 'São José do Rio Preto', uf: 'SP', lat: -20.8197, lng: -49.3794, endereco: 'Av. Alberto Andaló', bairro: 'Centro', numero: '3100', cep: '15015-000' },
  { cidade: 'Limeira', uf: 'SP', lat: -22.5647, lng: -47.4017, endereco: 'Av. Campinas', bairro: 'Vila Queiroz', numero: '480', cep: '13480-000' },
  { cidade: 'Americana', uf: 'SP', lat: -22.7383, lng: -47.3314, endereco: 'Av. Brasil', bairro: 'Jardim Girassol', numero: '1500', cep: '13465-000' },
  { cidade: 'Taubaté', uf: 'SP', lat: -23.0264, lng: -45.5553, endereco: 'Av. Charles Schnneider', bairro: 'Barranco', numero: '2000', cep: '12040-000' },
  { cidade: 'Mogi das Cruzes', uf: 'SP', lat: -23.5225, lng: -46.1878, endereco: 'Av. Vereador Narciso Yague Guimarães', bairro: 'Centro Cívico', numero: '1001', cep: '08780-000' },
  { cidade: 'Osasco', uf: 'SP', lat: -23.5325, lng: -46.7917, endereco: 'Av. dos Autonomistas', bairro: 'Vila Yara', numero: '1400', cep: '06020-010' },
  { cidade: 'Santo André', uf: 'SP', lat: -23.6639, lng: -46.5383, endereco: 'Av. Industrial', bairro: 'Jardim', numero: '600', cep: '09080-500' },
  { cidade: 'São Bernardo do Campo', uf: 'SP', lat: -23.6914, lng: -46.5646, endereco: 'Av. Kennedy', bairro: 'Assunção', numero: '1500', cep: '09850-000' },
  { cidade: 'Rio de Janeiro', uf: 'RJ', lat: -22.9068, lng: -43.1729, endereco: 'Av. Brasil', bairro: 'Penha', numero: '20000', cep: '21040-360' },
  { cidade: 'Niterói', uf: 'RJ', lat: -22.8832, lng: -43.1034, endereco: 'Av. Visconde do Rio Branco', bairro: 'Centro', numero: '500', cep: '24020-001' },
  { cidade: 'Duque de Caxias', uf: 'RJ', lat: -22.7858, lng: -43.3055, endereco: 'Rod. Washington Luiz', bairro: 'Saracuruna', numero: 'km 109', cep: '25220-000' },
  { cidade: 'Volta Redonda', uf: 'RJ', lat: -22.5202, lng: -44.0996, endereco: 'Av. Lucas Evangelista', bairro: 'Aterrado', numero: '800', cep: '27213-000' },
  { cidade: 'Campos dos Goytacazes', uf: 'RJ', lat: -21.7622, lng: -41.3181, endereco: 'Av. 28 de Março', bairro: 'Centro', numero: '120', cep: '28020-000' },
  { cidade: 'Belo Horizonte', uf: 'MG', lat: -19.9167, lng: -43.9345, endereco: 'Av. do Contorno', bairro: 'Funcionários', numero: '6000', cep: '30110-060' },
  { cidade: 'Uberlândia', uf: 'MG', lat: -18.9128, lng: -48.2755, endereco: 'Av. João Naves de Ávila', bairro: 'Santa Mônica', numero: '1300', cep: '38408-100' },
  { cidade: 'Contagem', uf: 'MG', lat: -19.9386, lng: -44.0539, endereco: 'Av. João César de Oliveira', bairro: 'Eldorado', numero: '3100', cep: '32310-000' },
  { cidade: 'Juiz de Fora', uf: 'MG', lat: -21.7642, lng: -43.3503, endereco: 'Av. Barão do Rio Branco', bairro: 'Centro', numero: '2500', cep: '36010-011' },
  { cidade: 'Montes Claros', uf: 'MG', lat: -16.735, lng: -43.8617, endereco: 'Av. Mestra Fininha', bairro: 'Major Prates', numero: '900', cep: '39403-000' },
  { cidade: 'Curitiba', uf: 'PR', lat: -25.4284, lng: -49.2733, endereco: 'Av. Sete de Setembro', bairro: 'Centro', numero: '2200', cep: '80230-010' },
  { cidade: 'Londrina', uf: 'PR', lat: -23.3045, lng: -51.1696, endereco: 'Av. Ayrton Senna', bairro: 'Gleba Fazenda Palhano', numero: '500', cep: '86050-460' },
  { cidade: 'Maringá', uf: 'PR', lat: -23.4273, lng: -51.9375, endereco: 'Av. Colombo', bairro: 'Zona 7', numero: '5790', cep: '87020-900' },
  { cidade: 'Ponta Grossa', uf: 'PR', lat: -25.0916, lng: -50.1668, endereco: 'Av. Vicente Machado', bairro: 'Centro', numero: '1000', cep: '84010-000' },
  { cidade: 'Cascavel', uf: 'PR', lat: -24.9578, lng: -53.4595, endereco: 'Av. Brasil', bairro: 'Centro', numero: '4800', cep: '85812-001' },
  { cidade: 'Joinville', uf: 'SC', lat: -26.3045, lng: -48.8487, endereco: 'Av. Getúlio Vargas', bairro: 'Anita Garibaldi', numero: '300', cep: '89202-000' },
  { cidade: 'Florianópolis', uf: 'SC', lat: -27.5954, lng: -48.548, endereco: 'Av. Beira Mar Norte', bairro: 'Centro', numero: '1500', cep: '88015-700' },
  { cidade: 'Blumenau', uf: 'SC', lat: -26.9194, lng: -49.0661, endereco: 'Rua XV de Novembro', bairro: 'Centro', numero: '800', cep: '89010-000' },
  { cidade: 'Itajaí', uf: 'SC', lat: -26.9101, lng: -48.6705, endereco: 'Av. Coronel Marcos Konder', bairro: 'Centro', numero: '1000', cep: '88301-000' },
  { cidade: 'Criciúma', uf: 'SC', lat: -28.6775, lng: -49.3697, endereco: 'Av. Centenário', bairro: 'Centro', numero: '2500', cep: '88801-000' },
  { cidade: 'Porto Alegre', uf: 'RS', lat: -30.0346, lng: -51.2177, endereco: 'Av. Ipiranga', bairro: 'Partenon', numero: '6700', cep: '90610-000' },
  { cidade: 'Caxias do Sul', uf: 'RS', lat: -29.1634, lng: -51.1797, endereco: 'Av. Júlio de Castilhos', bairro: 'Centro', numero: '1500', cep: '95010-000' },
  { cidade: 'Pelotas', uf: 'RS', lat: -31.7654, lng: -52.3376, endereco: 'Av. Bento Gonçalves', bairro: 'Centro', numero: '3000', cep: '96015-140' },
  { cidade: 'Passo Fundo', uf: 'RS', lat: -28.2628, lng: -52.4067, endereco: 'Av. Brasil Leste', bairro: 'Centro', numero: '200', cep: '99010-000' },
  { cidade: 'Goiânia', uf: 'GO', lat: -16.6869, lng: -49.2648, endereco: 'Av. Goiás', bairro: 'Setor Central', numero: '1000', cep: '74010-010' },
  { cidade: 'Anápolis', uf: 'GO', lat: -16.3281, lng: -48.953, endereco: 'Av. Universitária', bairro: 'Jundiaí', numero: '500', cep: '75110-570' },
  { cidade: 'Brasília', uf: 'DF', lat: -15.7939, lng: -47.8828, endereco: 'SCIA Trecho 1', bairro: 'SIA', numero: 'lote 10', cep: '71200-020' },
  { cidade: 'Campo Grande', uf: 'MS', lat: -20.4697, lng: -54.6201, endereco: 'Av. Afonso Pena', bairro: 'Centro', numero: '2000', cep: '79002-070' },
  { cidade: 'Cuiabá', uf: 'MT', lat: -15.601, lng: -56.0974, endereco: 'Av. Historiador Rubens de Mendonça', bairro: 'Bosque da Saúde', numero: '3300', cep: '78050-000' },
  { cidade: 'Vitória', uf: 'ES', lat: -20.3155, lng: -40.3128, endereco: 'Av. Nossa Senhora da Penha', bairro: 'Santa Lúcia', numero: '1500', cep: '29056-250' },
]

function slugEmpresa(valor: string): string {
  return (valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

export function isUltrafrioTransportador(t: Transportador): boolean {
  const blob = slugEmpresa(
    `${t.nome_fantasia || ''} ${t.razao_social || ''} ${t.email || ''}`,
  )
  return blob.includes('ultrafrio')
}

/** Título no mapa/card: "Ultrafrio · ABC1D23" */
export function tituloExibicaoUltrafrio(placa: string): string {
  const pl = (placa || '').trim().toUpperCase()
  return pl ? `Ultrafrio · ${pl}` : 'Ultrafrio'
}

function mesmaCoord(
  latA: number | null | undefined,
  lngA: number | null | undefined,
  latB: number,
  lngB: number,
): boolean {
  if (latA == null || lngA == null) return false
  if (!Number.isFinite(Number(latA)) || !Number.isFinite(Number(lngA))) return false
  return chaveCoordFrota(Number(latA), Number(lngA)) === chaveCoordFrota(latB, lngB)
}

/**
 * Pega até 50 placas da Ultrafrio Log (ordem alfabética) e atribui
 * um município/endereço diferente a cada uma, para espalhar no Mapa da Frota.
 * Idempotente: só altera placas que ainda não estão no destino esperado.
 */
export function distribuirFrotaUltrafrio(
  veiculos: Veiculo[],
  transportadores: Transportador[],
  limite = 50,
): { veiculos: Veiculo[]; alterados: Veiculo[] } {
  const ultraIds = new Set(
    transportadores.filter(isUltrafrioTransportador).map((t) => t.id),
  )
  if (ultraIds.size === 0) return { veiculos, alterados: [] }

  const frota = veiculos
    .filter(
      (v) =>
        v.transportador_id &&
        ultraIds.has(v.transportador_id) &&
        v.situacao !== 'inativo',
    )
    .slice()
    .sort((a, b) =>
      (a.placa || '').localeCompare(b.placa || '', 'pt-BR', {
        sensitivity: 'base',
      }),
    )

  if (frota.length === 0) return { veiculos, alterados: [] }

  const alvos = frota.slice(0, Math.min(limite, ENDERECOS_DISTRIBUICAO.length))
  const agora = new Date().toISOString()
  const porId = new Map<string, Veiculo>()
  const alterados: Veiculo[] = []

  for (let i = 0; i < alvos.length; i++) {
    const v = alvos[i]
    const dest = ENDERECOS_DISTRIBUICAO[i]
    if (mesmaCoord(v.origem_lat, v.origem_lng, dest.lat, dest.lng)) continue
    const atualizado: Veiculo = {
      ...v,
      origem_cidade: dest.cidade,
      origem_uf: dest.uf,
      origem_endereco: dest.endereco,
      origem_bairro: dest.bairro,
      origem_numero: dest.numero,
      origem_cep: dest.cep,
      origem_complemento: undefined,
      origem_lat: dest.lat,
      origem_lng: dest.lng,
      raio_km: v.raio_km != null && Number(v.raio_km) > 0 ? Number(v.raio_km) : 50,
      disponivel_mapa: v.disponivel_mapa !== false,
      updated_at: agora,
    }
    porId.set(v.id, atualizado)
    alterados.push(atualizado)
  }

  // Condutor/nome exibido: Ultrafrio (todas as placas da empresa)
  for (const v of frota) {
    const base = porId.get(v.id) ?? v
    if ((base.condutor || '').trim() === 'Ultrafrio') continue
    const atualizado: Veiculo = {
      ...base,
      condutor: 'Ultrafrio',
      updated_at: agora,
    }
    porId.set(v.id, atualizado)
    const idx = alterados.findIndex((x) => x.id === v.id)
    if (idx >= 0) alterados[idx] = atualizado
    else alterados.push(atualizado)
  }

  if (alterados.length === 0) return { veiculos, alterados: [] }

  return {
    veiculos: veiculos.map((v) => porId.get(v.id) ?? v),
    alterados,
  }
}
