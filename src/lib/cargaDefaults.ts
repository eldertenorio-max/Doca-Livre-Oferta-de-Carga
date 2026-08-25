import { parseCarrocerias } from './tiposCarroceria'
import { limparPontosPassagemRota } from './rotasSync'
import type {
  Carga,
  ClienteDistribuicao,
  HistoricoEvento,
  Profile,
  SeqDistribuicao,
  TipoHistorico,
  TipoOfertaCarga,
} from '../types'

/** Aceita true/1/"sim"/"true" — útil após sync JSON antigo. */
export function flagSim(v: unknown): boolean {
  if (v === true || v === 1) return true
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    return s === '1' || s === 'true' || s === 'sim' || s === 'yes' || s === 's'
  }
  return false
}

/** Carga marcada como retorno (somente o campo “Carga retorno”). */
export function isCargaRetorno(c: Pick<Carga, 'carga_retorno'>): boolean {
  return flagSim(c.carga_retorno)
}

export function asTipoOferta(v: unknown): TipoOfertaCarga {
  return v === 'distribuicao' ? 'distribuicao' : 'longo_percurso'
}

export function isOfertaDistribuicao(c: Pick<Carga, 'tipo_oferta'>): boolean {
  return asTipoOferta(c.tipo_oferta) === 'distribuicao'
}

export function labelTipoOferta(t?: TipoOfertaCarga | null): string {
  return t === 'distribuicao' ? 'Carga distribuição' : 'Carga longo percurso'
}

export function asSeqDistribuicao(v: unknown): SeqDistribuicao {
  return v === 'cidades' ? 'cidades' : 'clientes'
}

export function totaisDistribuicao(
  c: Pick<
    Carga,
    'clientes_distribuicao' | 'num_entregas' | 'qtd_nfs' | 'peso' | 'valor_mercadorias'
  >,
) {
  const pts = Array.isArray(c.clientes_distribuicao) ? c.clientes_distribuicao : []
  const entregas = pts.reduce((acc, p) => acc + (Number(p.qtd_entregas) || 0), 0)
  const nfs = pts.reduce((acc, p) => acc + (Number(p.qtd_nfs) || 0), 0)
  const peso = pts.reduce((acc, p) => acc + (Number(p.peso) || 0), 0)
  const valor = pts.reduce((acc, p) => acc + (Number(p.valor) || 0), 0)
  return {
    pontos: pts.length,
    entregas: c.num_entregas || entregas || 0,
    nfs: c.qtd_nfs || nfs || 0,
    peso: c.peso || peso || 0,
    valor: c.valor_mercadorias || valor || 0,
  }
}

export function newClienteDistribuicaoId(): string {
  return `cdist_${Math.random().toString(36).slice(2, 10)}`
}

export function emptyClienteDistribuicao(): ClienteDistribuicao {
  return {
    id: newClienteDistribuicaoId(),
    nome: '',
    endereco: '',
    cnpj: '',
    cidade: '',
    lat: null,
    lng: null,
    pedido: '',
    tipo: 'cliente',
    qtd_entregas: 1,
    qtd_nfs: 1,
    peso: 0,
    valor: 0,
  }
}

function numCoord(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function normalizeClientesDistribuicao(raw: unknown): ClienteDistribuicao[] {
  if (!Array.isArray(raw)) return []
  const out: ClienteDistribuicao[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const nome = String(o.nome ?? '').trim()
    const endereco = String(o.endereco ?? '').trim()
    const cidade = String(o.cidade ?? '').trim()
    const qtdNf = Math.max(0, Math.round(Number(o.qtd_nfs) || 0))
    const qtdEnt = Math.max(0, Math.round(Number(o.qtd_entregas) || 0))
    const valor = Number(o.valor)
    const peso = Number(o.peso)
    const tipo = o.tipo === 'cidade' ? 'cidade' : 'cliente'
    out.push({
      id: String(o.id || newClienteDistribuicaoId()),
      nome: nome || cidade || endereco,
      endereco: endereco || undefined,
      cnpj: String(o.cnpj ?? '').trim() || undefined,
      cidade: cidade || undefined,
      lat: numCoord(o.lat),
      lng: numCoord(o.lng),
      pedido: String(o.pedido ?? '').trim() || undefined,
      tipo,
      qtd_entregas: qtdEnt > 0 ? qtdEnt : 1,
      qtd_nfs: qtdNf > 0 ? qtdNf : 1,
      peso: Number.isFinite(peso) && peso >= 0 ? peso : 0,
      valor: Number.isFinite(valor) && valor >= 0 ? valor : 0,
    })
  }
  return out
}

export function normalizeCarga(c: Carga): Carga {
  return {
    ...c,
    grupo_ids: Array.isArray(c.grupo_ids) ? c.grupo_ids : [],
    grupos_notificados: Array.isArray(c.grupos_notificados) ? c.grupos_notificados : [],
    org_embarcador_id: c.org_embarcador_id ?? null,
    org_unidade_id: c.org_unidade_id ?? null,
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
    marca_rastreador: typeof c.marca_rastreador === 'string' ? c.marca_rastreador : c.marca_rastreador,
    modelo_rastreador: typeof c.modelo_rastreador === 'string' ? c.modelo_rastreador : undefined,
    marca_localizador:
      typeof c.marca_localizador === 'string' ? c.marca_localizador : c.marca_localizador,
    modelo_localizador:
      typeof c.modelo_localizador === 'string' ? c.modelo_localizador : undefined,
    temp_min:
      c.temp_min != null && Number.isFinite(Number(c.temp_min)) ? Number(c.temp_min) : undefined,
    temp_max:
      c.temp_max != null && Number.isFinite(Number(c.temp_max)) ? Number(c.temp_max) : undefined,
    exige_ajudante: flagSim(c.exige_ajudante),
    antt: c.antt ?? null,
    tipo_oferta: asTipoOferta(c.tipo_oferta),
    nome_rota: typeof c.nome_rota === 'string' ? c.nome_rota.trim() : c.nome_rota,
    seq_distribuicao: asSeqDistribuicao(c.seq_distribuicao),
    qtd_nfs:
      c.qtd_nfs != null && Number.isFinite(Number(c.qtd_nfs))
        ? Math.max(0, Math.round(Number(c.qtd_nfs)))
        : c.qtd_nfs,
    clientes_distribuicao: normalizeClientesDistribuicao(c.clientes_distribuicao),
    tabela_frete_id: c.tabela_frete_id ?? null,
    tabela_frete_nome: typeof c.tabela_frete_nome === 'string' ? c.tabela_frete_nome : c.tabela_frete_nome,
    frete_minimo: c.frete_minimo ?? null,
    frete_maximo: c.frete_maximo ?? null,
    pausado_em: c.pausado_em ?? null,
    tempo_restante_ms: c.tempo_restante_ms ?? null,
    veiculo_id: c.veiculo_id ?? null,
    motorista_id: c.motorista_id ?? null,
    motivo_cancelamento: c.motivo_cancelamento ?? null,
    visualizado_por_ids: Array.isArray(c.visualizado_por_ids)
      ? c.visualizado_por_ids.filter((id): id is string => typeof id === 'string')
      : [],
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
    org_embarcador_id: null,
    org_unidade_id: null,
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
