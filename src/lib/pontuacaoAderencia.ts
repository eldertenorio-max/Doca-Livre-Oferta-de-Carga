import {
  PONTOS_ADERENCIA,
  PONTUACAO_INICIAL,
  classificacaoPorPontuacao,
} from './businessRules'
import { sameTransportadorId } from './transportadorIds'
import type {
  Carga,
  GrupoTransportador,
  InteracaoPontuacao,
  Lance,
  Transportador,
} from '../types'

export { PONTOS_ADERENCIA, PONTUACAO_INICIAL, classificacaoPorPontuacao }

export const REGRAS_PONTUACAO = [
  {
    id: 'nao_visualizada' as const,
    titulo: 'Não entrou no anúncio',
    detalhe: 'Foi notificado e nem abriu a carga.',
    pontos: PONTOS_ADERENCIA.nao_visualizada,
  },
  {
    id: 'visualizada_sem_acao' as const,
    titulo: 'Entrou e não deu lance',
    detalhe: 'Abriu o anúncio e saiu sem propor.',
    pontos: PONTOS_ADERENCIA.visualizada_sem_acao,
  },
  {
    id: 'com_proposta' as const,
    titulo: 'Entrou, deu lance e não fechou',
    detalhe: 'Participou da negociação sem vencer.',
    pontos: PONTOS_ADERENCIA.com_proposta,
  },
  {
    id: 'frete_fechado' as const,
    titulo: 'Entrou, aceitou e fechou a carga',
    detalhe: 'Frete fechado com esta transportadora.',
    pontos: PONTOS_ADERENCIA.frete_fechado,
  },
  {
    id: 'recusada' as const,
    titulo: 'Recusou a oferta',
    detalhe: 'Entrou e recusou a carga (ou o prazo de alocação expirou).',
    pontos: PONTOS_ADERENCIA.recusada,
  },
] as const

export function labelPontos(n: number): string {
  if (n === 0) return '0 (zero a zero)'
  if (n > 0) return `+${n}`
  return String(n)
}

export function tidsNotificadosDaCarga(
  c: Pick<
    Carga,
    'grupo_ids' | 'grupos_notificados' | 'transportador_direto_ids' | 'modo_publicacao'
  >,
  grupos: GrupoTransportador[],
): string[] {
  if (c.modo_publicacao === 'negociacao_direta') {
    return [...new Set(c.transportador_direto_ids ?? [])]
  }
  const gids =
    (c.grupos_notificados?.length ? c.grupos_notificados : c.grupo_ids) ?? []
  const ids = new Set<string>()
  for (const g of grupos) {
    if (!gids.includes(g.id)) continue
    for (const tid of g.transportador_ids ?? []) ids.add(tid)
  }
  return [...ids]
}

function jaTemInteracao(
  interacoes: InteracaoPontuacao[],
  cargaId: string,
  tid: string,
  tipos: InteracaoPontuacao['tipo'][],
): boolean {
  return interacoes.some(
    (i) =>
      i.carga_id === cargaId &&
      sameTransportadorId(i.transportador_id, tid) &&
      tipos.includes(i.tipo),
  )
}

function viuCarga(c: Pick<Carga, 'visualizado_por_ids'>, tid: string): boolean {
  return (c.visualizado_por_ids ?? []).some((id) => sameTransportadorId(id, tid))
}

function recusouCarga(c: Pick<Carga, 'recusado_por_ids'>, tid: string): boolean {
  return (c.recusado_por_ids ?? []).some((id) => sameTransportadorId(id, tid))
}

function deuLance(lances: Lance[], cargaId: string, tid: string): boolean {
  return lances.some(
    (l) => l.carga_id === cargaId && sameTransportadorId(l.transportador_id, tid),
  )
}

function registrarInteracao(
  interacoes: InteracaoPontuacao[],
  transportadores: Transportador[],
  opts: {
    tid: string
    cargaId: string
    tipo: InteracaoPontuacao['tipo']
    nowIso: string
    newId: () => string
    aplicarPontos: boolean
  },
): { transportadores: Transportador[]; interacoes: InteracaoPontuacao[] } {
  const pontos = PONTOS_ADERENCIA[opts.tipo]
  const nextInteracoes = [
    ...interacoes,
    {
      id: opts.newId(),
      transportador_id: opts.tid,
      carga_id: opts.cargaId,
      tipo: opts.tipo,
      pontos,
      created_at: opts.nowIso,
    },
  ]
  if (!opts.aplicarPontos || pontos === 0) {
    return { transportadores, interacoes: nextInteracoes }
  }
  return {
    interacoes: nextInteracoes,
    transportadores: transportadores.map((t) => {
      if (!sameTransportadorId(t.id, opts.tid)) return t
      const pontuacao = t.pontuacao + pontos
      return { ...t, pontuacao, classificacao: classificacaoPorPontuacao(pontuacao) }
    }),
  }
}

/** Ao encerrar a oferta: quem não deu lance perde pontos; quem deu e não fechou fica zero a zero. */
export function aplicarPenalidadesEncerramento(opts: {
  carga: Carga
  grupos: GrupoTransportador[]
  lances: Lance[]
  transportadores: Transportador[]
  interacoes: InteracaoPontuacao[]
  nowIso: string
  newId: () => string
}): { transportadores: Transportador[]; interacoes: InteracaoPontuacao[] } {
  const { carga, grupos, lances, nowIso, newId } = opts
  let { transportadores, interacoes } = opts
  const vencedor = carga.transportador_vencedor_id
  const envolvidos = new Set([
    ...tidsNotificadosDaCarga(carga, grupos),
    ...lances.filter((l) => l.carga_id === carga.id).map((l) => l.transportador_id),
  ])

  for (const tid of envolvidos) {
    if (vencedor && sameTransportadorId(tid, vencedor)) continue
    if (
      jaTemInteracao(interacoes, carga.id, tid, [
        'visualizada_sem_acao',
        'nao_visualizada',
        'com_proposta',
        'frete_fechado',
        'recusada',
      ])
    ) {
      continue
    }
    if (deuLance(lances, carga.id, tid)) {
      const next = registrarInteracao(interacoes, transportadores, {
        tid,
        cargaId: carga.id,
        tipo: 'com_proposta',
        nowIso,
        newId,
        aplicarPontos: false,
      })
      interacoes = next.interacoes
      transportadores = next.transportadores
      continue
    }
    const tipo: InteracaoPontuacao['tipo'] = viuCarga(carga, tid)
      ? 'visualizada_sem_acao'
      : 'nao_visualizada'
    const next = registrarInteracao(interacoes, transportadores, {
      tid,
      cargaId: carga.id,
      tipo,
      nowIso,
      newId,
      aplicarPontos: true,
    })
    interacoes = next.interacoes
    transportadores = next.transportadores
  }
  return { transportadores, interacoes }
}

export function novaInteracao(
  opts: {
    transportadorId: string
    cargaId: string
    tipo: InteracaoPontuacao['tipo']
    nowIso: string
    newId: () => string
  },
): InteracaoPontuacao {
  return {
    id: opts.newId(),
    transportador_id: opts.transportadorId,
    carga_id: opts.cargaId,
    tipo: opts.tipo,
    pontos: PONTOS_ADERENCIA[opts.tipo],
    created_at: opts.nowIso,
  }
}

export function labelTipoPontuacao(tipo: InteracaoPontuacao['tipo']): string {
  switch (tipo) {
    case 'nao_visualizada':
      return 'Não entrou no anúncio'
    case 'visualizada_sem_acao':
      return 'Entrou e não deu lance'
    case 'com_proposta':
      return 'Deu lance e não fechou'
    case 'frete_fechado':
      return 'Aceitou e fechou a carga'
    case 'recusada':
      return 'Recusou a oferta'
    default:
      return tipo
  }
}

export type StatsAnuncioPontuacao = {
  cargaId: string
  numero: string
  origem: string
  destino: string
  status: string
  visualizacoes: number
  visualizaram: number
  lances: number
  aceitaram: number
  recusaramCarga: number
  recusaramCargaIds: string[]
  recusaramContra: number
  recusaramContraIds: string[]
  publicadoEm: string | null
}

export function statsAnunciosPontuacao(
  cargas: Carga[],
  lances: Lance[],
): StatsAnuncioPontuacao[] {
  return cargas
    .filter((c) => c.status !== 'nova_carga' || Boolean(c.publicado_em))
    .map((c) => {
      const tids = new Set(
        lances.filter((l) => l.carga_id === c.id).map((l) => l.transportador_id),
      )
      const contraIds = [...new Set(c.recusado_contra_proposta_por_ids ?? [])]
      const recusaramIds = [...new Set(c.recusado_por_ids ?? [])]
      const recusaramCargaIds = recusaramIds.filter(
        (id) => !contraIds.some((x) => sameTransportadorId(x, id)),
      )
      return {
        cargaId: c.id,
        numero: c.numero,
        origem: c.origem,
        destino: c.destino,
        status: c.status,
        visualizacoes: c.visualizacoes || 0,
        visualizaram: (c.visualizado_por_ids ?? []).length,
        lances: tids.size,
        aceitaram: c.transportador_vencedor_id ? 1 : 0,
        recusaramCarga: recusaramCargaIds.length,
        recusaramCargaIds,
        recusaramContra: contraIds.length,
        recusaramContraIds: contraIds,
        publicadoEm: c.publicado_em ?? c.created_at ?? null,
      }
    })
    .sort((a, b) => {
      const ta = a.publicadoEm ? new Date(a.publicadoEm).getTime() : 0
      const tb = b.publicadoEm ? new Date(b.publicadoEm).getTime() : 0
      return tb - ta
    })
}

function ofertaEncerradaParaPontos(c: Carga): boolean {
  if (c.status === 'canceladas' || c.status === 'suspensas') return false
  if (c.transportador_vencedor_id) return true
  return ['recusadas', 'alocadas'].includes(c.status)
}

export type LinhaHistoricoPts = InteracaoPontuacao & { sintetico?: boolean }

/** Sempre o valor da regra atual, para bater com os cartões de exemplo. */
export function pontosDaRegra(tipo: InteracaoPontuacao['tipo'], fallback = 0): number {
  return PONTOS_ADERENCIA[tipo] ?? fallback
}

export function pontuacaoDoHistorico(linhas: Pick<InteracaoPontuacao, 'tipo' | 'pontos'>[]): number {
  const eventos = linhas.reduce((s, h) => s + pontosDaRegra(h.tipo, h.pontos), 0)
  return PONTUACAO_INICIAL + eventos
}

/** Histórico gravado + linhas derivadas de cargas já encerradas (quando a interação não persistiu). */
export function linhasHistoricoPontuacao(opts: {
  cargas: Carga[]
  lances: Lance[]
  grupos: GrupoTransportador[]
  interacoes: InteracaoPontuacao[]
}): LinhaHistoricoPts[] {
  const rows: LinhaHistoricoPts[] = [...opts.interacoes]
  const jaTem = (cargaId: string, tid: string) =>
    rows.some(
      (r) => r.carga_id === cargaId && sameTransportadorId(r.transportador_id, tid),
    )

  for (const c of opts.cargas) {
    const recusados = c.recusado_por_ids ?? []
    const whenRecusa = c.updated_at ?? c.publicado_em ?? c.created_at
    for (const tid of recusados) {
      if (jaTem(c.id, tid)) continue
      rows.push({
        id: `syn-recusa-${c.id}-${tid}`,
        transportador_id: tid,
        carga_id: c.id,
        tipo: 'recusada',
        pontos: PONTOS_ADERENCIA.recusada,
        created_at: whenRecusa,
        sintetico: true,
      })
    }
  }

  for (const c of opts.cargas) {
    if (!ofertaEncerradaParaPontos(c)) continue
    const envolvidos = new Set([
      ...tidsNotificadosDaCarga(c, opts.grupos),
      ...opts.lances.filter((l) => l.carga_id === c.id).map((l) => l.transportador_id),
      ...(c.recusado_por_ids ?? []),
    ])
    const when = c.updated_at ?? c.alocacao_expira_em ?? c.publicado_em ?? c.created_at
    for (const tid of envolvidos) {
      if (jaTem(c.id, tid)) continue
      let tipo: InteracaoPontuacao['tipo']
      if (recusouCarga(c, tid)) {
        tipo = 'recusada'
      } else if (c.transportador_vencedor_id && sameTransportadorId(tid, c.transportador_vencedor_id)) {
        tipo = 'frete_fechado'
      } else if (deuLance(opts.lances, c.id, tid)) {
        tipo = 'com_proposta'
      } else if (viuCarga(c, tid)) {
        tipo = 'visualizada_sem_acao'
      } else {
        tipo = 'nao_visualizada'
      }
      rows.push({
        id: `syn-${c.id}-${tid}`,
        transportador_id: tid,
        carga_id: c.id,
        tipo,
        pontos: PONTOS_ADERENCIA[tipo],
        created_at: when,
        sintetico: true,
      })
    }
  }
  return rows.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}
