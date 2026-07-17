import type { ClassificacaoTransportador, Lance, Transportador } from '../types'

const RANK: Record<ClassificacaoTransportador, number> = {
  ouro: 3,
  prata: 2,
  bronze: 1,
}

/** Ordena candidatos a vencedor: menor valor → mais antigo → melhor classificação. */
export function ordenarLancesParaVitoria(
  lances: Lance[],
  transportadorById: (id: string) => Transportador | undefined,
): Lance[] {
  return [...lances].sort((a, b) => {
    if (a.valor !== b.valor) return a.valor - b.valor
    const ta = new Date(a.created_at).getTime()
    const tb = new Date(b.created_at).getTime()
    if (ta !== tb) return ta - tb
    const ca = RANK[transportadorById(a.transportador_id)?.classificacao ?? 'bronze']
    const cb = RANK[transportadorById(b.transportador_id)?.classificacao ?? 'bronze']
    return cb - ca
  })
}

/** True se os dois primeiros empatam em valor (exige atenção manual se regra pedir). */
export function haEmpateDeValor(lancesOrdenados: Lance[]): boolean {
  if (lancesOrdenados.length < 2) return false
  return lancesOrdenados[0].valor === lancesOrdenados[1].valor
}
