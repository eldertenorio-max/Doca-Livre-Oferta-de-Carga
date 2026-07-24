import type { Motorista, Transportador, Veiculo } from '../types'

/** Grupos de ícone no mapa — alinhados aos tipos de cadastro. */
export type FrotaIconeGrupo =
  | 'van'
  | 'fiorino'
  | 'utilitario'
  | 'passeio'
  | 'hr'
  | 'vuc'
  | 'leve'
  | 'toco'
  | 'truck'
  | 'bitruck'
  | 'carreta'
  | 'carreta_ls'
  | 'vanderleia'
  | 'bitrem'
  | 'rodotrem'
  | 'outros'

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
}

export const LEGENDA_FROTA: { grupo: FrotaIconeGrupo; emoji: string; label: string }[] = [
  { grupo: 'van', emoji: '🚐', label: 'Van / Furgão' },
  { grupo: 'fiorino', emoji: '🛻', label: 'Fiorino' },
  { grupo: 'utilitario', emoji: '🚙', label: 'Utilitário' },
  { grupo: 'passeio', emoji: '🚗', label: 'Carro Passeio' },
  { grupo: 'hr', emoji: '📦', label: 'HR' },
  { grupo: 'vuc', emoji: '🚐', label: 'VUC' },
  { grupo: 'leve', emoji: '🚚', label: '3/4 Leve' },
  { grupo: 'toco', emoji: '🚛', label: 'Toco' },
  { grupo: 'truck', emoji: '🛻', label: 'Truck' },
  { grupo: 'bitruck', emoji: '🚚', label: 'Bitruck' },
  { grupo: 'carreta', emoji: '🚛', label: 'Carreta' },
  { grupo: 'carreta_ls', emoji: '🚛', label: 'Carreta LS' },
  { grupo: 'vanderleia', emoji: '🚛', label: 'Vanderleia' },
  { grupo: 'bitrem', emoji: '🚚', label: 'Bitrem' },
  { grupo: 'rodotrem', emoji: '🚂', label: 'Rodotrem' },
]

export function classificarIconeVeiculo(tipo: string): { grupo: FrotaIconeGrupo; emoji: string } {
  const t = tipo.toLowerCase()

  if (/fiorino/.test(t)) return { grupo: 'fiorino', emoji: '🛻' }
  if (/utilit/.test(t)) return { grupo: 'utilitario', emoji: '🚙' }
  if (/passeio/.test(t)) return { grupo: 'passeio', emoji: '🚗' }
  if (/\bhr\b/.test(t) || t === 'hr') return { grupo: 'hr', emoji: '📦' }
  if (/vuc/.test(t)) return { grupo: 'vuc', emoji: '🚐' }
  if (/van|furg/.test(t)) return { grupo: 'van', emoji: '🚐' }
  if (/3\/4|caminh[aã]o leve/.test(t)) return { grupo: 'leve', emoji: '🚚' }
  if (/bitruck/.test(t)) return { grupo: 'bitruck', emoji: '🚚' }
  if (/\btoco\b/.test(t)) return { grupo: 'toco', emoji: '🚛' }
  if (/\btruck\b/.test(t)) return { grupo: 'truck', emoji: '🛻' }
  if (/carreta\s*ls|ls\b/.test(t)) return { grupo: 'carreta_ls', emoji: '🚛' }
  if (/vanderleia/.test(t)) return { grupo: 'vanderleia', emoji: '🚛' }
  if (/carreta/.test(t)) return { grupo: 'carreta', emoji: '🚛' }
  if (/rodotrem/.test(t)) return { grupo: 'rodotrem', emoji: '🚂' }
  if (/bitrem/.test(t)) return { grupo: 'bitrem', emoji: '🚚' }

  return { grupo: 'outros', emoji: '🚛' }
}

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

export function iniciaisNome(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

/** Pontos no mapa: motorista ativo + veículo + origem do transportador. */
export function montarPontosFrota(
  motoristas: Motorista[],
  veiculos: Veiculo[],
  transportadores: Transportador[],
): PontoFrota[] {
  const veiculoById = new Map(veiculos.map((v) => [v.id, v]))
  const transpById = new Map(transportadores.map((t) => [t.id, t]))
  const pontos: PontoFrota[] = []

  for (const m of motoristas) {
    if (m.situacao !== 'ativo') continue
    if (!m.veiculo_id || !m.transportador_id) continue
    const v = veiculoById.get(m.veiculo_id)
    const t = transpById.get(m.transportador_id)
    if (!v || v.situacao !== 'ativo') continue
    if (!t || t.situacao !== 'ativo') continue
    const lat = t.origem_lat
    const lng = t.origem_lng
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue

    const { grupo, emoji } = classificarIconeVeiculo(v.tipo)
    const av = avaliacaoDoMotorista(m)
    pontos.push({
      id: `${m.id}-${v.id}`,
      motoristaId: m.id,
      motoristaNome: m.nome,
      motoristaTelefone: m.telefone,
      motoristaCnh: m.cnh,
      motoristaCategoriaCnh: m.categoria_cnh,
      motoristaFoto: m.foto_url,
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
      disponivel: t.disponivel_mapa !== false,
      icone: grupo,
      emoji,
    })
  }

  // Espalha pins que caem no mesmo ponto (vários motoristas na mesma origem)
  const contagem = new Map<string, number>()
  return pontos.map((p) => {
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`
    const i = contagem.get(key) ?? 0
    contagem.set(key, i + 1)
    if (i === 0) return p
    const ang = (i * 2.2) % (Math.PI * 2)
    const d = 0.012 * i
    return {
      ...p,
      lat: p.lat + Math.cos(ang) * d,
      lng: p.lng + Math.sin(ang) * d,
    }
  })
}
