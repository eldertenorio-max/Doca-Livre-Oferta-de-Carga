import type { Carga, HistoricoEvento, Profile, TipoHistorico } from '../types'

export function normalizeCarga(c: Carga): Carga {
  return {
    ...c,
    grupo_ids: Array.isArray(c.grupo_ids) ? c.grupo_ids : [],
    grupos_notificados: Array.isArray(c.grupos_notificados) ? c.grupos_notificados : [],
    frete_minimo: c.frete_minimo ?? null,
    frete_maximo: c.frete_maximo ?? null,
    pausado_em: c.pausado_em ?? null,
    tempo_restante_ms: c.tempo_restante_ms ?? null,
    veiculo_id: c.veiculo_id ?? null,
    motorista_id: c.motorista_id ?? null,
    motivo_cancelamento: c.motivo_cancelamento ?? null,
  }
}

export function auditMeta(user: Profile | null) {
  return {
    ator_id: user?.id ?? null,
    ator_nome: user?.nome ?? user?.usuario ?? null,
    ip: null as string | null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 240) : null,
  }
}

export function makeHist(
  uid: (p: string) => string,
  tipo: TipoHistorico,
  titulo: string,
  extra?: Partial<HistoricoEvento>,
  user?: Profile | null,
): HistoricoEvento {
  return {
    id: uid('hist'),
    tipo,
    titulo,
    created_at: new Date().toISOString(),
    ...auditMeta(user ?? null),
    ...extra,
  }
}

export function resetNegociacaoFields(_c?: Carga): Partial<Carga> {
  return {
    status: 'nova_carga',
    prioridade: null,
    modo_publicacao: null,
    prazo_leilao_minutos: null,
    prazo_alocacao_minutos: null,
    publicado_em: null,
    expira_em: null,
    alocacao_expira_em: null,
    pausado_em: null,
    tempo_restante_ms: null,
    justificativa_motivo: null,
    justificativa_obs: null,
    grupo_ids: [],
    grupos_notificados: [],
    transportador_vencedor_id: null,
    frete_fechado: null,
    frete_oferta: null,
    frete_minimo: null,
    frete_maximo: null,
    margem_percentual: null,
    placa: null,
    motorista: null,
    veiculo_id: null,
    motorista_id: null,
    publicado_por: null,
    motivo_cancelamento: null,
    visualizacoes: 0,
    recusas: 0,
  }
}
