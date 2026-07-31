import type { Carga, FotosVeiculo, Motorista, Transportador, Veiculo } from '../types'
import { frotaIconeHtml, type FrotaIconeGrupo } from './frotaIcones'
import { normalizeFotosVeiculo } from './veiculoFotos'

function normPlacaFrota(placa?: string | null): string {
  return (placa || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

/** Conta rotas finalizadas por veículo (id) e por placa (quando sem veiculo_id). */
export function indexCorridasPorVeiculo(cargas: Carga[]): {
  byId: Map<string, number>
  byPlaca: Map<string, number>
} {
  const byId = new Map<string, number>()
  const byPlaca = new Map<string, number>()
  for (const c of cargas) {
    if (c.status_viagem !== 'rota_finalizada') continue
    if (c.veiculo_id) {
      byId.set(c.veiculo_id, (byId.get(c.veiculo_id) || 0) + 1)
      continue
    }
    const pl = normPlacaFrota(c.placa)
    if (pl) byPlaca.set(pl, (byPlaca.get(pl) || 0) + 1)
  }
  return { byId, byPlaca }
}

function corridasDoVeiculo(
  index: ReturnType<typeof indexCorridasPorVeiculo>,
  veiculoId: string,
  placa: string,
): number {
  return (index.byId.get(veiculoId) || 0) + (index.byPlaca.get(normPlacaFrota(placa)) || 0)
}

export type { FrotaIconeGrupo }

/** Grupos de ícone no mapa — alinhados aos tipos de cadastro. */

export type PontoFrota = {
  id: string
  motoristaId: string
  motoristaNome: string
  motoristaTelefone?: string
  motoristaCnh?: string
  motoristaCategoriaCnh?: string
  motoristaFoto?: string
  avaliacao: number
  totalAvaliacoes: number
  transportadorId: string
  transportadorNome: string
  veiculoId: string
  placa: string
  tipoVeiculo: string
  veiculoMarca?: string
  veiculoModelo?: string
  freteMinimo: number
  lat: number
  lng: number
  disponivel: boolean
  icone: FrotaIconeGrupo
  emoji: string
  /** Cidade de origem no mapa (fallback: cidade da empresa). */
  cidade: string
  uf: string
  /** Raio de pesquisa cadastrado pelo transportador (km). */
  raioKm: number
  /** Fotos do veículo (galeria no popup). */
  veiculoFotos?: FotosVeiculo
  tipoCarroceria?: string
  comprimento_m?: number
  largura_m?: number
  altura_m?: number
  cubagem_m3?: number
  /** Quantidade de rotas (corridas) finalizadas por esta placa. */
  totalCorridas: number
}

/** Chave estável para agrupar pins na mesma coordenada. */
export function chaveCoordFrota(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`
}

export function agruparPontosPorCoord(pontos: PontoFrota[]): Map<string, PontoFrota[]> {
  const map = new Map<string, PontoFrota[]>()
  for (const p of pontos) {
    const key = chaveCoordFrota(p.lat, p.lng)
    const list = map.get(key)
    if (list) list.push(p)
    else map.set(key, [p])
  }
  return map
}

const EMOJI_POR_GRUPO: Record<FrotaIconeGrupo, string> = {
  van: '🚐',
  fiorino: '🛻',
  utilitario: '🚙',
  passeio: '🚗',
  hr: '🚐',
  vuc: '🚚',
  leve: '🚚',
  toco: '🚛',
  truck: '🚛',
  bitruck: '🚛',
  carreta: '🚛',
  carreta_ls: '🚛',
  vanderleia: '🚛',
  bitrem: '🚛',
  rodotrem: '🚛',
  outros: '🚚',
}

export const LEGENDA_FROTA: { grupo: FrotaIconeGrupo; emoji: string; label: string }[] = [
  { grupo: 'van', label: 'Van / Furgão' },
  { grupo: 'fiorino', label: 'Fiorino' },
  { grupo: 'utilitario', label: 'Utilitário' },
  { grupo: 'passeio', label: 'Carro Passeio' },
  { grupo: 'hr', label: 'HR' },
  { grupo: 'vuc', label: 'VUC' },
  { grupo: 'leve', label: '3/4 Leve' },
  { grupo: 'toco', label: 'Toco' },
  { grupo: 'truck', label: 'Truck' },
  { grupo: 'bitruck', label: 'Bitruck' },
  { grupo: 'carreta', label: 'Carreta' },
  { grupo: 'carreta_ls', label: 'Carreta LS' },
  { grupo: 'vanderleia', label: 'Vanderleia' },
  { grupo: 'bitrem', label: 'Bitrem' },
  { grupo: 'rodotrem', label: 'Rodotrem' },
].map((item) => ({ ...item, emoji: EMOJI_POR_GRUPO[item.grupo] }))

export function classificarIconeVeiculo(tipo: string): { grupo: FrotaIconeGrupo; emoji: string } {
  const t = tipo.toLowerCase()

  let grupo: FrotaIconeGrupo = 'outros'
  if (/fiorino/.test(t)) grupo = 'fiorino'
  else if (/utilit/.test(t)) grupo = 'utilitario'
  else if (/passeio/.test(t)) grupo = 'passeio'
  else if (/\bhr\b/.test(t) || t === 'hr') grupo = 'hr'
  else if (/vuc|\bvlc\b/.test(t)) grupo = 'vuc'
  else if (/van|furg/.test(t)) grupo = 'van'
  else if (/3\/4|caminh[aã]o leve/.test(t)) grupo = 'leve'
  else if (/bitruck/.test(t)) grupo = 'bitruck'
  else if (/\btoco\b/.test(t)) grupo = 'toco'
  else if (/\btruck\b/.test(t)) grupo = 'truck'
  else if (/carreta\s*ls|ls\b/.test(t)) grupo = 'carreta_ls'
  else if (/vanderl[eé]ia/.test(t)) grupo = 'vanderleia'
  else if (/carreta/.test(t)) grupo = 'carreta'
  else if (/rodotrem/.test(t)) grupo = 'rodotrem'
  else if (/bitrem/.test(t)) grupo = 'bitrem'

  return { grupo, emoji: EMOJI_POR_GRUPO[grupo] }
}

export { frotaIconeHtml }

/** Valor curto no pin, estilo “R$ 3.500”. */
export function labelFretePin(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) return '—'
  const inteiro = Math.round(valor)
  return `R$ ${inteiro.toLocaleString('pt-BR')}`
}

export function labelFreteCurto(valor: number): string {
  return labelFretePin(valor)
}

/** Nota 0–5 estável a partir do id, se ainda não houver avaliação salva. */
export function avaliacaoDoMotorista(m: Pick<Motorista, 'id' | 'avaliacao' | 'total_avaliacoes'>): {
  nota: number
  total: number
} {
  if (typeof m.avaliacao === 'number' && Number.isFinite(m.avaliacao)) {
    return {
      nota: Math.min(5, Math.max(0, Math.round(m.avaliacao * 10) / 10)),
      total: Math.max(0, Number(m.total_avaliacoes) || 0),
    }
  }
  let h = 0
  for (const c of m.id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const nota = Math.round((3.5 + (h % 16) / 10) * 10) / 10
  const total = 8 + (h % 47)
  return { nota, total }
}

export type AvaliacaoItem = {
  id: string
  nota: number
  texto: string
  autor: string
  data: string
}

const COMENTARIOS_DEMO = [
  'Motorista pontual e cuidadoso com a carga.',
  'Boa comunicação durante toda a viagem.',
  'Veículo em ótimo estado e entrega no prazo.',
  'Atendimento profissional, recomendo.',
  'Chegou um pouco atrasado, mas avisou com antecedência.',
  'Excelente experiência, voltaria a contratar.',
  'Documentação em dia e manobra segura.',
  'Frete justo e motorista prestativo.',
]

/** Lista de avaliações para exibição (demo estável por motorista). */
export function listarAvaliacoesDemo(
  motoristaId: string,
  notaMedia: number,
  total: number,
): AvaliacaoItem[] {
  const n = Math.min(12, Math.max(0, total || 0))
  if (n === 0) return []
  let h = 0
  for (const c of motoristaId) h = (h * 33 + c.charCodeAt(0)) >>> 0
  const autores = ['Embarcador SP', 'Logística ABC', 'CD Campinas', 'Ops Santos', 'Cliente RJ']
  const out: AvaliacaoItem[] = []
  for (let i = 0; i < n; i++) {
    const seed = (h + i * 17) >>> 0
    const delta = ((seed % 7) - 3) / 10
    const nota = Math.min(5, Math.max(1, Math.round((notaMedia + delta) * 10) / 10))
    const dia = 1 + (seed % 28)
    const mes = 1 + (seed % 12)
    out.push({
      id: `${motoristaId}-av-${i}`,
      nota,
      texto: COMENTARIOS_DEMO[seed % COMENTARIOS_DEMO.length],
      autor: autores[seed % autores.length],
      data: `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/2026`,
    })
  }
  return out
}

export function iniciaisNome(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export const REGIOES_BR = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'] as const
export type RegiaoBr = (typeof REGIOES_BR)[number]

const UF_PARA_REGIAO: Record<string, RegiaoBr> = {
  AC: 'Norte',
  AP: 'Norte',
  AM: 'Norte',
  PA: 'Norte',
  RO: 'Norte',
  RR: 'Norte',
  TO: 'Norte',
  AL: 'Nordeste',
  BA: 'Nordeste',
  CE: 'Nordeste',
  MA: 'Nordeste',
  PB: 'Nordeste',
  PE: 'Nordeste',
  PI: 'Nordeste',
  RN: 'Nordeste',
  SE: 'Nordeste',
  DF: 'Centro-Oeste',
  GO: 'Centro-Oeste',
  MT: 'Centro-Oeste',
  MS: 'Centro-Oeste',
  ES: 'Sudeste',
  MG: 'Sudeste',
  RJ: 'Sudeste',
  SP: 'Sudeste',
  PR: 'Sul',
  RS: 'Sul',
  SC: 'Sul',
}

export function regiaoDaUf(uf: string): RegiaoBr | null {
  const key = uf.trim().toUpperCase()
  return UF_PARA_REGIAO[key] ?? null
}

/** Distância em km (Haversine). */
export function distanciaKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Pontos no mapa: motorista+placa OU placa cadastrada na transportadora (sem motorista ainda). */
export function montarPontosFrota(
  motoristas: Motorista[],
  veiculos: Veiculo[],
  transportadores: Transportador[],
  cargas: Carga[] = [],
): PontoFrota[] {
  const veiculoById = new Map(veiculos.map((v) => [v.id, v]))
  const transpById = new Map(transportadores.map((t) => [t.id, t]))
  const corridasIndex = indexCorridasPorVeiculo(cargas)
  const pontos: PontoFrota[] = []
  const veiculosComMotorista = new Set<string>()

  for (const m of motoristas) {
    if (m.situacao !== 'ativo') continue
    if (!m.veiculo_id || !m.transportador_id) continue
    const v = veiculoById.get(m.veiculo_id)
    const t = transpById.get(m.transportador_id)
    if (!v || v.situacao !== 'ativo') continue
    if (!t || t.situacao !== 'ativo') continue
    // Preferência: localização da placa; fallback: origem da transportadora
    const lat = v.origem_lat ?? t.origem_lat
    const lng = v.origem_lng ?? t.origem_lng
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue

    const { grupo, emoji } = classificarIconeVeiculo(v.tipo)
    const av = avaliacaoDoMotorista(m)
    const cidade = (v.origem_cidade || t.origem_cidade || t.cidade || '').trim()
    const uf = (v.origem_uf || t.origem_uf || t.uf || '').trim().toUpperCase()
    veiculosComMotorista.add(v.id)
    // Foto: motorista → logo/foto da transportadora → foto do veículo
    const fotoPerfil =
      (m.foto_url || '').trim() ||
      (t.logo_url || '').trim() ||
      (v.foto_url || v.fotos?.dianteira || '').trim() ||
      undefined
    pontos.push({
      id: `${m.id}-${v.id}`,
      motoristaId: m.id,
      motoristaNome: m.nome,
      // WhatsApp exibido: telefone do próprio motorista; se não tiver,
      // usa o WhatsApp cadastrado da transportadora (contato_telefone).
      motoristaTelefone: m.telefone || t.contato_telefone || t.telefone,
      motoristaCnh: m.cnh,
      motoristaCategoriaCnh: m.categoria_cnh,
      motoristaFoto: fotoPerfil,
      avaliacao: av.nota,
      totalAvaliacoes: av.total,
      transportadorId: t.id,
      transportadorNome: t.nome_fantasia,
      veiculoId: v.id,
      placa: v.placa,
      tipoVeiculo: v.tipo,
      veiculoMarca: v.marca,
      veiculoModelo: v.modelo,
      freteMinimo: Number(v.frete_minimo) || 0,
      lat,
      lng,
      disponivel: v.disponivel_mapa !== false,
      icone: grupo,
      emoji,
      cidade,
      uf,
      raioKm: Number(v.raio_km) || Number(t.raio_km) || 0,
      veiculoFotos: normalizeFotosVeiculo(v.fotos, v.foto_url),
      tipoCarroceria: v.tipo_carroceria,
      comprimento_m: v.comprimento_m,
      largura_m: v.largura_m,
      altura_m: v.altura_m,
      cubagem_m3: v.cubagem_m3,
      totalCorridas: corridasDoVeiculo(corridasIndex, v.id, v.placa),
    })
  }

  // Placas cadastradas na empresa ainda sem motorista vinculado
  for (const v of veiculos) {
    if (veiculosComMotorista.has(v.id)) continue
    if (v.situacao !== 'ativo' || !v.transportador_id) continue
    const t = transpById.get(v.transportador_id)
    if (!t || t.situacao !== 'ativo') continue
    const lat = v.origem_lat ?? t.origem_lat
    const lng = v.origem_lng ?? t.origem_lng
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const { grupo, emoji } = classificarIconeVeiculo(v.tipo)
    const cidade = (v.origem_cidade || t.origem_cidade || t.cidade || '').trim()
    const uf = (v.origem_uf || t.origem_uf || t.uf || '').trim().toUpperCase()
    const nome = (v.condutor || '').trim() || v.placa
    const fotoPerfil =
      (t.logo_url || '').trim() ||
      (v.foto_url || v.fotos?.dianteira || '').trim() ||
      undefined
    pontos.push({
      id: `veic-${v.id}`,
      motoristaId: '',
      motoristaNome: nome,
      // WhatsApp cadastrado da transportadora tem prioridade sobre o telefone genérico.
      motoristaTelefone: t.contato_telefone || t.telefone,
      motoristaFoto: fotoPerfil,
      avaliacao: 0,
      totalAvaliacoes: 0,
      transportadorId: t.id,
      transportadorNome: t.nome_fantasia,
      veiculoId: v.id,
      placa: v.placa,
      tipoVeiculo: v.tipo,
      veiculoMarca: v.marca,
      veiculoModelo: v.modelo,
      freteMinimo: Number(v.frete_minimo) || 0,
      lat,
      lng,
      disponivel: v.disponivel_mapa !== false,
      icone: grupo,
      emoji,
      cidade,
      uf,
      raioKm: Number(v.raio_km) || Number(t.raio_km) || 0,
      veiculoFotos: normalizeFotosVeiculo(v.fotos, v.foto_url),
      tipoCarroceria: v.tipo_carroceria,
      comprimento_m: v.comprimento_m,
      largura_m: v.largura_m,
      altura_m: v.altura_m,
      cubagem_m3: v.cubagem_m3,
      totalCorridas: corridasDoVeiculo(corridasIndex, v.id, v.placa),
    })
  }

  return pontos
}
