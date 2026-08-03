import type { ClassificacaoTransportador, Lance, Transportador } from '../types'
import { canonicalTransportadorId } from './transportadorIds'

const RANK: Record<ClassificacaoTransportador, number> = {
  ouro: 3,
  prata: 2,
  bronze: 1,
}

/** Normaliza valor de lance (number ou string BR/US). */
export function valorNumericoLance(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const cleaned = v.trim().replace(/R\$\s?/gi, '').replace(/\s/g, '')
    if (!cleaned) return 0
    // Formato BR: 1.234,56
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned) || /^\d+,\d+$/.test(cleaned)) {
      return Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0
    }
    return Number(cleaned.replace(',', '.')) || 0
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Ordena candidatos a vencedor: menor valor → mais antigo → melhor classificação. */
export function ordenarLancesParaVitoria(
  lances: Lance[],
  transportadorById: (id: string) => Transportador | undefined,
): Lance[] {
  return [...lances].sort((a, b) => {
    const va = valorNumericoLance(a.valor)
    const vb = valorNumericoLance(b.valor)
    if (va !== vb) return va - vb
    const ta = new Date(a.created_at).getTime()
    const tb = new Date(b.created_at).getTime()
    if (ta !== tb) return ta - tb
    const ca = RANK[transportadorById(a.transportador_id)?.classificacao ?? 'bronze']
    const cb = RANK[transportadorById(b.transportador_id)?.classificacao ?? 'bronze']
    if (ca !== cb) return cb - ca
    return String(a.id).localeCompare(String(b.id))
  })
}

/** True se os dois primeiros empatam em valor (exige atenção manual se regra pedir). */
export function haEmpateDeValor(lancesOrdenados: Lance[]): boolean {
  if (lancesOrdenados.length < 2) return false
  return (
    valorNumericoLance(lancesOrdenados[0].valor) ===
    valorNumericoLance(lancesOrdenados[1].valor)
  )
}

/**
 * Uma proposta por transportadora (melhor frete; em empate, a mais antiga).
 * Evita duplicata legado UUID + t1 e contagem errada no ranking do card.
 */
export function dedupeLancesPorTransportador(
  lances: Lance[],
  transportadorById: (id: string) => Transportador | undefined,
): Lance[] {
  const best = new Map<string, Lance>()
  for (const l of lances) {
    const key = canonicalTransportadorId(l.transportador_id) || l.transportador_id
    if (!key) continue
    const cur = best.get(key)
    if (!cur) {
      best.set(key, l)
      continue
    }
    const ranked = ordenarLancesParaVitoria([cur, l], transportadorById)
    best.set(key, ranked[0])
  }
  return Array.from(best.values())
}

/** Ordem de chegada (1º = quem ofertou primeiro nesta rodada). */
export function ordenarLancesPorChegada(lances: Lance[]): Lance[] {
  return [...lances].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
      String(a.id).localeCompare(String(b.id)),
  )
}

export type RankingLanceCard = {
  /** Posição por ordem de chegada (1 = primeiro a ofertar). */
  posicao: number
  /** Qtd. de propostas ativas (1 por transportadora). */
  total: number
  /** True se tem o menor frete agora. */
  melhor: boolean
  meuLance: Lance
}

/**
 * Posição no card do transportador:
 * - número = ordem de chegada (2º a ofertar = 2°)
 * - cor/melhor = menor frete (regra de vitória)
 */
export function rankingNoCardTransportador(
  lancesAtivos: Lance[],
  transportadorId: string,
  transportadorById: (id: string) => Transportador | undefined = () => undefined,
): RankingLanceCard | null {
  const tid = (canonicalTransportadorId(transportadorId) || transportadorId || '').trim()
  if (!tid || lancesAtivos.length === 0) return null

  const unicos = dedupeLancesPorTransportador(lancesAtivos, transportadorById)
  const porChegada = ordenarLancesPorChegada(unicos)
  const porValor = ordenarLancesParaVitoria(unicos, transportadorById)

  const meuLance =
    unicos.find(
      (l) => (canonicalTransportadorId(l.transportador_id) || l.transportador_id) === tid,
    ) ?? null
  if (!meuLance) return null

  const posicao = porChegada.findIndex((l) => l.id === meuLance.id) + 1
  if (posicao <= 0) return null

  return {
    posicao,
    total: unicos.length,
    melhor: porValor[0]?.id === meuLance.id,
    meuLance,
  }
}
