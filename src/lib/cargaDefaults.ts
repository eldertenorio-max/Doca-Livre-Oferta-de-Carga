import { parseCarrocerias } from './tiposCarroceria'
import { limparPontosPassagemRota } from './rotasSync'
import type { Carga, HistoricoEvento, Profile, TipoHistorico } from '../types'

/** Aceita true/1/"sim"/"true" — útil após sync JSON antigo. */
export function flagSim(v: unknown): boolean {
  if (v === true || v === 1) return true
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    return s === '1' || s === 'true' || s === 'sim' || s === 'yes' || s === 's'
  }
  return false
}

/** Carga marcada como retorno (carga retorno ou retorna à origem). */
export function isCargaRetorno(c: Pick<Carga, 'carga_retorno' | 'retorna_origem'>): boolean {
  return flagSim(c.carga_retorno) || flagSim(c.retorna_origem)
}

export function normalizeCarga(c: Carga): Carga {
  return {
    ...c,
    grupo_ids: Array.isArray(c.grupo_ids) ? c.grupo_ids : [],
    grupos_notificados: Array.isArray(c.grupos_notificados) ? c.grupos_notificados : [],
    transportador_direto_ids: Array.isArray(c.transportador_direto_ids)
      ? c.transportador_direto_ids
      : [],
    recusado_por_ids: Array.isArray(c.recusado_por_ids) ? c.recusado_por_ids : [],
    carrocerias: Array.isArray(c.carrocerias)
      ? c.carrocerias
      : parseCarrocerias(
          (c as Carga & { tipo_carroceria?: string }).tipo_carroceria ?? undefined,
        ),
    complemento:
      c.complemento === 'sim' || c.complemento === 'nao' || c.complemento === 'ambos'
        ? c.complemento
        : undefined,
    carga_retorno: flagSim(c.carga_retorno),
    retorna_origem: flagSim(c.retorna_origem),
    origem_lat:
      c.origem_lat != null && Number.isFinite(Number(c.origem_lat))
        ? Number(c.origem_lat)
        : null,
    origem_lng:
      c.origem_lng != null && Number.isFinite(Number(c.origem_lng))
        ? Number(c.origem_lng)
        : null,
    destino_lat:
      c.destino_lat != null && Number.isFinite(Number(c.destino_lat))
        ? Number(c.destino_lat)
        : null,
    destino_lng:
      c.destino_lng != null && Number.isFinite(Number(c.destino_lng))
        ? Number(c.destino_lng)
        : null,
    pontos_passagem: limparPontosPassagemRota(c.pontos_passagem),
    gerenciamento_risco:
      c.gerenciamento_risco === 'rastreador' ||
      c.gerenciamento_risco === 'localizador' ||
      c.gerenciamento_risco === 'ambos' ||
      c.gerenciamento_risco === 'nao'
        ? c.gerenciamento_risco
        : undefined,
    antt: c.antt ?? null,
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
    transportador_direto_ids: [],
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
    recusado_por_ids: [],
  }
}

/** Lance ainda vale na rodada atual (publicado_em). */
export function lanceNaRodadaAtual(
  lance: { created_at: string },
  carga: { publicado_em?: string | null },
): boolean {
  if (!carga.publicado_em) return true
  // Tolerância ampla: relógio entre aparelhos + latência de sync
  return (
    new Date(lance.created_at).getTime() >=
    new Date(carga.publicado_em).getTime() - 60_000
  )
}
