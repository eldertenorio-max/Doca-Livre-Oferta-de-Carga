import type { Carga, Lance, StatusCargaMinerva } from '../types'
import { lanceNaRodadaAtual } from './cargaDefaults'

/** Colunas do Kanban Minerva (embarcador). */
export type ColunaMinerva = StatusCargaMinerva | 'confirmadas'

/** Colunas do Kanban Transportador. */
export type ColunaTransportador = 'nova_carga' | 'propostas' | 'confirmadas' | 'alocadas'

/**
 * Fluxo canônico:
 *
 * Minerva:
 *   rascunho / publicada sem lance → Nova Carga
 *   1º lance recebido             → Negociando
 *   frete fechado                 → Confirmadas
 *   placa/motorista               → Alocadas
 *
 * Transportador:
 *   oferta aberta, sem meu lance  → Nova Carga
 *   eu já propus                  → Propostas
 *   eu venci                      → Confirmadas
 *   alocada                       → Alocadas
 */

export function temLanceAtivoNaRodada(
  carga: Carga,
  lances: Lance[],
): boolean {
  return lances.some(
    (l) =>
      l.carga_id === carga.id &&
      l.status === 'ativo' &&
      lanceNaRodadaAtual(l, carga),
  )
}

export function meuLanceAtivoNaRodada(
  carga: Carga,
  lances: Lance[],
  transportadorId: string,
): boolean {
  return lances.some(
    (l) =>
      l.carga_id === carga.id &&
      l.transportador_id === transportadorId &&
      l.status === 'ativo' &&
      lanceNaRodadaAtual(l, carga),
  )
}

export function colunaMinerva(
  c: Carga,
  temLanceAtivo: boolean,
): ColunaMinerva | null {
  if (c.status === 'suspensas') return 'suspensas'
  if (c.status === 'canceladas') return 'canceladas'
  if (c.status === 'recusadas') return 'recusadas'
  if (c.status === 'alocadas') return 'alocadas'

  // Frete fechado (vencedor) → Confirmadas, até alocar
  if (c.transportador_vencedor_id) {
    return 'confirmadas'
  }

  // Publicada com lance → Negociando
  if (['negociando', 'propostas'].includes(c.status) && temLanceAtivo) {
    return 'negociando'
  }

  // Rascunho OU publicada ainda sem lance → Nova Carga
  if (c.status === 'nova_carga') return 'nova_carga'
  if (['negociando', 'propostas'].includes(c.status) && !temLanceAtivo) {
    return 'nova_carga'
  }

  return null
}

export function colunaTransportador(
  c: Carga,
  transportadorId: string,
  temMeuLance: boolean,
): ColunaTransportador | null {
  if (!transportadorId) return null

  if (c.status === 'alocadas' && c.transportador_vencedor_id === transportadorId) {
    return 'alocadas'
  }

  if (
    c.transportador_vencedor_id === transportadorId &&
    c.status !== 'alocadas' &&
    c.status !== 'recusadas' &&
    c.status !== 'canceladas'
  ) {
    return 'confirmadas'
  }

  // Negociação aberta (inclui pausada): ainda pode ver/atualizar proposta
  const aberta =
    ['negociando', 'propostas', 'suspensas'].includes(c.status) &&
    !c.transportador_vencedor_id

  if (!aberta) return null

  // Já dei lance nesta rodada → Propostas
  if (temMeuLance) return 'propostas'

  // Oferta nova para mim → Nova Carga
  return 'nova_carga'
}

/** Ordenação estável dos cards (urgência / recência). */
export function ordenarCargasKanban(a: Carga, b: Carga): number {
  // Publicadas com prazo: as que vencem antes primeiro
  const ea = a.expira_em ? new Date(a.expira_em).getTime() : Number.POSITIVE_INFINITY
  const eb = b.expira_em ? new Date(b.expira_em).getTime() : Number.POSITIVE_INFINITY
  if (ea !== eb) return ea - eb

  const ua = new Date(a.updated_at ?? a.publicado_em ?? a.created_at).getTime()
  const ub = new Date(b.updated_at ?? b.publicado_em ?? b.created_at).getTime()
  return ub - ua
}

/**
 * Alinha status interno com a presença de lances da rodada.
 * negociando = publicada sem lance | propostas = já há lance(s).
 */
export function alinharStatusComLances(cargas: Carga[], lances: Lance[]): Carga[] {
  return cargas.map((c) => {
    if (c.transportador_vencedor_id) return c
    if (!['negociando', 'propostas'].includes(c.status)) return c
    const temAtivo = temLanceAtivoNaRodada(c, lances)
    if (temAtivo && c.status !== 'propostas') {
      return { ...c, status: 'propostas' as const }
    }
    if (!temAtivo && c.status === 'propostas') {
      return { ...c, status: 'negociando' as const }
    }
    return c
  })
}
