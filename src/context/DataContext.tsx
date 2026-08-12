import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  DEMO_USERS,
  SEED_CARGAS,
  SEED_GRUPOS,
  SEED_MOTORISTAS,
  SEED_ROTAS,
  SEED_TRANSPORTADORES,
  SEED_VEICULOS,
} from '../data/seed'
import {
  calcularFreteOferta,
  calcularPrioridadeEModo,
  classificacaoPorPontuacao,
  PONTOS_ADERENCIA,
  roundMoney,
} from '../lib/businessRules'
import {
  hydrateConfigNegocio,
  limitesLance,
  loadConfigNegocio,
  saveConfigNegocio,
  type ConfigNegocio,
} from '../lib/configNegocio'
import {
  hydrateConfigTransportador,
  loadConfigTransportador,
  saveConfigTransportador,
  type ConfigTransportador,
} from '../lib/configTransportador'
import { montarPatchLocalizacaoAposViagem } from '../lib/atualizarLocalizacaoViagem'
import {
  localizacaoDaTransportadora,
  preencherVeiculosComOrigemTransportadora,
  veiculoSemLocalizacaoMapa,
} from '../lib/veiculoLocalizacao'
import { distribuirFrotaUltrafrio } from '../lib/distribuirFrotaUltrafrio'
import {
  lanceNaRodadaAtual,
  makeHist,
  normalizeCarga,
  resetNegociacaoFields,
} from '../lib/cargaDefaults'
import { normalizeMotorista, normalizeVeiculo } from '../lib/motoristaDefaults'
import { haEmpateDeValor, ordenarLancesParaVitoria } from '../lib/desempate'
import { enviarControleFretes } from '../lib/integracaoFretes'
import type {
  AppUser,
  Carga,
  ChatMensagem,
  GrupoTransportador,
  HistoricoEvento,
  HistoricoProposta,
  IntegracaoFrete,
  InteracaoPontuacao,
  Lance,
  ModoPublicacao,
  Motorista,
  NotificacaoInApp,
  Prioridade,
  Profile,
  Rota,
  TipoHistorico,
  Transportador,
  TransportadorDocumento,
  Veiculo,
} from '../types'
import {
  portalLogin,
  getPermissaoUsuario,
  hydratePermissoesMap,
  loadPortalAccounts,
  removePortalAccountsPorTransportador,
  savePortalAccounts,
  setPortalAccountAtivoPorTransportador,
  syncPortalAccounts,
  vincularContasAosTransportadores,
} from '../lib/portalAuth'
import {
  atualizarLogoTransportadorRemoto,
  carregarTransportadoresDoSupabase,
  salvarPerfilPublicoRemoto,
  submeterCadastroTransportador,
  type CadastroTransportadorInput,
} from '../lib/cadastroTransportador'
import { normalizePerfilPublico } from '../lib/perfilPublicoTransportador'
import { atualizarAvatarUsuarioRemoto, buscarAvatarUsuarioRemoto } from '../lib/userAvatar'
import { canonicalTransportadorId, sameTransportadorId } from '../lib/transportadorIds'
import { portalEmailRecusaCadastro } from '../lib/portalApi'
import {
  hydrateOrgTree,
  removeTransportadoraDaHierarquia,
  syncTransportadoraNaHierarquia,
} from '../lib/orgHierarchy'
import { hydratePagamentos } from '../lib/financeiroPagamentos'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import {
  carregarVeiculosDoSupabase,
  deleteVeiculoRemote,
  isUuid,
  mergeVeiculosLocalRemote,
  newVeiculoId,
  subirFotosVeiculo,
  upsertVeiculoRemote,
} from '../lib/veiculosSync'
import {
  carregarRotasDoSupabase,
  dedupeRotas,
  limparPontosPassagemRota,
  mergeRotasLocalRemote,
  newRotaId,
  rotasPendentesMigracao,
  upsertRotaRemote,
} from '../lib/rotasSync'
import {
  applySyncSlice,
  loadKanbanBackup,
  pickSyncSlice,
  pullKanbanSync,
  pushKanbanSync,
  saveKanbanBackup,
  sliceFingerprint,
  subscribeKanbanSync,
} from '../lib/kanbanSync'
import { alinharStatusComLances } from '../lib/kanbanColumns'
import { enviarPushCarga, textoPushNovaCarga } from '../lib/webPush'

const STORAGE_KEY = 'doca-livre-data-v8'
const STORAGE_KEY_LEGACY = 'doca-livre-data-v7'
const STORAGE_KEY_LEGACY2 = 'doca-livre-data-v6'
const AUTH_KEY = 'doca-livre-auth-v1'
/** '1' = manter login no aparelho (localStorage); senão só na aba (sessionStorage) */
const AUTH_PERSIST_KEY = 'doca-livre-auth-persist'
/** Uma vez: zera Kanban (cargas/lances) ao migrar para v8 */
const KANBAN_WIPE_KEY = 'doca-livre-kanban-wipe-v8'

interface PublishPayload {
  cargaId: string
  margemPercentual: number
  grupoIds: string[]
  prazoLeilaoMinutos: number
  prazoAlocacaoMinutos: number
  /** Escolha manual na UI; se omitido, segue a regra do prazo. */
  modoPublicacao?: ModoPublicacao
  /** Escolha manual quando a regra automática está desligada. */
  prioridade?: Prioridade
  justificativaMotivo?: string
  justificativaObs?: string
  observacao?: string
  /** Se true, só o 1º grupo vê agora; demais na metade do prazo. */
  escalonarGrupos?: boolean
  /** Destinatários no modo Negociação Direta. */
  transportadorDiretoIds?: string[]
}

interface DataState {
  cargas: Carga[]
  lances: Lance[]
  transportadores: Transportador[]
  veiculos: Veiculo[]
  motoristas: Motorista[]
  documentos: TransportadorDocumento[]
  grupos: GrupoTransportador[]
  rotas: Rota[]
  historico: HistoricoEvento[]
  historicoPropostas: HistoricoProposta[]
  integracoes: IntegracaoFrete[]
  interacoes: InteracaoPontuacao[]
  notificacoes: NotificacaoInApp[]
  mensagens: ChatMensagem[]
  /** Chave `userId:cargaId` → ISO da última leitura do chat */
  chatLeituras: Record<string, string>
  /** Rascunhos excluídos (tombstones p/ sync) */
  cargas_excluidas: string[]
  /** Transportadoras excluídas (tombstones p/ sync e seeds) */
  transportadores_excluidos: string[]
  /** Placas excluídas (tombstones p/ sync) */
  veiculos_excluidos: string[]
  /** Motoristas excluídos (tombstones p/ sync) */
  motoristas_excluidos: string[]
}

interface AuthState {
  user: Profile | null
  login: (
    identificador: string,
    password: string,
    opts?: { persistSession?: boolean },
  ) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  demoUsers: AppUser[]
  refreshPermissoes: () => void
}

interface DataContextValue extends DataState, AuthState {
  tick: number
  config: ConfigNegocio
  salvarConfig: (cfg: ConfigNegocio) => void
  /** Preferências da transportadora logada (ou “ver como”). */
  configTransportador: ConfigTransportador
  salvarConfigTransportador: (cfg: ConfigTransportador) => void
  publicarCarga: (
    payload: PublishPayload,
  ) => { ok: boolean; error?: string; pushEnviados?: number; pushAviso?: string }
  enviarLance: (
    cargaId: string,
    valor: number,
    opts?: { aceitarOferta?: boolean },
  ) => { ok: boolean; error?: string }
  aceitarLance: (lanceId: string) => { ok: boolean; error?: string }
  rejeitarLance: (lanceId: string) => { ok: boolean; error?: string }
  encerrarComMelhorLance: (cargaId: string) => { ok: boolean; error?: string }
  finalizarNegociacao: (cargaId: string) => { ok: boolean; error?: string }
  enviarContraProposta: (
    lanceId: string,
    valor: number,
  ) => { ok: boolean; error?: string }
  aguardarMelhoresOfertas: (
    cargaId: string,
    minutosExtra?: number,
  ) => { ok: boolean; error?: string }
  cancelarPublicacao: (cargaId: string, motivo?: string) => { ok: boolean; error?: string }
  suspenderCarga: (cargaId: string) => { ok: boolean; error?: string }
  retomarCarga: (cargaId: string) => { ok: boolean; error?: string }
  republicarCarga: (cargaId: string) => { ok: boolean; error?: string }
  reabrirNegociacao: (cargaId: string, prazoMinutos?: number) => { ok: boolean; error?: string }
  /** Arrastar card no Kanban Minerva (coluna destino) */
  moverCargaKanban: (
    cargaId: string,
    targetColumn: string,
  ) => { ok: boolean; error?: string; needsPublish?: boolean }
  recusarCargaMinerva: (cargaId: string) => void
  recusarCargaTransportador: (
    cargaId: string,
  ) => { ok: boolean; error?: string }
  alocarComposicao: (
    cargaId: string,
    placa: string,
    motorista: string,
    opts?: { veiculoId?: string; motoristaId?: string },
  ) => Promise<{ ok: boolean; error?: string }>
  /** Aba Viagens — transportador inicia a rota. */
  iniciarViagem: (cargaId: string) => { ok: boolean; error?: string }
  finalizarViagem: (cargaId: string) => { ok: boolean; error?: string }
  cancelarViagem: (cargaId: string, motivo?: string) => { ok: boolean; error?: string }
  /** Embarcador avalia motorista + veículo após rota finalizada. */
  avaliarViagem: (
    cargaId: string,
    opts: { notaMotorista: number; notaVeiculo: number; comentario?: string },
  ) => Promise<{ ok: boolean; error?: string }>
  registrarVisualizacao: (cargaId: string) => void
  notificarTodosGrupos: (cargaId: string) => void
  salvarGrupo: (grupo: GrupoTransportador) => void
  salvarTransportador: (t: Transportador) => void
  /** Envia, troca ou remove logo/foto do transportador (file=null remove). */
  atualizarLogoTransportador: (
    transportadorId: string,
    file: File | null,
  ) => Promise<{ ok: boolean; error?: string }>
  /** Foto de perfil do usuário logado (Super sem empresa também). file=null remove. */
  atualizarAvatarPerfil: (
    file: File | null,
  ) => Promise<{ ok: boolean; error?: string }>
  excluirTransportador: (id: string) => Promise<{ ok: boolean; error?: string }>
  vinculosTransportador: (id: string) => {
    placas: string[]
    motoristas: string[]
    documentos: number
    grupos: string[]
    lances: number
    cargasVencedor: string[]
  }
  salvarVeiculo: (v: Veiculo) => void
  excluirVeiculo: (id: string) => void
  salvarMotorista: (m: Motorista) => void
  excluirMotorista: (id: string) => void
  salvarRota: (r: Rota) => void
  criarCarga: (partial?: Partial<Carga>) => Carga
  atualizarCarga: (
    id: string,
    patch: Partial<Carga>,
  ) => { ok: boolean; error?: string }
  /** Remove rascunho ainda não publicado */
  excluirCargaRascunho: (cargaId: string) => { ok: boolean; error?: string }
  /** Super: transportadora usada para lances / Kanban (Ver como) */
  actingTransportadorId: string | null
  setActingTransportadorId: (id: string | null) => void
  effectiveTransportadorId: () => string | null
  lancesDaCarga: (cargaId: string) => Lance[]
  historicoPropostasDaCarga: (cargaId: string) => HistoricoProposta[]
  transportadorById: (id: string) => Transportador | undefined
  cargasVisiveisTransportador: (transportadorId: string) => Carga[]
  documentosDoTransportador: (transportadorId: string) => TransportadorDocumento[]
  excluirDocumentoTransportador: (
    documentoId: string,
  ) => Promise<{ ok: boolean; error?: string }>
  substituirDocumentoTransportador: (
    documentoId: string,
    file: File,
  ) => Promise<{ ok: boolean; error?: string }>
  historicoDoTransportador: (transportadorId: string) => HistoricoEvento[]
  rankingTransportadores: () => Transportador[]
  motoristasDoTransportador: (transportadorId: string) => Motorista[]
  marcarNotificacaoLida: (id: string) => void
  marcarTodasNotificacoesLidas: () => void
  mensagensDaCarga: (cargaId: string) => ChatMensagem[]
  enviarMensagemCarga: (cargaId: string, texto: string) => { ok: boolean; error?: string }
  /** Mensagens de terceiros ainda não lidas nesta carga */
  mensagensNaoLidasDaCarga: (cargaId: string) => number
  marcarChatLido: (cargaId: string) => void
  registrarCadastroTransportador: (
    input: CadastroTransportadorInput,
  ) => Promise<{ ok: boolean; error?: string; mensagem?: string }>
  /** Recarrega transportadoras/docs do Supabase (fila de aprovação). */
  refreshTransportadores: () => Promise<void>
  /** Força pull do kanban_sync (útil se o embarcador abriu com board vazio). */
  forcarSincronizarKanban: () => Promise<{ ok: boolean; error?: string }>
  /** Liga/desliga todas as placas da transportadora no mapa (atalho). */
  setDisponivelMapa: (
    transportadorId: string,
    disponivel: boolean,
  ) => Promise<{ ok: boolean; error?: string }>
  /** Liga/desliga uma placa específica no Mapa da Frota. */
  setDisponivelMapaVeiculo: (
    veiculoId: string,
    disponivel: boolean,
  ) => Promise<{ ok: boolean; error?: string }>
  aprovarTransportador: (id: string) => Promise<{ ok: boolean; error?: string }>
  recusarTransportador: (
    id: string,
    motivo?: string,
  ) => Promise<{ ok: boolean; error?: string; mensagem?: string }>
}

const DataContext = createContext<DataContextValue | null>(null)

function defaultState(): DataState {
  return {
    // Kanban começa vazio — cadastros (grupos, rotas, transportadores) permanecem
    cargas: [],
    lances: [],
    transportadores: structuredClone(SEED_TRANSPORTADORES),
    veiculos: structuredClone(SEED_VEICULOS),
    motoristas: structuredClone(SEED_MOTORISTAS).map(normalizeMotorista),
    documentos: [],
    grupos: structuredClone(SEED_GRUPOS),
    rotas: structuredClone(SEED_ROTAS),
    historico: [],
    historicoPropostas: [],
    integracoes: [],
    interacoes: [],
    notificacoes: [],
    mensagens: [],
    chatLeituras: {},
    cargas_excluidas: [],
    transportadores_excluidos: [],
    veiculos_excluidos: [],
    motoristas_excluidos: [],
  }
}

function slugEmpresa(valor: string): string {
  return (valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

/** Corrige placas apontando para id antigo da mesma empresa (CNPJ/nome). */
function alinharVeiculosAoTransportador(
  veiculos: Veiculo[],
  transportadores: Transportador[],
  transportadorId: string,
): Veiculo[] {
  const minha = transportadores.find((t) => t.id === transportadorId)
  if (!minha) return veiculos
  const meuCnpj = (minha.cnpj || '').replace(/\D/g, '')
  const meuNome = slugEmpresa(minha.nome_fantasia || minha.razao_social || '')
  let mudou = false
  const next = veiculos.map((v) => {
    if (!v.transportador_id || v.transportador_id === transportadorId) return v
    const emp = transportadores.find((t) => t.id === v.transportador_id)
    if (!emp) return v
    const cnpj = (emp.cnpj || '').replace(/\D/g, '')
    if (meuCnpj && cnpj && meuCnpj === cnpj) {
      mudou = true
      return { ...v, transportador_id: transportadorId }
    }
    const nome = slugEmpresa(emp.nome_fantasia || emp.razao_social || '')
    if (meuNome.length >= 5 && nome.length >= 5 && (meuNome.includes(nome) || nome.includes(meuNome))) {
      mudou = true
      return { ...v, transportador_id: transportadorId }
    }
    return v
  })
  return mudou ? next : veiculos
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

/** Rascunho só na UI — ainda não entrou em `cargas` / sync. */
export function isCargaEphemeral(c: Pick<Carga, 'id'> | null | undefined): boolean {
  return Boolean(c?.id?.startsWith('draft-'))
}

/** Monta rascunho. `persistir: false` = só tela (Nova carga); `true` = id definitivo. */
export function montarNovaCarga(
  partial?: Partial<Carga>,
  criadoPor?: string | null,
  opts?: { persistir?: boolean },
): Carga {
  const persistir = opts?.persistir === true
  const id = persistir
    ? partial?.id && !isCargaEphemeral(partial)
      ? partial.id
      : uid('c')
    : uid('draft')
  const numero =
    partial?.numero || String(128688 + Math.floor(Math.random() * 9000))
  return {
    id,
    numero,
    pedido: '',
    ordem: `O/${69000 + Math.floor(Math.random() * 900)}-1`,
    tipo_carga: 'Carga seca',
    veiculo: '',
    carrocerias: [],
    remetente: 'DOCA LIVRE OFERTA DE CARGA',
    remetente_cnpj: '67.620.377/0001-00',
    origem: '',
    destino: '',
    origem_lat: null,
    origem_lng: null,
    destino_lat: null,
    destino_lng: null,
    pontos_passagem: [],
    complemento: undefined,
    carga_retorno: false,
    retorna_origem: false,
    destinatario: '',
    destinatario_cnpj: '',
    destinatario_whatsapp: '',
    destinatario_email: '',
    peso: 0,
    volumes: 0,
    num_entregas: 1,
    pallets: 0,
    valor_mercadorias: 0,
    frete_tabela: 0,
    frete_oferta: null,
    frete_minimo: null,
    frete_maximo: null,
    margem_percentual: null,
    data_carregamento: new Date(Date.now() + 86400000).toISOString(),
    previsao_entrega: new Date(Date.now() + 172800000).toISOString(),
    rota_id: null,
    classificacao_rota: 'B',
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
    placa: null,
    motorista: null,
    veiculo_id: null,
    motorista_id: null,
    criado_por: criadoPor ?? null,
    visualizacoes: 0,
    recusas: 0,
    created_at: new Date().toISOString(),
    ...partial,
    id,
    numero: partial?.numero || numero,
    status: 'nova_carga',
    publicado_em: null,
    criado_por: partial?.criado_por ?? criadoPor ?? null,
  }
}

function makeHistorico(
  tipo: TipoHistorico,
  titulo: string,
  extra?: Partial<HistoricoEvento>,
  user?: Profile | null,
): HistoricoEvento {
  return makeHist(uid, tipo, titulo, extra, user)
}

function pushNotif(
  list: NotificacaoInApp[],
  n: Omit<NotificacaoInApp, 'id' | 'lida' | 'created_at'> & { lida?: boolean },
): NotificacaoInApp[] {
  if (n.chave) {
    const existe = list.some((x) => x.chave === n.chave)
    if (existe) return list
  }
  const agora = new Date().toISOString()
  return [
    {
      id: uid('ntf'),
      lida: false,
      created_at: agora,
      updated_at: agora,
      ...n,
    },
    ...list,
  ].slice(0, 300)
}

/** IDs ativos dos grupos — usados no push mobile ao publicar. */
function tidsAtivosDosGrupos(
  grupos: GrupoTransportador[],
  grupoIds: string[],
  transportadores: Transportador[],
): string[] {
  const ativos = new Set(
    transportadores.filter((t) => t.situacao !== 'inativo').map((t) => t.id),
  )
  const out = new Set<string>()
  for (const g of grupos) {
    if (g.situacao === 'inativo') continue
    if (!grupoIds.includes(g.id)) continue
    for (const tid of g.transportador_ids ?? []) {
      if (ativos.has(tid)) out.add(tid)
    }
  }
  return [...out]
}

async function dispararPushNovaCarga(
  tids: string[],
  carga: {
    id?: string
    numero?: string | null
    origem?: string | null
    destino?: string | null
    frete_oferta?: number | null
    frete_tabela?: number | null
  },
  titulo = 'Nova oferta de carga',
): Promise<{ enviados: number; erro?: string }> {
  if (tids.length === 0) return { enviados: 0 }
  // Respeita preferência “Nova oferta” de cada transportadora
  const filtrados = tids.filter((tid) => loadConfigTransportador(tid).notif_nova_oferta)
  if (filtrados.length === 0) return { enviados: 0 }
  const res = await enviarPushCarga({
    transportadorIds: filtrados,
    titulo,
    mensagem: textoPushNovaCarga(carga),
    cargaId: carga.id,
    url: '/#/transportador',
  })
  return { enviados: res.enviados ?? 0, erro: res.erro }
}

function notifCadastroPendente(t: {
  id: string
  nome_fantasia: string
  cnpj?: string
}): Omit<NotificacaoInApp, 'id' | 'lida' | 'created_at'> {
  const cnpj = (t.cnpj || '').trim()
  return {
    role: 'minerva',
    titulo: 'Cadastro pendente de aprovação',
    mensagem: cnpj
      ? `${t.nome_fantasia} (${cnpj}) aguarda revisão na fila de transportadoras.`
      : `${t.nome_fantasia} aguarda revisão na fila de transportadoras.`,
    href: '/embarcador/transportadores?filtro=pendentes',
    chave: `cadastro-pendente:${t.id}`,
  }
}

/** Notificação destinada ao usuário atual (não marca lida a do outro lado do chat). */
function notifDestinadaAoUsuario(
  n: NotificacaoInApp,
  user: Profile,
  actingTransportadorId: string | null,
): boolean {
  const tid = actingTransportadorId || user.transportador_id || null
  if (n.user_id) return n.user_id === user.id
  if (n.transportador_id) return Boolean(tid && n.transportador_id === tid)
  if (n.role === 'todos') return true
  if (n.role === 'minerva') {
    // Lado embarcador → só Super
    if (actingTransportadorId) return false
    return user.role === 'super' || Boolean(user.is_superuser)
  }
  if (n.role === 'transportador') {
    if (n.transportador_id) return Boolean(tid && n.transportador_id === tid)
    return user.role === 'transportador' || Boolean(actingTransportadorId)
  }
  if (!n.user_id && !n.transportador_id && !n.role) {
    return user.role === 'super' || Boolean(user.is_superuser)
  }
  return false
}

function isNotifChat(n: NotificacaoInApp): boolean {
  return (n.titulo ?? '').toLowerCase().includes('mensagem')
}

function normalizeCargasNegociacao(
  cargas: Carga[],
  grupos: GrupoTransportador[],
): Carga[] {
  const gruposAtivos = grupos.filter((g) => g.situacao === 'ativo').map((g) => g.id)
  const now = Date.now()
  return cargas.map((c) => {
    if (!['negociando', 'propostas', 'suspensas'].includes(c.status)) return c
    // Negociação direta não usa grupos — não preencher grupo_ids automaticamente
    if (c.modo_publicacao === 'negociacao_direta') return c
    let grupo_ids = c.grupo_ids ?? []
    let grupos_notificados = c.grupos_notificados ?? []
    // Cargas publicadas sem grupo (dados antigos) — abre para todos os grupos ativos
    if (grupo_ids.length === 0 && gruposAtivos.length > 0) {
      grupo_ids = [...gruposAtivos]
    }
    if (grupos_notificados.length === 0 && grupo_ids.length > 0) {
      grupos_notificados = [...grupo_ids]
    }

    // Janela expirada sem vencedor: renova o prazo (evita Kanban transportador vazio no demo)
    let expira_em = c.expira_em
    let status = c.status
    if (
      !c.transportador_vencedor_id &&
      ['negociando', 'propostas'].includes(c.status) &&
      c.expira_em &&
      new Date(c.expira_em).getTime() <= now
    ) {
      const prazoMs = Math.max(10, c.prazo_leilao_minutos ?? 60) * 60_000
      expira_em = new Date(now + prazoMs).toISOString()
    }

    if (
      grupo_ids === c.grupo_ids &&
      grupos_notificados === c.grupos_notificados &&
      expira_em === c.expira_em &&
      status === c.status
    ) {
      return c
    }
    return { ...c, grupo_ids, grupos_notificados, expira_em, status }
  })
}

/** Cancela lances de rodadas anteriores (created_at < publicado_em). */
function cancelarLancesForaDaRodada(cargas: Carga[], lances: Lance[]): Lance[] {
  return lances.map((l) => {
    const carga = cargas.find((c) => c.id === l.carga_id)
    if (!carga?.publicado_em) return l
    if (!['ativo', 'vencedor', 'perdido'].includes(l.status)) return l
    if (lanceNaRodadaAtual(l, carga)) return l
    return { ...l, status: 'cancelado' as const, updated_at: new Date().toISOString() }
  })
}

function cancelarLancesDaCarga(lances: Lance[], cargaId: string, nowIso: string): Lance[] {
  return lances.map((l) =>
    l.carga_id === cargaId && l.status !== 'cancelado'
      ? { ...l, status: 'cancelado' as const, updated_at: nowIso }
      : l,
  )
}

/** Garante frota demo (origem + motorista + veículo) para o Mapa da Frota. */
/** Placas Ultrafrio redistribuídas no último ensureDemoFrotaMapa (para upsert remoto). */
const ultrafrioAlteradosPendentesRef: { current: Veiculo[] } = { current: [] }

function ensureDemoFrotaMapa(state: DataState): DataState {
  // Excluídas manualmente não voltam pelo seed
  const excluidos = new Set(state.transportadores_excluidos ?? [])
  const seedT = structuredClone(SEED_TRANSPORTADORES).filter((t) => !excluidos.has(t.id))
  const seedV = structuredClone(SEED_VEICULOS)
    .filter((v) => !v.transportador_id || !excluidos.has(v.transportador_id))
    .map(normalizeVeiculo)
  const seedM = structuredClone(SEED_MOTORISTAS)
    .filter((m) => !m.transportador_id || !excluidos.has(m.transportador_id))
    .map(normalizeMotorista)

  const tMap = new Map(state.transportadores.map((t) => [t.id, t]))
  for (const s of seedT) {
    const cur = tMap.get(s.id)
    if (!cur) {
      tMap.set(s.id, s)
      continue
    }
    const perfilVazio =
      !cur.perfil_publico ||
      (!(cur.perfil_publico.apresentacao || '').trim() &&
        !(cur.perfil_publico.servicos?.length) &&
        !(cur.perfil_publico.especialidades?.length))
    tMap.set(s.id, {
      ...s,
      ...cur,
      // Não deixa sync remoto vazio apagar endereço do seed/local
      endereco: cur.endereco || s.endereco,
      numero: cur.numero || s.numero,
      bairro: cur.bairro || s.bairro,
      complemento: cur.complemento || s.complemento,
      cep: cur.cep || s.cep,
      origem_lat: cur.origem_lat ?? s.origem_lat ?? null,
      origem_lng: cur.origem_lng ?? s.origem_lng ?? null,
      origem_cidade: cur.origem_cidade || s.origem_cidade,
      origem_uf: cur.origem_uf || s.origem_uf,
      origem_endereco: cur.origem_endereco || s.origem_endereco || cur.endereco || s.endereco,
      origem_numero: cur.origem_numero || s.origem_numero || cur.numero || s.numero,
      origem_bairro: cur.origem_bairro || s.origem_bairro || cur.bairro || s.bairro,
      origem_complemento:
        cur.origem_complemento || s.origem_complemento || cur.complemento || s.complemento,
      origem_cep: cur.origem_cep || s.origem_cep || cur.cep || s.cep,
      raio_km: cur.raio_km ?? s.raio_km,
      disponivel_mapa: cur.disponivel_mapa ?? s.disponivel_mapa,
      situacao: cur.situacao === 'inativo' ? 'ativo' : cur.situacao,
      // Contas demo sem perfil preenchido recebem o conteúdo fictício do seed
      perfil_publico: perfilVazio ? s.perfil_publico : cur.perfil_publico,
      contato_nome: cur.contato_nome || s.contato_nome,
      contato_telefone: cur.contato_telefone || s.contato_telefone,
      inscricao_estadual: cur.inscricao_estadual || s.inscricao_estadual,
      rntrc: cur.rntrc || s.rntrc,
    })
  }

  const vMap = new Map((state.veiculos ?? []).map((v) => [v.id, v]))
  for (const s of seedV) {
    const cur = vMap.get(s.id)
    if (!cur) {
      vMap.set(s.id, s)
      continue
    }
    vMap.set(s.id, {
      ...s,
      ...cur,
      transportador_id: cur.transportador_id || s.transportador_id,
      frete_minimo: cur.frete_minimo ?? s.frete_minimo,
      disponivel_mapa:
        cur.disponivel_mapa === false || cur.disponivel_mapa === true
          ? cur.disponivel_mapa
          : (s.disponivel_mapa ?? true),
      situacao: cur.situacao || s.situacao,
    })
  }

  const mMap = new Map((state.motoristas ?? []).map((m) => [m.id, m]))
  for (const s of seedM) {
    const cur = mMap.get(s.id)
    if (!cur) {
      mMap.set(s.id, s)
      continue
    }
    mMap.set(s.id, {
      ...s,
      ...cur,
      transportador_id: cur.transportador_id || s.transportador_id,
      veiculo_id: cur.veiculo_id || s.veiculo_id,
      foto_url: cur.foto_url || s.foto_url,
      avaliacao: cur.avaliacao ?? s.avaliacao,
      total_avaliacoes: cur.total_avaliacoes ?? s.total_avaliacoes,
      situacao: cur.situacao || s.situacao,
    })
  }

  const transportadores = Array.from(tMap.values())
  const { veiculos: comOrigem } = preencherVeiculosComOrigemTransportadora(
    Array.from(vMap.values()),
    transportadores,
  )
  // Espalha 50 placas da Ultrafrio Log em endereços distintos no mapa
  const { veiculos, alterados } = distribuirFrotaUltrafrio(
    comOrigem,
    transportadores,
    50,
  )
  ultrafrioAlteradosPendentesRef.current = alterados

  return {
    ...state,
    transportadores,
    veiculos,
    motoristas: Array.from(mMap.values()),
  }
}

/**
 * Corrige duplicidade histórica: as contas demo (Santos/Nova Era) migraram de IDs
 * curtos (t1/t2) para UUIDs. Quem já tinha dados salvos localmente antes da migração
 * acaba com as DUAS versões simultâneas no array de transportadores (aparecem
 * repetidas, por exemplo, ao montar um grupo). Aqui mantemos um único registro por
 * transportador (preferindo o UUID canônico) e remapeamos as referências
 * (motoristas, veículos, documentos, lances, grupos, cargas) para o id mantido.
 */
function unificarTransportadoresDuplicados(state: DataState): DataState {
  const porCanonico = new Map<string, Transportador[]>()
  for (const t of state.transportadores) {
    const chave = canonicalTransportadorId(t.id) ?? t.id
    const lista = porCanonico.get(chave)
    if (lista) lista.push(t)
    else porCanonico.set(chave, [t])
  }

  if (!Array.from(porCanonico.values()).some((lista) => lista.length > 1)) return state

  const remap = new Map<string, string>()
  const transportadoresFinal: Transportador[] = []
  for (const [chave, lista] of porCanonico) {
    if (lista.length === 1) {
      transportadoresFinal.push(lista[0])
      continue
    }
    const vencedor =
      lista.find((t) => t.id === chave) ?? lista.find((t) => t.situacao === 'ativo') ?? lista[0]
    transportadoresFinal.push({ ...lista[0], ...vencedor, id: vencedor.id })
    for (const t of lista) {
      if (t.id !== vencedor.id) remap.set(t.id, vencedor.id)
    }
  }

  if (remap.size === 0) return { ...state, transportadores: transportadoresFinal }
  const remapId = <T extends string | null | undefined>(id: T): T =>
    (id != null && remap.has(id) ? (remap.get(id) as T) : id)

  return {
    ...state,
    transportadores: transportadoresFinal,
    motoristas: (state.motoristas ?? []).map((m) =>
      m.transportador_id && remap.has(m.transportador_id)
        ? { ...m, transportador_id: remapId(m.transportador_id) }
        : m,
    ),
    veiculos: (state.veiculos ?? []).map((v) =>
      v.transportador_id && remap.has(v.transportador_id)
        ? { ...v, transportador_id: remapId(v.transportador_id) }
        : v,
    ),
    documentos: (state.documentos ?? []).map((d) =>
      remap.has(d.transportador_id) ? { ...d, transportador_id: remapId(d.transportador_id)! } : d,
    ),
    lances: (state.lances ?? []).map((l) =>
      remap.has(l.transportador_id) ? { ...l, transportador_id: remapId(l.transportador_id)! } : l,
    ),
    historicoPropostas: (state.historicoPropostas ?? []).map((h) =>
      remap.has(h.transportador_id) ? { ...h, transportador_id: remapId(h.transportador_id)! } : h,
    ),
    interacoes: (state.interacoes ?? []).map((i) =>
      remap.has(i.transportador_id) ? { ...i, transportador_id: remapId(i.transportador_id)! } : i,
    ),
    grupos: (state.grupos ?? []).map((g) => {
      const ids = (g.transportador_ids ?? []).map((id) => remapId(id))
      const unicos = Array.from(new Set(ids))
      const mudou =
        unicos.length !== (g.transportador_ids ?? []).length ||
        unicos.some((id, i) => id !== g.transportador_ids[i])
      return mudou ? { ...g, transportador_ids: unicos } : g
    }),
    cargas: (state.cargas ?? []).map((c) => {
      const novoVencedor = remapId(c.transportador_vencedor_id)
      const recusados = (c.recusado_por_ids ?? []).map((id) => remapId(id))
      const mudouRecusados =
        recusados.length !== (c.recusado_por_ids ?? []).length ||
        recusados.some((id, i) => id !== (c.recusado_por_ids ?? [])[i])
      if (novoVencedor === c.transportador_vencedor_id && !mudouRecusados) return c
      return {
        ...c,
        transportador_vencedor_id: novoVencedor,
        recusado_por_ids: mudouRecusados ? recusados : c.recusado_por_ids,
      }
    }),
  }
}

/** Garante frota/oferta demo sem mexer nos membros dos grupos criados pelo usuário. */
function ensureDemoOfertasVisiveis(state: DataState): DataState {
  const withFrota = unificarTransportadoresDuplicados(ensureDemoFrotaMapa(state))
  const excluidos = new Set(withFrota.transportadores_excluidos ?? [])
  const DEMO_TIDS = [
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
  ].filter((id) => !excluidos.has(id))

  // Não injeta demos em grupos existentes — o usuário controla os membros.
  let grupos = withFrota.grupos
  if (grupos.length === 0) {
    grupos = structuredClone(SEED_GRUPOS)
  }

  let cargas = withFrota.cargas
  const temOfertaAberta = cargas.some(
    (c) =>
      !c.transportador_vencedor_id &&
      Boolean(c.publicado_em) &&
      ['negociando', 'propostas', 'suspensas'].includes(c.status),
  )
  const DEMO_CARGA_ID = 'demo-oferta-aberta'
  if (!temOfertaAberta && !cargas.some((c) => c.id === DEMO_CARGA_ID)) {
    const modelo = SEED_CARGAS.find((c) => c.id === 'c2')
    if (modelo) {
      const agora = new Date()
      cargas = [
        ...cargas,
        {
          ...structuredClone(modelo),
          id: DEMO_CARGA_ID,
          numero: '900001',
          pedido: 'DEMO-11167527',
          status: 'negociando',
          publicado_em: agora.toISOString(),
          expira_em: new Date(agora.getTime() + 24 * 60 * 60_000).toISOString(),
          grupo_ids: grupos.filter((g) => g.situacao !== 'inativo').map((g) => g.id),
          grupos_notificados: grupos
            .filter((g) => g.situacao !== 'inativo')
            .map((g) => g.id),
          observacao: 'Oferta demonstrativa para validação das contas Santos e Nova Era.',
          created_at: agora.toISOString(),
        },
      ]
    }
  }
  cargas = normalizeCargasNegociacao(cargas, grupos)
  // Não cancelar lances aqui — republicar/reabrir já cancela a rodada antiga.
  // cancelarLancesForaDaRodada neste ponto apagava propostas ativas no sync/reload.
  let lances = withFrota.lances
  cargas = alinharStatusComLances(cargas, lances)

  let transportadores = withFrota.transportadores
  for (const tid of DEMO_TIDS) {
    const t = transportadores.find((x) => sameTransportadorId(x.id, tid))
    if (t && t.situacao === 'inativo') {
      transportadores = transportadores.map((x) =>
        sameTransportadorId(x.id, tid) ? { ...x, situacao: 'ativo' as const } : x,
      )
    }
  }

  return {
    ...withFrota,
    cargas,
    lances,
    grupos,
    transportadores,
    veiculos: withFrota.veiculos,
    motoristas: withFrota.motoristas,
  }
}

function wipeKanbanFields<T extends DataState>(state: T): T {
  return {
    ...state,
    cargas: [],
    lances: [],
    historicoPropostas: [],
    mensagens: [],
    notificacoes: [],
    historico: [],
    integracoes: [],
    interacoes: [],
    chatLeituras: {},
    cargas_excluidas: [],
    transportadores_excluidos: state.transportadores_excluidos ?? [],
    veiculos_excluidos: state.veiculos_excluidos ?? [],
    motoristas_excluidos: state.motoristas_excluidos ?? [],
  }
}

function loadState(): DataState {
  // Estado inicial em memória; a fonte da verdade é o Supabase (kanban_sync + tabelas).
  // Migração única: se ainda houver blob local, usa como base e apaga as chaves.
  const defaults = defaultState()
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(STORAGE_KEY_LEGACY) ??
      localStorage.getItem(STORAGE_KEY_LEGACY2)

    // Backup da aba (F5): restaura lances/cargas/rotas até o pull remoto
    const backup = loadKanbanBackup()
    if (
      !raw &&
      backup &&
      (backup.cargas?.length ||
        backup.lances?.length ||
        backup.rotas?.length ||
        backup.veiculos?.length ||
        backup.grupos?.length)
    ) {
      const fromBackup = ensureDemoOfertasVisiveis(
        applySyncSlice(defaults, backup) as DataState,
      )
      return fromBackup
    }

    if (!raw) return ensureDemoOfertasVisiveis(defaults)
    const parsed = JSON.parse(raw) as Partial<DataState>
    const grupos = Array.isArray(parsed.grupos) ? parsed.grupos : defaults.grupos
    const cargasRaw = Array.isArray(parsed.cargas)
      ? parsed.cargas.map(normalizeCarga)
      : defaults.cargas
    let loaded: DataState = {
      cargas: normalizeCargasNegociacao(cargasRaw, grupos),
      lances: Array.isArray(parsed.lances) ? parsed.lances : defaults.lances,
      transportadores: Array.isArray(parsed.transportadores)
        ? parsed.transportadores
        : defaults.transportadores,
      veiculos: Array.isArray(parsed.veiculos)
        ? parsed.veiculos.map(normalizeVeiculo)
        : defaults.veiculos,
      motoristas: Array.isArray(parsed.motoristas)
        ? parsed.motoristas.map(normalizeMotorista)
        : defaults.motoristas,
      documentos: Array.isArray(parsed.documentos) ? parsed.documentos : defaults.documentos,
      grupos,
      rotas: dedupeRotas(Array.isArray(parsed.rotas) ? parsed.rotas : defaults.rotas),
      historico: Array.isArray(parsed.historico) ? parsed.historico : [],
      historicoPropostas: Array.isArray(parsed.historicoPropostas)
        ? parsed.historicoPropostas
        : [],
      integracoes: Array.isArray(parsed.integracoes) ? parsed.integracoes : [],
      interacoes: Array.isArray(parsed.interacoes) ? parsed.interacoes : [],
      notificacoes: Array.isArray(parsed.notificacoes) ? parsed.notificacoes : [],
      mensagens: Array.isArray(parsed.mensagens) ? parsed.mensagens : [],
      chatLeituras:
        parsed.chatLeituras && typeof parsed.chatLeituras === 'object'
          ? (parsed.chatLeituras as Record<string, string>)
          : {},
      cargas_excluidas: Array.isArray(parsed.cargas_excluidas)
        ? parsed.cargas_excluidas.filter((id): id is string => typeof id === 'string')
        : [],
      transportadores_excluidos: Array.isArray(parsed.transportadores_excluidos)
        ? parsed.transportadores_excluidos.filter((id): id is string => typeof id === 'string')
        : [],
      veiculos_excluidos: Array.isArray(parsed.veiculos_excluidos)
        ? parsed.veiculos_excluidos.filter((id): id is string => typeof id === 'string')
        : [],
      motoristas_excluidos: Array.isArray(parsed.motoristas_excluidos)
        ? parsed.motoristas_excluidos.filter((id): id is string => typeof id === 'string')
        : [],
    }
    // Tombstones locais sem cargas “vivas” costumam zerar o Kanban do embarcador no sync —
    // descarta a lista de excluídas na migração; o remoto manda a verdade.
    if (loaded.cargas.length === 0 && loaded.cargas_excluidas.length > 0) {
      loaded = { ...loaded, cargas_excluidas: [] }
    } else if (loaded.cargas_excluidas.length > 0) {
      const ex = new Set(loaded.cargas_excluidas)
      loaded = {
        ...loaded,
        cargas: loaded.cargas.filter((c) => !ex.has(c.id)),
        lances: loaded.lances.filter((l) => !ex.has(l.carga_id)),
      }
    }
    if (loaded.transportadores_excluidos.length > 0) {
      const tex = new Set(loaded.transportadores_excluidos)
      loaded = {
        ...loaded,
        transportadores: loaded.transportadores.filter((t) => !tex.has(t.id)),
        veiculos: loaded.veiculos.filter((v) => !tex.has(v.transportador_id ?? '')),
        motoristas: loaded.motoristas.filter((m) => !tex.has(m.transportador_id ?? '')),
        documentos: loaded.documentos.filter((d) => !tex.has(d.transportador_id)),
        lances: loaded.lances.filter((l) => !tex.has(l.transportador_id)),
        grupos: loaded.grupos.map((g) => ({
          ...g,
          transportador_ids: (g.transportador_ids ?? []).filter((tid) => !tex.has(tid)),
        })),
      }
    }
    // Apaga blob local — daqui pra frente só banco
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(STORAGE_KEY_LEGACY)
      localStorage.removeItem(STORAGE_KEY_LEGACY2)
      localStorage.removeItem(KANBAN_WIPE_KEY)
    } catch {
      /* ignore */
    }
    return ensureDemoOfertasVisiveis(loaded)
  } catch {
    return ensureDemoOfertasVisiveis(defaults)
  }
}

function isAuthPersistEnabled(): boolean {
  try {
    return localStorage.getItem(AUTH_PERSIST_KEY) === '1'
  } catch {
    return false
  }
}

function setAuthPersistEnabled(persist: boolean) {
  try {
    if (persist) localStorage.setItem(AUTH_PERSIST_KEY, '1')
    else localStorage.removeItem(AUTH_PERSIST_KEY)
  } catch {
    /* ignore */
  }
}

function persistAuthProfile(user: Profile | null) {
  try {
    if (!user) {
      sessionStorage.removeItem(AUTH_KEY)
      localStorage.removeItem(AUTH_KEY)
      return
    }
    const raw = JSON.stringify(user)
    if (isAuthPersistEnabled()) {
      localStorage.setItem(AUTH_KEY, raw)
      sessionStorage.removeItem(AUTH_KEY)
    } else {
      sessionStorage.setItem(AUTH_KEY, raw)
      localStorage.removeItem(AUTH_KEY)
    }
  } catch {
    /* ignore */
  }
}

function loadAuth(): Profile | null {
  try {
    const persist = isAuthPersistEnabled()
    // Com “salvar sessão”: localStorage; senão: só a aba atual
    const raw = persist
      ? localStorage.getItem(AUTH_KEY) ?? sessionStorage.getItem(AUTH_KEY)
      : sessionStorage.getItem(AUTH_KEY)
    if (!raw) return null
    const profile = JSON.parse(raw) as Profile
    // Equipe Minerva/embarcador removida — força novo login
    if (profile.role === 'minerva' && !profile.is_superuser) {
      sessionStorage.removeItem(AUTH_KEY)
      localStorage.removeItem(AUTH_KEY)
      return null
    }
    // Alinha storage ao modo atual (persiste ou só aba)
    try {
      if (persist) {
        localStorage.setItem(AUTH_KEY, raw)
        sessionStorage.removeItem(AUTH_KEY)
      }
    } catch {
      /* ignore */
    }
    return profile
  } catch {
    /* ignore */
  }
  return null
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>(loadState)
  const [user, setUser] = useState<Profile | null>(loadAuth)
  const [tick, setTick] = useState(0)
  const [config, setConfig] = useState<ConfigNegocio>(loadConfigNegocio)
  const [configTransportador, setConfigTransportador] = useState<ConfigTransportador>(
    () => loadConfigTransportador(null),
  )
  const [actingTransportadorId, setActingTransportadorId] = useState<string | null>(null)
  /** Snapshot síncrono — evita depender do updater do setState para retornar ok/erro */
  const stateRef = useRef(state)
  stateRef.current = state
  const userRef = useRef(user)
  userRef.current = user
  const applyingRemoteRef = useRef(false)
  /** Só libera push depois do 1º pull OK — evita apagar o remoto com estado inicial []. */
  const kanbanHydratedRef = useRef(false)
  const lastSyncFpRef = useRef('')
  const pushTimerRef = useRef<number | null>(null)
  const pendingPushRef = useRef(false)
  const applyRemoteRef = useRef<
    | ((payload: {
        slice: ReturnType<typeof pickSyncSlice>
        client_id: string
        updated_at: string
      }) => void)
    | null
  >(null)
  const healRemoteRef = useRef<(() => void) | null>(null)

  const flushKanbanPush = useCallback((next: typeof state) => {
    // Backup local imediato (antes do push) — F5 não perde lance/rota em andamento
    try {
      saveKanbanBackup(pickSyncSlice(next))
    } catch {
      /* ignore */
    }
    if (!isSupabaseConfigured) return
    if (!kanbanHydratedRef.current) return
    if (applyingRemoteRef.current) {
      pendingPushRef.current = true
      return
    }
    const slice = pickSyncSlice(next)
    const fp = sliceFingerprint(slice)
    if (fp === lastSyncFpRef.current) return

    const send = () => {
      if (pushTimerRef.current != null) {
        window.clearTimeout(pushTimerRef.current)
        pushTimerRef.current = null
      }
      // Só marca fingerprint após push OK — senão o heal não tenta de novo
      void pushKanbanSync(slice).then((ok) => {
        if (ok) {
          lastSyncFpRef.current = fp
          saveKanbanBackup(slice)
        }
      })
    }

    // Nunca gravar cargas: [] no Supabase (apaga o Kanban de todo mundo).
    // Mas também não pode apagar edição local de grupos: mescla cargas remotas e reenvia.
    if (slice.cargas.length === 0) {
      void pullKanbanSync().then((remote) => {
        if (
          remote.ok &&
          'payload' in remote &&
          remote.payload &&
          remote.payload.slice.cargas.length > 0
        ) {
          console.warn('[kanbanSync] push vazio bloqueado — mesclando cargas remotas (preserva grupos)')
          const payload = remote.payload
          applyingRemoteRef.current = true
          let mergedState: typeof state | null = null
          setState((prev) => {
            const next = ensureDemoOfertasVisiveis(applySyncSlice(prev, payload.slice))
            stateRef.current = next
            mergedState = next
            lastSyncFpRef.current = sliceFingerprint(pickSyncSlice(next))
            return next
          })
          window.setTimeout(() => {
            applyingRemoteRef.current = false
            // Reenvia com cargas remotas + grupos locais (já mesclados por updated_at)
            if (mergedState) flushKanbanPush(mergedState)
          }, 0)
        } else {
          // Remoto também sem cargas: permite gravar grupos/config
          send()
        }
      })
      return
    }

    send()
  }, [])

  const scheduleKanbanPush = useCallback(() => {
    if (!isSupabaseConfigured) return
    if (!kanbanHydratedRef.current) return
    if (applyingRemoteRef.current) {
      pendingPushRef.current = true
      return
    }
    if (pushTimerRef.current != null) window.clearTimeout(pushTimerRef.current)
    pushTimerRef.current = window.setTimeout(() => {
      pushTimerRef.current = null
      flushKanbanPush(stateRef.current)
    }, 150)
  }, [flushKanbanPush])

  const effectiveTransportadorId = useCallback(() => {
    // “Ver como” (acting) tem prioridade — senão Super não consegue trocar o Kanban
    return actingTransportadorId || user?.transportador_id || null
  }, [user?.transportador_id, actingTransportadorId])

  useEffect(() => {
    // Persistência operacional: apenas Supabase (kanban_sync + tabelas)
    scheduleKanbanPush()
  }, [state, scheduleKanbanPush])

  // Sync multi-usuário — nunca sobrescreve com vazio / erro de pull
  useEffect(() => {
    let cancelled = false
    let retryTimer: number | null = null

    const finishRemoteApply = () => {
      applyingRemoteRef.current = false
      if (pendingPushRef.current) {
        pendingPushRef.current = false
        flushKanbanPush(stateRef.current)
      }
    }

    const healRemoteFromLocal = () => {
      if (!kanbanHydratedRef.current) return
      if (stateRef.current.cargas.length === 0 && stateRef.current.lances.length === 0) return
      // Remoto vazio / desatualizado: republica o que este cliente ainda tem
      flushKanbanPush(stateRef.current)
    }
    healRemoteRef.current = healRemoteFromLocal

    const applyRemote = (payload: {
      slice: ReturnType<typeof pickSyncSlice>
      client_id: string
      updated_at: string
    }) => {
      // Remoto vazio não apaga o que já temos — e restaura o banco
      if (
        Array.isArray(payload.slice.cargas) &&
        payload.slice.cargas.length === 0 &&
        stateRef.current.cargas.length > 0
      ) {
        healRemoteFromLocal()
        return
      }
      const fp = sliceFingerprint(payload.slice)
      if (fp === lastSyncFpRef.current) return
      applyingRemoteRef.current = true
      setState((prev) => {
        const next = ensureDemoOfertasVisiveis(applySyncSlice(prev, payload.slice))
        stateRef.current = next
        lastSyncFpRef.current = sliceFingerprint(pickSyncSlice(next))
        saveKanbanBackup(pickSyncSlice(next))
        return next
      })
      window.setTimeout(finishRemoteApply, 0)
    }
    applyRemoteRef.current = applyRemote

    const bootstrap = async () => {
      if (localStorage.getItem(KANBAN_WIPE_KEY) !== '1') {
        localStorage.setItem(KANBAN_WIPE_KEY, '1')
      }

      const remote = await pullKanbanSync()
      if (cancelled) return

      if (!remote.ok) {
        // Erro de rede/SQL: NÃO sobrescreve o remoto com estado local vazio
        console.warn('[kanbanSync] bootstrap pull falhou — mantendo estado local')
        retryTimer = window.setTimeout(() => {
          retryTimer = null
          if (!cancelled) void bootstrap()
        }, 3000)
        return
      }

      // Libera push só após pull bem-sucedido
      kanbanHydratedRef.current = true

      if ('empty' in remote && remote.empty) {
        // Primeira vez: só faz seed remoto se houver algo local
        if (stateRef.current.cargas.length > 0 || stateRef.current.lances.length > 0) {
          const slice = pickSyncSlice(stateRef.current)
          lastSyncFpRef.current = sliceFingerprint(slice)
          await pushKanbanSync(slice)
        }
        return
      }
      if ('payload' in remote && remote.payload) {
        applyRemote(remote.payload)
      }
    }

    void bootstrap()

    const unsub = subscribeKanbanSync(
      (payload) => {
        applyRemote(payload)
      },
      () => {
        // Linha ausente / payload inválido no Supabase
        healRemoteFromLocal()
      },
    )

    return () => {
      cancelled = true
      unsub()
      applyRemoteRef.current = null
      healRemoteRef.current = null
      if (retryTimer != null) window.clearTimeout(retryTimer)
      if (pushTimerRef.current != null) window.clearTimeout(pushTimerRef.current)
    }
  }, [flushKanbanPush])

  const forcarSincronizarKanban = useCallback(async () => {
    const remote = await pullKanbanSync()
    if (!remote.ok) return { ok: false, error: remote.error }
    if ('empty' in remote && remote.empty) {
      healRemoteRef.current?.()
      return { ok: true }
    }
    if ('payload' in remote && remote.payload) {
      const payload = remote.payload
      // Aplica direto (não depende do ref do effect — evita race no embarcador)
      applyingRemoteRef.current = true
      setState((prev) => {
        const next = ensureDemoOfertasVisiveis(applySyncSlice(prev, payload.slice))
        stateRef.current = next
        lastSyncFpRef.current = sliceFingerprint(pickSyncSlice(next))
        kanbanHydratedRef.current = true
        return next
      })
      window.setTimeout(() => {
        applyingRemoteRef.current = false
      }, 0)
      return { ok: true }
    }
    return { ok: true }
  }, [])

  const refreshTransportadores = useCallback(async () => {
    const remote = await carregarTransportadoresDoSupabase()
    const remoteVeiculos = await carregarVeiculosDoSupabase()
    const remoteRotas = await carregarRotasDoSupabase()
    if (!remote && !remoteVeiculos && !remoteRotas) return
    let pushSlice: typeof stateRef.current | null = null
    setState((prev) => {
      const excluidos = new Set(prev.transportadores_excluidos ?? [])
      const byId = new Map(prev.transportadores.map((t) => [t.id, t]))
      let notificacoes = prev.notificacoes
      let notifNova = false
      if (remote) {
        for (const t of remote.transportadores) {
          if (excluidos.has(t.id)) continue
          const local = byId.get(t.id)
          // Remoto manda nos dados cadastrais; preserva origem/mapa locais se o remoto vier vazio
          byId.set(
            t.id,
            local
              ? {
                  ...local,
                  ...t,
                  pontuacao: t.pontuacao ?? local.pontuacao,
                  endereco: t.endereco || local.endereco,
                  numero: t.numero || local.numero,
                  bairro: t.bairro || local.bairro,
                  complemento: t.complemento || local.complemento,
                  cep: t.cep || local.cep,
                  rntrc: t.rntrc || local.rntrc,
                  origem_lat: t.origem_lat ?? local.origem_lat ?? null,
                  origem_lng: t.origem_lng ?? local.origem_lng ?? null,
                  origem_cidade: t.origem_cidade || local.origem_cidade,
                  origem_uf: t.origem_uf || local.origem_uf,
                  origem_endereco: t.origem_endereco || local.origem_endereco || t.endereco || local.endereco,
                  origem_numero: t.origem_numero || local.origem_numero || t.numero || local.numero,
                  origem_bairro: t.origem_bairro || local.origem_bairro || t.bairro || local.bairro,
                  origem_complemento:
                    t.origem_complemento ||
                    local.origem_complemento ||
                    t.complemento ||
                    local.complemento,
                  origem_cep: t.origem_cep || local.origem_cep || t.cep || local.cep,
                  raio_km: t.raio_km ?? local.raio_km,
                  disponivel_mapa:
                    t.disponivel_mapa === false || t.disponivel_mapa === true
                      ? t.disponivel_mapa
                      : local.disponivel_mapa,
                }
              : t,
          )
          if (t.situacao === 'pendente') {
            const before = notificacoes
            notificacoes = pushNotif(notificacoes, notifCadastroPendente(t))
            if (notificacoes !== before) notifNova = true
          }
        }
      }
      const docsById = new Map((prev.documentos ?? []).map((d) => [d.id, d]))
      if (remote) {
        for (const d of remote.documentos) {
          if (excluidos.has(d.transportador_id)) continue
          docsById.set(d.id, d)
        }
      }
      const vExcluidos = new Set(prev.veiculos_excluidos ?? [])
      const veiculos = remoteVeiculos
        ? mergeVeiculosLocalRemote(
            (prev.veiculos ?? []).filter((v) => !excluidos.has(v.transportador_id ?? '')),
            remoteVeiculos.filter(
              (v) => !excluidos.has(v.transportador_id ?? '') && !vExcluidos.has(v.id),
            ),
          )
        : prev.veiculos
      const rotasAntes = prev.rotas ?? []
      const rotas = dedupeRotas(
        remoteRotas
          ? mergeRotasLocalRemote(rotasAntes, remoteRotas)
          : rotasAntes,
      )
      const next = unificarTransportadoresDuplicados(
        ensureDemoFrotaMapa({
          ...prev,
          transportadores: Array.from(byId.values()),
          documentos: Array.from(docsById.values()),
          veiculos,
          rotas,
          notificacoes,
        }),
      )
      stateRef.current = next
      if (
        notifNova ||
        (remoteRotas && remoteRotas.length > 0) ||
        rotas.length !== rotasAntes.length
      ) {
        pushSlice = next
      }
      return next
    })
    if (pushSlice) flushKanbanPush(pushSlice)

    // Persiste no Supabase as 50 placas Ultrafrio redistribuídas no mapa
    const ultrafrioSpread = ultrafrioAlteradosPendentesRef.current
    ultrafrioAlteradosPendentesRef.current = []
    for (const v of ultrafrioSpread) {
      void upsertVeiculoRemote(v)
    }

    // Migra placas locais (id v-…) para o Supabase, para o transportador ver no outro aparelho
    const locais = (stateRef.current.veiculos ?? []).filter(
      (v) => isUuid(v.transportador_id) && !isUuid(v.id),
    )
    for (const v of locais) {
      const res = await upsertVeiculoRemote(v)
      if (!res.ok || res.id === v.id) continue
      setState((prev) => {
        const veiculos = (prev.veiculos ?? []).map((x) =>
          x.id === v.id ? { ...x, id: res.id } : x,
        )
        const motoristas = (prev.motoristas ?? []).map((m) =>
          m.veiculo_id === v.id ? { ...m, veiculo_id: res.id } : m,
        )
        const next = { ...prev, veiculos, motoristas }
        stateRef.current = next
        return next
      })
    }

    // Migra só rotas novas (não seed) que ainda não têm UUID equivalente
    const rotasLocais = rotasPendentesMigracao(stateRef.current.rotas ?? [])
    for (const r of rotasLocais) {
      const res = await upsertRotaRemote(r)
      if (!res.ok) continue
      setState((prev) => {
        const rotas = dedupeRotas(
          prev.rotas.map((x) => (x.id === r.id ? { ...x, id: res.id } : x)),
        )
        const next = { ...prev, rotas }
        stateRef.current = next
        flushKanbanPush(next)
        return next
      })
    }

    // Limpa duplicatas já persistidas no sync
    const atuais = stateRef.current.rotas ?? []
    const limpas = dedupeRotas(atuais)
    if (limpas.length !== atuais.length) {
      setState((prev) => {
        const next = { ...prev, rotas: limpas }
        stateRef.current = next
        flushKanbanPush(next)
        return next
      })
    }
  }, [flushKanbanPush])

  // Hidrata cadastros pendentes/aprovados direto da tabela (não depende só do kanban_sync)
  useEffect(() => {
    void refreshTransportadores()
    const id = window.setInterval(() => {
      void refreshTransportadores()
    }, 15_000)
    return () => window.clearInterval(id)
  }, [refreshTransportadores])

  useEffect(() => {
    saveConfigNegocio(config)
  }, [config])

  const tidConfig =
    actingTransportadorId ||
    (user?.role === 'transportador' ? user.transportador_id : null) ||
    null

  useEffect(() => {
    if (!tidConfig) {
      setConfigTransportador(loadConfigTransportador(null))
      return
    }
    setConfigTransportador(loadConfigTransportador(tidConfig))
    let cancelled = false
    void hydrateConfigTransportador(tidConfig).then((cfg) => {
      if (!cancelled) setConfigTransportador(cfg)
    })
    return () => {
      cancelled = true
    }
  }, [tidConfig])

  useEffect(() => {
    persistAuthProfile(user)
  }, [user])

  // Hidrata foto de perfil salva em usuarios.avatar_url (compartilhada entre aparelhos)
  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured || !supabase) return
    let cancelled = false
    void buscarAvatarUsuarioRemoto(user.id, {
      email: user.email,
      usuario: user.usuario,
    }).then((url) => {
      if (cancelled) return
      const next = (url || '').trim()
      if (!next) return
      setUser((prev) => {
        if (!prev || prev.id !== user.id) return prev
        const atual = prev.avatar_url?.trim() || ''
        if (atual === next) return prev
        return { ...prev, avatar_url: next }
      })
      try {
        const accounts = loadPortalAccounts().map((a) => {
          const mesmoId = a.id === user.id
          const mesmoEmail =
            user.email && a.email?.toLowerCase() === user.email.toLowerCase()
          const mesmoUser =
            user.usuario && a.usuario?.toLowerCase() === user.usuario.toLowerCase()
          if (!mesmoId && !mesmoEmail && !mesmoUser) return a
          if ((a.avatar_url || '').trim() === next) return a
          return { ...a, avatar_url: next }
        })
        savePortalAccounts(accounts)
      } catch {
        /* ignore */
      }
    })
    return () => {
      cancelled = true
    }
  }, [user?.id, user?.email, user?.usuario])

  const salvarConfig = useCallback((cfg: ConfigNegocio) => {
    setConfig(cfg)
  }, [])

  const salvarConfigTransportador = useCallback(
    (cfg: ConfigTransportador) => {
      setConfigTransportador(cfg)
      if (tidConfig) saveConfigTransportador(tidConfig, cfg)
    },
    [tidConfig],
  )

  // Timer: metade do prazo → notifica demais grupos; fim do prazo → fecha leilão; alocação expira
  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => t + 1)
      const pushEscalonamento: Array<{
        tids: string[]
        carga: {
          id: string
          numero: string
          origem: string
          destino: string
          frete_oferta: number | null
          frete_tabela: number
        }
      }> = []

      setState((prev) => {
        let changed = false
        const now = Date.now()
        let historico = prev.historico
        let interacoes = prev.interacoes
        let notificacoes = prev.notificacoes
        const cargas = prev.cargas.map((c) => {
          if (!c.publicado_em || !c.expira_em) return c
          if (!['negociando', 'propostas'].includes(c.status)) return c
          // Suspensa: timer congelado
          if (c.pausado_em) return c

          const pub = new Date(c.publicado_em).getTime()
          const exp = new Date(c.expira_em).getTime()
          const mid = pub + (exp - pub) / 2

          if (now >= mid && c.grupo_ids.length > c.grupos_notificados.length) {
            changed = true
            const ja = new Set(c.grupos_notificados)
            const novosGrupos = c.grupo_ids.filter((gid) => !ja.has(gid))
            const tidsNovos = tidsAtivosDosGrupos(
              prev.grupos,
              novosGrupos,
              prev.transportadores,
            )
            if (tidsNovos.length > 0) {
              pushEscalonamento.push({
                tids: tidsNovos,
                carga: {
                  id: c.id,
                  numero: c.numero,
                  origem: c.origem,
                  destino: c.destino,
                  frete_oferta: c.frete_oferta,
                  frete_tabela: c.frete_tabela,
                },
              })
              const msg = textoPushNovaCarga(c)
              for (const tid of tidsNovos) {
                notificacoes = pushNotif(notificacoes, {
                  transportador_id: tid,
                  titulo: 'Nova oferta de carga',
                  mensagem: msg,
                  carga_id: c.id,
                })
              }
            }
            historico = [
              makeHistorico('grupos_notificados', `Demais grupos notificados — carga ${c.numero}`, {
                carga_id: c.id,
                detalhe: 'Metade do prazo da oferta',
              }),
              ...historico,
            ]
            return { ...c, grupos_notificados: [...c.grupo_ids] }
          }

          return c
        })

        let lances = prev.lances
        let transportadores = prev.transportadores

        const expiredAuctions = prev.cargas.filter(
          (c) =>
            c.modo_publicacao === 'leilao' &&
            c.expira_em &&
            !c.pausado_em &&
            new Date(c.expira_em).getTime() <= now &&
            ['negociando', 'propostas'].includes(c.status) &&
            !c.transportador_vencedor_id,
        )

        for (const c of expiredAuctions) {
          const tById = (id: string) => transportadores.find((t) => t.id === id)
          const ativos = ordenarLancesParaVitoria(
            lances.filter((l) => l.carga_id === c.id && l.status === 'ativo'),
            tById,
          )
          const idx = cargas.findIndex((x) => x.id === c.id)
          if (idx < 0) continue

          // Empate de valor: não fecha automático; fica em propostas aguardando aceite
          if (
            config.empate_exige_aceite_manual &&
            haEmpateDeValor(ativos) &&
            ativos.length >= 2
          ) {
            if (cargas[idx].status !== 'propostas') {
              changed = true
              cargas[idx] = { ...cargas[idx], status: 'propostas' }
              historico = [
                makeHistorico(
                  'negociacao_finalizada',
                  `Empate de lances — aceite manual — ${c.numero}`,
                  { carga_id: c.id, detalhe: `Valor empatado R$ ${ativos[0].valor.toFixed(2)}` },
                ),
                ...historico,
              ]
              notificacoes = pushNotif(notificacoes, {
                role: 'minerva',
                titulo: 'Empate de propostas',
                mensagem: `Carga ${c.numero}: há lances empatados. Selecione o vencedor.`,
                carga_id: c.id,
              })
            }
            continue
          }

          if (ativos.length === 0) {
            changed = true
            cargas[idx] = { ...cargas[idx], status: 'recusadas' }
            // Penaliza quem viu e não ofertou / não visualizou
            const gruposOk =
              c.grupos_notificados.length > 0 ? c.grupos_notificados : c.grupo_ids
            const idsNotificados = new Set<string>()
            for (const g of prev.grupos) {
              if (!gruposOk.includes(g.id)) continue
              for (const tid of g.transportador_ids) idsNotificados.add(tid)
            }
            for (const tid of idsNotificados) {
              const jaInteragiu = interacoes.some(
                (i) => i.carga_id === c.id && i.transportador_id === tid,
              )
              if (jaInteragiu) continue
              const pontos = PONTOS_ADERENCIA.nao_visualizada
              interacoes = [
                ...interacoes,
                {
                  id: uid('int'),
                  transportador_id: tid,
                  carga_id: c.id,
                  tipo: 'nao_visualizada',
                  pontos,
                  created_at: new Date().toISOString(),
                },
              ]
              transportadores = transportadores.map((t) => {
                if (t.id !== tid) return t
                const pontuacao = t.pontuacao + pontos
                return { ...t, pontuacao, classificacao: classificacaoPorPontuacao(pontuacao) }
              })
            }
            historico = [
              makeHistorico('negociacao_finalizada', `Oferta encerrada sem lances — ${c.numero}`, {
                carga_id: c.id,
                detalhe: 'Movida para Recusadas',
              }),
              ...historico,
            ]
            continue
          }

          const best = ativos[0]
          changed = true
          lances = lances.map((l) => {
            if (l.carga_id !== c.id) return l
            if (l.id === best.id) return { ...l, status: 'vencedor' as const }
            if (l.status === 'ativo') return { ...l, status: 'perdido' as const }
            return l
          })
          cargas[idx] = {
            ...cargas[idx],
            status: 'propostas',
            transportador_vencedor_id: best.transportador_id,
            frete_fechado: best.valor,
            alocacao_expira_em: new Date(
              now + (c.prazo_alocacao_minutos ?? 10) * 60_000,
            ).toISOString(),
            updated_at: new Date(now).toISOString(),
          }
          transportadores = transportadores.map((t) => {
            if (t.id !== best.transportador_id) return t
            const pontuacao = t.pontuacao + PONTOS_ADERENCIA.frete_fechado
            return {
              ...t,
              pontuacao,
              classificacao: classificacaoPorPontuacao(pontuacao),
            }
          })
          historico = [
            makeHistorico('lance_aceito', `Melhor lance aceito automaticamente — ${c.numero}`, {
              carga_id: c.id,
              transportador_id: best.transportador_id,
              detalhe: `R$ ${best.valor.toFixed(2)}`,
            }),
            ...historico,
          ]
        }

        // Prazo de alocação expirado → recusa automática
        for (let i = 0; i < cargas.length; i++) {
          const c = cargas[i]
          if (
            c.status === 'propostas' &&
            c.transportador_vencedor_id &&
            c.alocacao_expira_em &&
            new Date(c.alocacao_expira_em).getTime() <= now &&
            !c.placa
          ) {
            changed = true
            const tid = c.transportador_vencedor_id
            cargas[i] = {
              ...c,
              status: 'recusadas',
              transportador_vencedor_id: null,
              frete_fechado: null,
              alocacao_expira_em: null,
            }
            lances = lances.map((l) =>
              l.carga_id === c.id && l.status === 'vencedor'
                ? { ...l, status: 'recusado' as const }
                : l,
            )
            transportadores = transportadores.map((t) => {
              if (t.id !== tid) return t
              const pontuacao = t.pontuacao + PONTOS_ADERENCIA.recusada
              return { ...t, pontuacao, classificacao: classificacaoPorPontuacao(pontuacao) }
            })
            historico = [
              makeHistorico('alocacao_expirada', `Prazo de alocação expirado — ${c.numero}`, {
                carga_id: c.id,
                transportador_id: tid,
              }),
              ...historico,
            ]
          }
        }

        if (!changed) return prev
        return {
          ...prev,
          cargas,
          lances,
          transportadores,
          historico: historico.slice(0, 2000),
          interacoes,
          notificacoes,
        }
      })
      for (const item of pushEscalonamento) {
        dispararPushNovaCarga(item.tids, item.carga)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [config.empate_exige_aceite_manual])

  const login = useCallback(async (
    identificador: string,
    password: string,
    opts?: { persistSession?: boolean },
  ) => {
    if (typeof opts?.persistSession === 'boolean') {
      setAuthPersistEnabled(opts.persistSession)
    }
    const result = await portalLogin(identificador, password)
    if (!result.ok) return { ok: false, error: result.erro }
    let { account, isSuperuser, permissoes } = result

    // Garante vínculo conta ↔ transportadora (ex.: Ultrafrio sem transportador_id)
    if (account.role === 'transportador') {
      const linked = vincularContasAosTransportadores(
        loadPortalAccounts(),
        stateRef.current.transportadores ?? [],
      )
      const found = linked.find((a) => a.id === account.id)
      if (found?.transportador_id) {
        if (found.transportador_id !== account.transportador_id) {
          savePortalAccounts(linked)
        }
        account = found
      }
      isSuperuser = false
      if (!account.transportador_id) {
        return {
          ok: false,
          error:
            'Conta de transportador sem empresa vinculada. Peça ao Super Usuário para associar a transportadora.',
        }
      }
      const alinhados = alinharVeiculosAoTransportador(
        stateRef.current.veiculos ?? [],
        stateRef.current.transportadores ?? [],
        account.transportador_id,
      )
      if (alinhados !== stateRef.current.veiculos) {
        setState((prev) => {
          const next = { ...prev, veiculos: alinhados }
          stateRef.current = next
          return next
        })
      }
    } else {
      isSuperuser = account.role === 'super'
    }

    const role = isSuperuser ? ('super' as const) : ('transportador' as const)
    const tidSessao = isSuperuser
      ? null
      : canonicalTransportadorId(account.transportador_id) ?? account.transportador_id ?? null
    if (!isSuperuser && tidSessao && tidSessao !== account.transportador_id) {
      const accounts = loadPortalAccounts().map((a) =>
        a.id === account.id ? { ...a, transportador_id: tidSessao } : a,
      )
      savePortalAccounts(accounts)
      account = { ...account, transportador_id: tidSessao }
    }
    setUser({
      id: account.id,
      email: account.email,
      nome: account.nome,
      usuario: account.usuario,
      role,
      transportador_id: tidSessao,
      empresa_org_id: account.empresa_org_id ?? null,
      is_superuser: isSuperuser,
      perfil_operacional: account.perfil_operacional ?? null,
      permissoes_modulos: isSuperuser ? null : permissoes.modulos,
      avatar_url: account.avatar_url?.trim() || null,
    })
    return { ok: true }
  }, [])

  const logout = useCallback(() => setUser(null), [])

  const refreshPermissoes = useCallback(() => {
    setUser((prev) => {
      if (!prev) return prev
      const before = loadPortalAccounts()
      const accounts = vincularContasAosTransportadores(
        before,
        stateRef.current.transportadores ?? [],
      )
      const mudouVinculo = accounts.some((a) => {
        const old = before.find((b) => b.id === a.id)
        return old?.transportador_id !== a.transportador_id
      })
      if (mudouVinculo) savePortalAccounts(accounts)
      const account = accounts.find(
        (a) =>
          a.id === prev.id ||
          a.usuario === prev.usuario ||
          a.email.toLowerCase() === (prev.email || '').toLowerCase(),
      )
      if (!account) return prev
      // Perfil da Configuração do Portal é a fonte da verdade
      const isSuperuser = account.role === 'super'
      const perms = getPermissaoUsuario(account)
      const transportador_id =
        account.role === 'transportador'
          ? (account.transportador_id ?? prev.transportador_id ?? null)
          : null
      if (transportador_id) {
        const alinhados = alinharVeiculosAoTransportador(
          stateRef.current.veiculos ?? [],
          stateRef.current.transportadores ?? [],
          transportador_id,
        )
        if (alinhados !== stateRef.current.veiculos) {
          setState((s) => {
            const next = { ...s, veiculos: alinhados }
            stateRef.current = next
            return next
          })
        }
      }
      const role = isSuperuser ? ('super' as const) : ('transportador' as const)
      if (
        prev.transportador_id === transportador_id &&
        prev.is_superuser === isSuperuser &&
        prev.empresa_org_id === (account.empresa_org_id ?? prev.empresa_org_id) &&
        prev.role === role
      ) {
        return {
          ...prev,
          perfil_operacional: account.perfil_operacional ?? prev.perfil_operacional,
          permissoes_modulos: isSuperuser ? null : perms.modulos,
        }
      }
      return {
        ...prev,
        role,
        is_superuser: isSuperuser,
        perfil_operacional: account.perfil_operacional ?? prev.perfil_operacional,
        permissoes_modulos: isSuperuser ? null : perms.modulos,
        empresa_org_id: account.empresa_org_id ?? prev.empresa_org_id,
        transportador_id,
      }
    })
  }, [])

  // Revincula transportador_id da conta e hidrata store remoto
  useEffect(() => {
    void (async () => {
      const cfg = await hydrateConfigNegocio()
      setConfig(cfg)
      await hydrateOrgTree()
      await hydratePermissoesMap()
      await hydratePagamentos()
      await syncPortalAccounts()
      refreshPermissoes()
    })()
  }, [refreshPermissoes])

  const publicarCarga = useCallback(
    (payload: PublishPayload) => {
      const regra = config.usar_regra_prioridade_modo !== false
      const sugerido = calcularPrioridadeEModo(
        payload.prazoLeilaoMinutos,
        config.limite_urgencia_minutos,
      )
      const prioridade = regra
        ? sugerido.prioridade
        : (payload.prioridade ?? config.prioridade_padrao ?? sugerido.prioridade)
      const modo = regra
        ? (payload.modoPublicacao ?? sugerido.modo)
        : (payload.modoPublicacao ?? config.modo_padrao ?? sugerido.modo)
      const exigeJustificativa = regra
        ? sugerido.exigeJustificativa
        : prioridade === 'alta'
      if (exigeJustificativa && !payload.justificativaMotivo) {
        return {
          ok: false,
          error: regra
            ? `Justificativa obrigatória para prazo ≤ ${config.limite_urgencia_minutos} minutos`
            : 'Justificativa obrigatória para prioridade alta',
        }
      }
      const diretoIds = (payload.transportadorDiretoIds ?? []).filter(Boolean)
      const isDireta = modo === 'negociacao_direta'
      if (isDireta) {
        if (diretoIds.length === 0) {
          return {
            ok: false,
            error: 'Selecione ao menos uma transportadora para negociação direta',
          }
        }
      } else if (payload.grupoIds.length === 0) {
        return { ok: false, error: 'Selecione ao menos um grupo de transportadores' }
      }
      if (payload.prazoLeilaoMinutos < config.prazo_oferta_minimo_minutos) {
        return {
          ok: false,
          error: `Prazo mínimo da oferta: ${config.prazo_oferta_minimo_minutos} min`,
        }
      }
      if (payload.prazoLeilaoMinutos > config.prazo_oferta_maximo_minutos) {
        return {
          ok: false,
          error: `Prazo máximo da oferta: ${config.prazo_oferta_maximo_minutos} min`,
        }
      }

      const escalonar =
        !isDireta && Boolean(payload.escalonarGrupos) && payload.grupoIds.length > 1
      const prev = stateRef.current
      const cargaAtual = prev.cargas.find((c) => c.id === payload.cargaId)
      if (!cargaAtual) return { ok: false, error: 'Carga não encontrada' }

      const now = Date.now()
      const nowIso = new Date(now).toISOString()
      const { freteOferta } = calcularFreteOferta(
        cargaAtual.frete_tabela,
        payload.margemPercentual,
      )
      const lim = limitesLance(freteOferta, config)
      const actor = userRef.current
      const grupoIdsPub = isDireta ? [] : payload.grupoIds
      const gruposNotif = isDireta
        ? []
        : escalonar
          ? [payload.grupoIds[0]]
          : [...payload.grupoIds]

      const cargas = prev.cargas.map((c) => {
        if (c.id !== payload.cargaId) return c
        return {
          ...c,
          margem_percentual: payload.margemPercentual,
          frete_oferta: freteOferta,
          frete_minimo: lim.min,
          frete_maximo: lim.max,
          grupo_ids: grupoIdsPub,
          grupos_notificados: gruposNotif,
          transportador_direto_ids: isDireta ? [...diretoIds] : [],
          prazo_leilao_minutos: payload.prazoLeilaoMinutos,
          prazo_alocacao_minutos: payload.prazoAlocacaoMinutos,
          prioridade,
          modo_publicacao: modo as ModoPublicacao,
          justificativa_motivo: payload.justificativaMotivo ?? null,
          justificativa_obs: payload.justificativaObs ?? null,
          observacao: payload.observacao?.trim() || c.observacao,
          status: 'negociando' as const,
          publicado_em: nowIso,
          expira_em: new Date(now + payload.prazoLeilaoMinutos * 60_000).toISOString(),
          pausado_em: null,
          tempo_restante_ms: null,
          motivo_cancelamento: null,
          publicado_por: actor?.id ?? null,
          // Nova rodada: limpa frete fechado da rodada anterior
          transportador_vencedor_id: null,
          frete_fechado: null,
          placa: null,
          motorista: null,
          veiculo_id: null,
          motorista_id: null,
          alocacao_expira_em: null,
          updated_at: nowIso,
        }
      })
      // Republicar/publicar de novo = zera propostas; Kanban volta a Nova Carga
      const lances = cancelarLancesDaCarga(prev.lances, payload.cargaId, nowIso)
      const carga = cargas.find((c) => c.id === payload.cargaId)
      const destDetalhe = isDireta
        ? `${diretoIds.length} transportadora(s)`
        : `${payload.grupoIds.length} grupo(s)`
      const hist = makeHistorico(
        'carga_publicada',
        `Carga ${carga?.numero ?? ''} publicada`,
        {
          carga_id: payload.cargaId,
          detalhe: `${modo} · ${prioridade} · ${payload.prazoLeilaoMinutos} min · ${destDetalhe}`,
        },
        actor,
      )
      const tidsPush = isDireta
        ? diretoIds.filter((tid) => {
            const t = prev.transportadores.find((x) => sameTransportadorId(x.id, tid))
            return t && t.situacao !== 'inativo'
          })
        : tidsAtivosDosGrupos(prev.grupos, gruposNotif, prev.transportadores)
      const msgPush = textoPushNovaCarga({
        numero: carga?.numero,
        origem: carga?.origem,
        destino: carga?.destino,
        frete_oferta: carga?.frete_oferta,
        frete_tabela: carga?.frete_tabela,
      })
      let notificacoes = pushNotif(prev.notificacoes, {
        role: 'todos',
        titulo: 'Nova carga publicada',
        mensagem: msgPush,
        carga_id: payload.cargaId,
      })
      for (const tid of tidsPush) {
        notificacoes = pushNotif(notificacoes, {
          transportador_id: tid,
          titulo: 'Nova oferta de carga',
          mensagem: msgPush,
          carga_id: payload.cargaId,
        })
      }
      const next = {
        ...prev,
        cargas,
        lances,
        historico: [hist, ...prev.historico].slice(0, 2000),
        notificacoes,
      }
      stateRef.current = next
      setState(next)
      flushKanbanPush(next)
      // Push no celular dos transportadores dos grupos (PWA + alertas ativados)
      // Retorno sync; o envio roda em seguida e o painel pode consultar o log
      void dispararPushNovaCarga(
        tidsPush,
        {
          id: payload.cargaId,
          numero: carga?.numero,
          origem: carga?.origem,
          destino: carga?.destino,
          frete_oferta: carga?.frete_oferta,
          frete_tabela: carga?.frete_tabela,
        },
      ).then((push) => {
        if (push.erro) {
          console.warn('[publicarCarga] push:', push.erro)
        } else {
          console.info('[publicarCarga] push enviados:', push.enviados, 'tids:', tidsPush.length)
        }
      })
      return {
        ok: true,
        pushAviso:
          tidsPush.length === 0
            ? isDireta
              ? 'Nenhuma transportadora ativa selecionada — push não enviado.'
              : 'Nenhum transportador ativo nos grupos — push não enviado.'
            : undefined,
      }
    },
    [config, flushKanbanPush],
  )

  const notificarTodosGrupos = useCallback((cargaId: string) => {
    const prev = stateRef.current
    const carga = prev.cargas.find((c) => c.id === cargaId)
    const hist = makeHistorico(
      'grupos_notificados',
      `Notificação manual de todos os grupos — ${carga?.numero ?? ''}`,
      { carga_id: cargaId },
    )
    const tids = tidsAtivosDosGrupos(
      prev.grupos,
      carga?.grupo_ids ?? [],
      prev.transportadores,
    )
    let notificacoes = prev.notificacoes
    const msg = textoPushNovaCarga({
      numero: carga?.numero,
      origem: carga?.origem,
      destino: carga?.destino,
      frete_oferta: carga?.frete_oferta,
      frete_tabela: carga?.frete_tabela,
    })
    for (const tid of tids) {
      notificacoes = pushNotif(notificacoes, {
        transportador_id: tid,
        titulo: 'Nova oferta de carga',
        mensagem: msg,
        carga_id: cargaId,
      })
    }
    const next = {
      ...prev,
      cargas: prev.cargas.map((c) =>
        c.id === cargaId ? { ...c, grupos_notificados: [...c.grupo_ids] } : c,
      ),
      historico: [hist, ...prev.historico].slice(0, 2000),
      notificacoes,
    }
    stateRef.current = next
    setState(next)
    flushKanbanPush(next)
    dispararPushNovaCarga(tids, {
      id: cargaId,
      numero: carga?.numero,
      origem: carga?.origem,
      destino: carga?.destino,
      frete_oferta: carga?.frete_oferta,
      frete_tabela: carga?.frete_tabela,
    })
  }, [flushKanbanPush])

  const enviarLance = useCallback(
    (cargaId: string, valor: number, opts?: { aceitarOferta?: boolean }) => {
      const tidRaw = actingTransportadorId || userRef.current?.transportador_id
      const tid = canonicalTransportadorId(tidRaw) || tidRaw
      if (!tid) return { ok: false, error: 'Usuário sem transportador' }

      const prev = stateRef.current
      const carga = prev.cargas.find((c) => c.id === cargaId)
      if (!carga) return { ok: false, error: 'Carga não encontrada' }
      const statusAberto =
        ['negociando', 'propostas'].includes(carga.status) ||
        (carga.status === 'nova_carga' && Boolean(carga.publicado_em))
      if (!statusAberto) {
        return { ok: false, error: 'Carga não está aberta para lances' }
      }
      if (carga.pausado_em) {
        return { ok: false, error: 'Negociação suspensa pelo embarcador' }
      }
      if (carga.transportador_vencedor_id) {
        return { ok: false, error: 'Frete já fechado nesta carga' }
      }
      // Prazo vencido sem vencedor: renova a janela (mesmo critério do normalize) e segue o lance
      let cargaOk = carga
      if (carga.expira_em && new Date(carga.expira_em).getTime() < Date.now()) {
        const prazoMs = Math.max(10, carga.prazo_leilao_minutos ?? 60) * 60_000
        const expira_em = new Date(Date.now() + prazoMs).toISOString()
        cargaOk = { ...carga, expira_em }
        stateRef.current = {
          ...prev,
          cargas: prev.cargas.map((c) => (c.id === cargaId ? { ...c, expira_em } : c)),
        }
      }

      if (valor <= 0) return { ok: false, error: 'Valor inválido' }

      const freteRef = roundMoney(cargaOk.frete_oferta ?? cargaOk.frete_tabela)
      const min = cargaOk.frete_minimo
      // Contra-proposta eleva o frete_oferta: máximo efetivo acompanha, senão “Responder”/Aceitar falha
      const maxBase = cargaOk.frete_maximo
      const max =
        maxBase == null && cargaOk.frete_oferta == null
          ? null
          : Math.max(
              maxBase ?? Number.NEGATIVE_INFINITY,
              cargaOk.frete_oferta != null ? roundMoney(cargaOk.frete_oferta) : Number.NEGATIVE_INFINITY,
            )
      const maxEfetivo = max != null && Number.isFinite(max) ? max : null
      if (min != null && valor < min - 0.009) {
        return {
          ok: false,
          error: `Lance abaixo do mínimo permitido (R$ ${min.toFixed(2)})`,
        }
      }
      if (maxEfetivo != null && valor > maxEfetivo + 0.009) {
        return {
          ok: false,
          error: `Lance acima do máximo permitido (R$ ${maxEfetivo.toFixed(2)})`,
        }
      }

      // Negociação direta: só IDs escolhidos. Grupos: escalonar / notificados.
      let autorizado = false
      if (cargaOk.modo_publicacao === 'negociacao_direta') {
        autorizado = (cargaOk.transportador_direto_ids ?? []).some((id) =>
          sameTransportadorId(id, tid),
        )
      } else {
        const gruposOk =
          (cargaOk.grupos_notificados?.length ?? 0) > 0
            ? cargaOk.grupos_notificados!
            : (cargaOk.grupo_ids ?? [])
        autorizado =
          gruposOk.length === 0 ||
          prev.grupos.some(
            (g) =>
              g.situacao !== 'inativo' &&
              gruposOk.includes(g.id) &&
              (g.transportador_ids ?? []).some((id) => sameTransportadorId(id, tid)),
          )
      }
      if (!autorizado) {
        return { ok: false, error: 'Você ainda não foi chamado para negociar esta carga' }
      }

      const existingAtivo = stateRef.current.lances.find(
        (l) =>
          l.carga_id === cargaId &&
          sameTransportadorId(l.transportador_id, tid) &&
          l.status === 'ativo',
      )
      const temContraPendente =
        Boolean(existingAtivo) &&
        cargaOk.frete_oferta != null &&
        Math.abs(roundMoney(cargaOk.frete_oferta) - roundMoney(existingAtivo!.valor)) > 0.009

      // Oferta/ND: não altera proposta — exceto resposta à contra-proposta do embarcador
      if (
        existingAtivo &&
        (cargaOk.modo_publicacao === 'oferta' ||
          cargaOk.modo_publicacao === 'negociacao_direta') &&
        !opts?.aceitarOferta &&
        !temContraPendente
      ) {
        return {
          ok: false,
          error:
            cargaOk.modo_publicacao === 'negociacao_direta'
              ? 'Na Negociação direta não é permitido alterar a proposta.'
              : 'No modo Oferta não é permitido alterar a proposta.',
        }
      }

      const userNow = userRef.current
      const agora = new Date().toISOString()
      const base = stateRef.current

      // “Aceitar oferta” / contra-proposta: fecha o frete no valor da oferta (Oferta e Leilão)
      if (opts?.aceitarOferta && valor <= freteRef + 0.009) {
        const existingAceite = base.lances.find(
          (l) =>
            l.carga_id === cargaId &&
            sameTransportadorId(l.transportador_id, tid) &&
            l.status === 'ativo',
        )
        const lance: Lance = {
          id: existingAceite?.id ?? uid('lance'),
          carga_id: cargaId,
          transportador_id: tid,
          valor,
          status: 'vencedor',
          created_at: existingAceite?.created_at ?? agora,
          updated_at: agora,
        }
        const outrosPerdedores = base.lances
          .filter(
            (l) =>
              l.carga_id === cargaId &&
              !sameTransportadorId(l.transportador_id, tid) &&
              l.status === 'ativo',
          )
          .map((l) => l.transportador_id)
        let notifs = base.notificacoes
        notifs = pushNotif(notifs, {
          role: 'transportador',
          transportador_id: tid,
          titulo: 'Frete fechado',
          mensagem: `Sua proposta na carga ${cargaOk.numero} fechou o frete.`,
          carga_id: cargaId,
        })
        for (const pid of [...new Set(outrosPerdedores)]) {
          notifs = pushNotif(notifs, {
            role: 'transportador',
            transportador_id: pid,
            titulo: 'Frete fechado com outro',
            mensagem: `A carga ${cargaOk.numero} foi fechada com outra transportadora.`,
            carga_id: cargaId,
          })
        }
        notifs = pushNotif(notifs, {
          role: 'minerva',
          titulo: 'Frete fechado',
          mensagem: `Carga ${cargaOk.numero}: transportador aceitou a oferta (R$ ${valor.toFixed(2)}).`,
          carga_id: cargaId,
          href: `/embarcador?cargaId=${encodeURIComponent(cargaId)}`,
        })
        const next: DataState = {
          ...base,
          cargas: base.cargas.map((c) =>
            c.id === cargaId
              ? {
                  ...c,
                  status: 'propostas' as const,
                  transportador_vencedor_id: tid,
                  frete_fechado: valor,
                  frete_oferta: valor,
                  alocacao_expira_em: new Date(
                    Date.now() + Math.max(c.prazo_alocacao_minutos ?? 10, 10) * 60_000,
                  ).toISOString(),
                  updated_at: agora,
                }
              : c,
          ),
          lances: [
            ...base.lances
              .filter(
                (l) =>
                  !(
                    l.carga_id === cargaId &&
                    sameTransportadorId(l.transportador_id, tid) &&
                    (l.status === 'ativo' || l.id === lance.id)
                  ),
              )
              .map((l) =>
                l.carga_id === cargaId && l.status === 'ativo'
                  ? { ...l, status: 'perdido' as const, updated_at: agora }
                  : l,
              ),
            lance,
          ],
          transportadores: base.transportadores.map((t) => {
            if (!sameTransportadorId(t.id, tid)) return t
            const pontuacao =
              t.pontuacao + PONTOS_ADERENCIA.com_proposta + PONTOS_ADERENCIA.frete_fechado
            return { ...t, pontuacao, classificacao: classificacaoPorPontuacao(pontuacao) }
          }),
          historico: [
            makeHistorico(
              'lance_enviado',
              `Lance vencedor (aceitou oferta) — ${cargaOk.numero}`,
              {
                carga_id: cargaId,
                transportador_id: tid,
                detalhe: `R$ ${valor.toFixed(2)}`,
              },
              userNow,
            ),
            ...base.historico,
          ].slice(0, 2000),
          notificacoes: notifs,
        }
        stateRef.current = next
        setState(next)
        flushKanbanPush(next)
        return { ok: true }
      }

      const existing = base.lances.find(
        (l) =>
          l.carga_id === cargaId &&
          sameTransportadorId(l.transportador_id, tid) &&
          l.status === 'ativo',
      )
      // Tem contra-proposta pendente: frete_oferta (embarcador) diferente do lance ativo
      const isRespostaContra =
        Boolean(existing) &&
        cargaOk.frete_oferta != null &&
        Math.abs(roundMoney(cargaOk.frete_oferta) - roundMoney(existing!.valor)) > 0.009

      let lances: Lance[]
      let historicoPropostas = base.historicoPropostas ?? []
      if (existing) {
        historicoPropostas = [
          {
            id: uid('hp'),
            lance_id: existing.id,
            carga_id: cargaId,
            transportador_id: tid,
            valor_anterior: existing.valor,
            valor_novo: valor,
            created_at: agora,
            tipo: isRespostaContra ? ('resposta_contra' as const) : ('lance' as const),
          },
          ...historicoPropostas,
        ]
        lances = base.lances.map((l) =>
          l.id === existing.id
            ? { ...l, valor, transportador_id: tid, updated_at: agora }
            : l.carga_id === cargaId &&
                sameTransportadorId(l.transportador_id, tid) &&
                l.status === 'ativo' &&
                l.id !== existing.id
              ? { ...l, status: 'cancelado' as const, updated_at: agora }
              : l,
        )
      } else {
        const lanceId = uid('lance')
        historicoPropostas = [
          {
            id: uid('hp'),
            lance_id: lanceId,
            carga_id: cargaId,
            transportador_id: tid,
            valor_anterior: null,
            valor_novo: valor,
            created_at: agora,
            tipo: 'lance' as const,
          },
          ...historicoPropostas,
        ]
        lances = [
          ...base.lances,
          {
            id: lanceId,
            carga_id: cargaId,
            transportador_id: tid,
            valor,
            status: 'ativo',
            created_at: agora,
          },
        ]
      }

      const isNew = !existing
      const histTitulo = isRespostaContra
        ? 'Resposta da contra-proposta'
        : isNew
          ? 'Nova proposta'
          : 'Proposta atualizada'
      const histDetalhe = isRespostaContra
        ? `Resposta da contra-proposta: R$ ${roundMoney(cargaOk.frete_oferta!).toFixed(2)} → R$ ${valor.toFixed(2)}`
        : `R$ ${valor.toFixed(2)}`
      // Sempre move para Propostas quando há lance ativo (Kanban Minerva + Transportador)
      const cargas = base.cargas.map((c) =>
        c.id === cargaId && !c.transportador_vencedor_id
          ? { ...c, status: 'propostas' as const, updated_at: agora }
          : c,
      )
      const transportadores = isNew
        ? base.transportadores.map((t) => {
            if (!sameTransportadorId(t.id, tid)) return t
            const pontuacao = t.pontuacao + PONTOS_ADERENCIA.com_proposta
            return { ...t, pontuacao, classificacao: classificacaoPorPontuacao(pontuacao) }
          })
        : base.transportadores

      let notifs = pushNotif(base.notificacoes, {
        role: 'minerva',
        titulo: histTitulo,
        mensagem: isRespostaContra
          ? `Carga ${cargaOk.numero}: transportador respondeu a contra-proposta com R$ ${valor.toFixed(2)}.`
          : `Carga ${cargaOk.numero}: R$ ${valor.toFixed(2)}. Negocie pelo card.`,
        carga_id: cargaId,
        href: `/embarcador?cargaId=${encodeURIComponent(cargaId)}`,
      })
      if (isRespostaContra) {
        notifs = pushNotif(notifs, {
          role: 'transportador',
          transportador_id: tid,
          titulo: 'Resposta da contra-proposta enviada',
          mensagem: `Carga ${cargaOk.numero}: sua resposta (R$ ${valor.toFixed(2)}) foi enviada ao embarcador.`,
          carga_id: cargaId,
          href: `/transportador?cargaId=${encodeURIComponent(cargaId)}`,
        })
      }

      const next: DataState = {
        ...base,
        cargas,
        lances,
        transportadores,
        historico: [
          makeHistorico(
            isRespostaContra ? 'resposta_contra' : 'lance_enviado',
            `${histTitulo} — ${cargaOk.numero}`,
            {
              carga_id: cargaId,
              transportador_id: tid,
              detalhe: histDetalhe,
            },
            userNow,
          ),
          ...base.historico,
        ].slice(0, 2000),
        historicoPropostas: historicoPropostas.slice(0, 3000),
        notificacoes: notifs,
      }
      stateRef.current = next
      setState(next)
      flushKanbanPush(next)
      return { ok: true }
    },
    [actingTransportadorId, flushKanbanPush],
  )

  const aceitarLance = useCallback(
    (lanceId: string) => {
      const prev = stateRef.current
      const current = prev.lances.find((l) => l.id === lanceId)
      if (!current || current.status !== 'ativo') {
        return { ok: false, error: 'Proposta não encontrada ou já encerrada' }
      }
      const cargaAtual = prev.cargas.find((c) => c.id === current.carga_id)
      if (!cargaAtual) return { ok: false, error: 'Carga não encontrada' }
      if (cargaAtual.transportador_vencedor_id) {
        return { ok: false, error: 'Esta carga já tem frete fechado' }
      }
      if (!['negociando', 'propostas'].includes(cargaAtual.status)) {
        return { ok: false, error: 'Carga não está em negociação' }
      }

      const agora = new Date().toISOString()
      const prazoAloc = Math.max(cargaAtual.prazo_alocacao_minutos ?? 10, 10)
      const lances = prev.lances.map((l) => {
        if (l.carga_id !== current.carga_id) return l
        if (l.id === lanceId) return { ...l, status: 'vencedor' as const, updated_at: agora }
        if (l.status === 'ativo') return { ...l, status: 'perdido' as const, updated_at: agora }
        return l
      })
      const cargas = prev.cargas.map((c) =>
        c.id === current.carga_id
          ? {
              ...c,
              status: 'propostas' as const,
              transportador_vencedor_id: current.transportador_id,
              frete_fechado: current.valor,
              expira_em: c.expira_em,
              alocacao_expira_em: new Date(Date.now() + prazoAloc * 60_000).toISOString(),
              updated_at: agora,
            }
          : c,
      )
      const transportadores = prev.transportadores.map((t) => {
        if (t.id !== current.transportador_id) return t
        const pontuacao = t.pontuacao + PONTOS_ADERENCIA.frete_fechado
        return { ...t, pontuacao, classificacao: classificacaoPorPontuacao(pontuacao) }
      })
      const hist = makeHistorico(
        'lance_aceito',
        `Lance aceito — carga ${cargaAtual.numero}`,
        {
          carga_id: current.carga_id,
          transportador_id: current.transportador_id,
          detalhe: `R$ ${current.valor.toFixed(2)}`,
        },
        userRef.current,
      )
      const perdedores = [
        ...new Set(
          prev.lances
            .filter(
              (l) =>
                l.carga_id === current.carga_id &&
                l.id !== lanceId &&
                ['ativo', 'perdido', 'recusado'].includes(l.status),
            )
            .map((l) => l.transportador_id)
            .filter((id) => id !== current.transportador_id),
        ),
      ]
      let notifs = pushNotif(prev.notificacoes, {
        role: 'transportador',
        transportador_id: current.transportador_id,
        titulo: 'Frete fechado',
        mensagem: `Sua proposta na carga ${cargaAtual.numero} foi aceita.`,
        carga_id: current.carga_id,
      })
      for (const pid of perdedores) {
        notifs = pushNotif(notifs, {
          role: 'transportador',
          transportador_id: pid,
          titulo: 'Frete fechado com outro',
          mensagem: `A carga ${cargaAtual.numero} foi fechada com outra transportadora.`,
          carga_id: current.carga_id,
        })
      }
      const next: DataState = {
        ...prev,
        cargas,
        lances,
        transportadores,
        historico: [hist, ...prev.historico].slice(0, 2000),
        notificacoes: notifs,
      }
      stateRef.current = next
      setState(next)
      flushKanbanPush(next)
      return { ok: true }
    },
    [flushKanbanPush],
  )

  const rejeitarLance = useCallback(
    (lanceId: string) => {
      const prev = stateRef.current
      const lance = prev.lances.find((l) => l.id === lanceId)
      if (!lance || lance.status !== 'ativo') {
        return { ok: false, error: 'Proposta não encontrada ou já encerrada' }
      }
      const carga = prev.cargas.find((c) => c.id === lance.carga_id)
      if (carga?.transportador_vencedor_id) {
        return { ok: false, error: 'Frete já fechado' }
      }
      const agora = new Date().toISOString()
      const hist = makeHistorico(
        'lance_rejeitado',
        `Lance rejeitado — ${carga?.numero ?? ''}`,
        {
          carga_id: lance.carga_id,
          transportador_id: lance.transportador_id,
          detalhe: `R$ ${lance.valor.toFixed(2)}`,
        },
        userRef.current,
      )
      const next: DataState = {
        ...prev,
        lances: prev.lances.map((l) =>
          l.id === lanceId ? { ...l, status: 'recusado' as const, updated_at: agora } : l,
        ),
        cargas: carga
          ? prev.cargas.map((c) =>
              c.id === carga.id ? { ...c, updated_at: agora } : c,
            )
          : prev.cargas,
        historico: [hist, ...prev.historico].slice(0, 2000),
        notificacoes: pushNotif(prev.notificacoes, {
          role: 'transportador',
          transportador_id: lance.transportador_id,
          titulo: 'Proposta rejeitada',
          mensagem: `Sua proposta na carga ${carga?.numero ?? ''} foi rejeitada.`,
          carga_id: lance.carga_id,
        }),
      }
      stateRef.current = next
      setState(next)
      flushKanbanPush(next)
      return { ok: true }
    },
    [flushKanbanPush],
  )

  const enviarContraProposta = useCallback((lanceId: string, valor: number) => {
    if (!Number.isFinite(valor) || valor <= 0) {
      return { ok: false, error: 'Informe um valor válido para a contra-proposta' }
    }
    const valorRound = Math.round(valor * 100) / 100
    const prev = stateRef.current
    const userNow = userRef.current
    const lance = prev.lances.find((l) => l.id === lanceId)
    if (!lance || lance.status !== 'ativo') {
      return { ok: false, error: 'Proposta não encontrada ou já encerrada' }
    }
    const carga = prev.cargas.find((c) => c.id === lance.carga_id)
    if (!carga) return { ok: false, error: 'Carga não encontrada' }
    if (carga.transportador_vencedor_id) {
      return { ok: false, error: 'Frete já fechado' }
    }
    if (!['negociando', 'propostas'].includes(carga.status)) {
      return {
        ok: false,
        error: `Carga não está em negociação (status: ${carga.status})`,
      }
    }
    const now = new Date().toISOString()
    const histProp: HistoricoProposta = {
      id: uid('hp'),
      carga_id: carga.id,
      lance_id: lance.id,
      transportador_id: lance.transportador_id,
      valor_anterior: lance.valor,
      valor_novo: valorRound,
      created_at: now,
      tipo: 'contra_embarcador',
    }
    const next: DataState = {
      ...prev,
      cargas: prev.cargas.map((c) =>
        c.id === carga.id
          ? {
              ...c,
              frete_oferta: valorRound,
              // Garante que Aceitar / Responder não esbarrem no frete_maximo antigo
              frete_maximo:
                c.frete_maximo == null
                  ? valorRound
                  : Math.max(roundMoney(c.frete_maximo), valorRound),
              status: c.status === 'negociando' ? ('propostas' as const) : c.status,
              updated_at: now,
            }
          : c,
      ),
      historicoPropostas: [histProp, ...(prev.historicoPropostas ?? [])].slice(0, 3000),
      historico: [
        makeHistorico(
          'contra_proposta',
          `Contra-proposta — ${carga.numero}`,
          {
            carga_id: carga.id,
            transportador_id: lance.transportador_id,
            detalhe: `R$ ${lance.valor.toFixed(2)} → R$ ${valorRound.toFixed(2)}`,
          },
          userNow,
        ),
        ...prev.historico,
      ].slice(0, 2000),
      notificacoes: pushNotif(prev.notificacoes, {
        role: 'transportador',
        transportador_id: lance.transportador_id,
        titulo: 'Contra-proposta no card',
        mensagem: `Carga ${carga.numero}: embarcador sugere R$ ${valorRound.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Responda pelo card com um novo lance.`,
        carga_id: carga.id,
        href: `/transportador?cargaId=${encodeURIComponent(carga.id)}`,
      }),
    }
    stateRef.current = next
    setState(next)
    flushKanbanPush(next)
    return { ok: true }
  }, [flushKanbanPush])

  const aguardarMelhoresOfertas = useCallback(
    (cargaId: string, minutosExtra = 10) => {
      const carga = state.cargas.find((c) => c.id === cargaId)
      if (!carga) return { ok: false, error: 'Carga não encontrada' }
      if (carga.transportador_vencedor_id) {
        return { ok: false, error: 'Frete já fechado' }
      }
      if (!['negociando', 'propostas'].includes(carga.status)) {
        return { ok: false, error: 'Carga não está em negociação aberta' }
      }
      const base = carga.expira_em ? new Date(carga.expira_em).getTime() : Date.now()
      const novoExpira = new Date(Math.max(base, Date.now()) + minutosExtra * 60_000).toISOString()
      setState((prev) => ({
        ...prev,
        cargas: prev.cargas.map((c) =>
          c.id === cargaId
            ? {
                ...c,
                expira_em: novoExpira,
                updated_at: new Date().toISOString(),
              }
            : c,
        ),
        historico: [
          makeHistorico(
            'aguardar_ofertas',
            `Aguardando melhores ofertas — ${carga.numero}`,
            {
              carga_id: cargaId,
              detalhe: `Janela estendida em ${minutosExtra} min`,
            },
            user,
          ),
          ...prev.historico,
        ].slice(0, 2000),
        notificacoes: pushNotif(prev.notificacoes, {
          role: 'todos',
          titulo: 'Embarcador aguarda melhores ofertas',
          mensagem: `Carga ${carga.numero}: prazo estendido em ${minutosExtra} min.`,
          carga_id: cargaId,
        }),
      }))
      return { ok: true }
    },
    [state.cargas, user],
  )

  const encerrarComMelhorLance = useCallback(
    (cargaId: string) => {
      const tById = (id: string) => state.transportadores.find((t) => t.id === id)
      const ativos = ordenarLancesParaVitoria(
        state.lances.filter((l) => l.carga_id === cargaId && l.status === 'ativo'),
        tById,
      )
      if (ativos.length === 0) {
        return { ok: false, error: 'Não há propostas ativas para encerrar.' }
      }
      if (
        config.empate_exige_aceite_manual &&
        haEmpateDeValor(ativos) &&
        ativos.length >= 2
      ) {
        return {
          ok: false,
          error:
            'Há lances empatados no mesmo valor. Aceite manualmente um dos transportadores.',
        }
      }
      return aceitarLance(ativos[0].id)
    },
    [state.lances, state.transportadores, aceitarLance, config.empate_exige_aceite_manual],
  )

  const finalizarNegociacao = useCallback(
    (cargaId: string) => {
      const carga = state.cargas.find((c) => c.id === cargaId)
      if (!carga) return { ok: false, error: 'Carga não encontrada' }
      if (carga.transportador_vencedor_id) {
        return { ok: false, error: 'Frete já fechado — aguardando alocação' }
      }
      const ativos = state.lances.filter((l) => l.carga_id === cargaId && l.status === 'ativo')
      if (ativos.length > 0) return encerrarComMelhorLance(cargaId)
      setState((prev) => {
        const hist = makeHistorico(
          'negociacao_finalizada',
          `Negociação finalizada sem vencedor — ${carga.numero}`,
          { carga_id: cargaId },
          user,
        )
        return {
          ...prev,
          cargas: prev.cargas.map((c) =>
            c.id === cargaId ? { ...c, status: 'recusadas' as const, expira_em: c.expira_em } : c,
          ),
          historico: [hist, ...prev.historico].slice(0, 2000),
        }
      })
      return { ok: true }
    },
    [state.cargas, state.lances, encerrarComMelhorLance, user],
  )

  const cancelarPublicacao = useCallback(
    (cargaId: string, motivo?: string) => {
      const prev = stateRef.current
      const carga = prev.cargas.find((c) => c.id === cargaId)
      if (!carga) return { ok: false, error: 'Carga não encontrada' }
      if (!['negociando', 'propostas', 'suspensas'].includes(carga.status)) {
        return { ok: false, error: 'Só é possível cancelar publicação em andamento' }
      }
      if (carga.transportador_vencedor_id) {
        return { ok: false, error: 'Frete já fechado — use Recusar frete' }
      }
      const agora = new Date().toISOString()
      const motivoFinal = (motivo ?? '').trim() || 'Cancelada pelo embarcador'
      const hist = makeHistorico(
        'carga_cancelada',
        `Publicação cancelada — ${carga.numero}`,
        { carga_id: cargaId, detalhe: motivoFinal },
        userRef.current,
      )
      const next: DataState = {
        ...prev,
        cargas: prev.cargas.map((c) =>
          c.id === cargaId
            ? {
                ...c,
                status: 'canceladas' as const,
                motivo_cancelamento: motivoFinal,
                pausado_em: null,
                tempo_restante_ms: null,
                expira_em: null,
                updated_at: agora,
              }
            : c,
        ),
        lances: prev.lances.map((l) =>
          l.carga_id === cargaId && ['ativo', 'vencedor', 'perdido'].includes(l.status)
            ? { ...l, status: 'cancelado' as const, updated_at: agora }
            : l,
        ),
        historico: [hist, ...prev.historico].slice(0, 2000),
        notificacoes: pushNotif(prev.notificacoes, {
          role: 'todos',
          titulo: 'Publicação cancelada',
          mensagem: `Carga ${carga.numero} foi cancelada.`,
          carga_id: cargaId,
        }),
      }
      stateRef.current = next
      setState(next)
      flushKanbanPush(next)
      return { ok: true }
    },
    [flushKanbanPush],
  )

  const suspenderCarga = useCallback(
    (cargaId: string) => {
      const carga = state.cargas.find((c) => c.id === cargaId)
      if (!carga) return { ok: false, error: 'Carga não encontrada' }
      if (!['negociando', 'propostas'].includes(carga.status) || carga.transportador_vencedor_id) {
        return { ok: false, error: 'Só é possível suspender negociação aberta' }
      }
      const restante = carga.expira_em
        ? Math.max(0, new Date(carga.expira_em).getTime() - Date.now())
        : null
      setState((prev) => ({
        ...prev,
        cargas: prev.cargas.map((c) =>
          c.id === cargaId
            ? {
                ...c,
                status: 'suspensas' as const,
                pausado_em: new Date().toISOString(),
                tempo_restante_ms: restante,
              }
            : c,
        ),
        historico: [
          makeHistorico('carga_suspensa', `Negociação suspensa — ${carga.numero}`, {
            carga_id: cargaId,
          }, user),
          ...prev.historico,
        ].slice(0, 2000),
      }))
      return { ok: true }
    },
    [state.cargas, user],
  )

  const retomarCarga = useCallback(
    (cargaId: string) => {
      const carga = state.cargas.find((c) => c.id === cargaId)
      if (!carga || carga.status !== 'suspensas') {
        return { ok: false, error: 'Carga não está suspensa' }
      }
      const restante = carga.tempo_restante_ms ?? 0
      const now = Date.now()
      setState((prev) => {
        const temLance = prev.lances.some((l) => l.carga_id === cargaId && l.status === 'ativo')
        return {
          ...prev,
          cargas: prev.cargas.map((c) =>
            c.id === cargaId
              ? {
                  ...c,
                  status: temLance ? ('propostas' as const) : ('negociando' as const),
                  pausado_em: null,
                  tempo_restante_ms: null,
                  expira_em: new Date(now + restante).toISOString(),
                }
              : c,
          ),
          historico: [
            makeHistorico(
              'carga_retomada',
              `Negociação retomada — ${carga.numero}`,
              { carga_id: cargaId },
              user,
            ),
            ...prev.historico,
          ].slice(0, 2000),
        }
      })
      return { ok: true }
    },
    [state.cargas, user],
  )

  const republicarCarga = useCallback((cargaId: string) => {
    const prev = stateRef.current
    const carga = prev.cargas.find((c) => c.id === cargaId)
    if (!carga) return { ok: false, error: 'Carga não encontrada' }
    if (carga.status === 'nova_carga' && !carga.publicado_em) {
      return { ok: false, error: 'Carga já está pronta para publicar' }
    }
    const okStatus = [
      'canceladas',
      'recusadas',
      'alocadas',
      'negociando',
      'propostas',
      'suspensas',
    ].includes(carga.status)
    if (!okStatus && !carga.transportador_vencedor_id) {
      return { ok: false, error: 'Estado não permite republicação' }
    }
    const nowIso = new Date().toISOString()
    const actor = userRef.current
    const next = {
      ...prev,
      cargas: prev.cargas.map((c) =>
        c.id === cargaId
          ? { ...c, ...resetNegociacaoFields(c), updated_at: nowIso }
          : c,
      ),
      lances: cancelarLancesDaCarga(prev.lances, cargaId, nowIso),
      historico: [
        makeHistorico(
          'carga_republicada',
          `Carga preparada para republicar — ${carga.numero}`,
          { carga_id: cargaId, detalhe: 'Propostas anteriores canceladas' },
          actor,
        ),
        ...prev.historico,
      ].slice(0, 2000),
    }
    stateRef.current = next
    setState(next)
    return { ok: true }
  }, [])

  const reabrirNegociacao = useCallback(
    (cargaId: string, prazoMinutos?: number) => {
      const prev = stateRef.current
      const carga = prev.cargas.find((c) => c.id === cargaId)
      if (!carga) return { ok: false, error: 'Carga não encontrada' }
      if (!carga.grupo_ids.length && !(carga.grupos_notificados?.length)) {
        return { ok: false, error: 'Carga precisa ter grupos de publicação' }
      }
      const prazo = prazoMinutos ?? carga.prazo_leilao_minutos ?? config.prazo_oferta_padrao_minutos
      const now = Date.now()
      const nowIso = new Date(now).toISOString()
      const actor = userRef.current
      const grupoIds = carga.grupo_ids.length
        ? carga.grupo_ids
        : [...(carga.grupos_notificados ?? [])]

      // Nova rodada: cancela lances antigos → transportador vê Nova Carga
      const lances = cancelarLancesDaCarga(prev.lances, cargaId, nowIso)
      const next = {
        ...prev,
        cargas: prev.cargas.map((c) =>
          c.id === cargaId
            ? {
                ...c,
                status: 'negociando' as const,
                transportador_vencedor_id: null,
                frete_fechado: null,
                placa: null,
                motorista: null,
                veiculo_id: null,
                motorista_id: null,
                alocacao_expira_em: null,
                pausado_em: null,
                tempo_restante_ms: null,
                prazo_leilao_minutos: prazo,
                grupo_ids: grupoIds,
                publicado_em: nowIso,
                expira_em: new Date(now + prazo * 60_000).toISOString(),
                grupos_notificados: [...grupoIds],
                recusado_por_ids: [],
                updated_at: nowIso,
              }
            : c,
        ),
        lances,
        historico: [
          makeHistorico(
            'negociacao_reaberta',
            `Negociação reaberta — ${carga.numero}`,
            {
              carga_id: cargaId,
              detalhe: `${prazo} min · nova rodada (propostas anteriores canceladas)`,
            },
            actor,
          ),
          ...prev.historico,
        ].slice(0, 2000),
        notificacoes: (() => {
          const msg = textoPushNovaCarga({
            numero: carga.numero,
            origem: carga.origem,
            destino: carga.destino,
            frete_oferta: carga.frete_oferta,
            frete_tabela: carga.frete_tabela,
          })
          let list = pushNotif(prev.notificacoes, {
            role: 'todos',
            titulo: 'Negociação reaberta',
            mensagem: `Carga ${carga.numero} reaberta para novas ofertas (Nova Carga).`,
            carga_id: cargaId,
          })
          const tids = tidsAtivosDosGrupos(prev.grupos, grupoIds, prev.transportadores)
          for (const tid of tids) {
            list = pushNotif(list, {
              transportador_id: tid,
              titulo: 'Negociação reaberta',
              mensagem: msg,
              carga_id: cargaId,
            })
          }
          return list
        })(),
      }
      stateRef.current = next
      setState(next)
      flushKanbanPush(next)
      dispararPushNovaCarga(
        tidsAtivosDosGrupos(prev.grupos, grupoIds, prev.transportadores),
        {
          id: cargaId,
          numero: carga.numero,
          origem: carga.origem,
          destino: carga.destino,
          frete_oferta: carga.frete_oferta,
          frete_tabela: carga.frete_tabela,
        },
        'Negociação reaberta',
      )
      return { ok: true }
    },
    [config.prazo_oferta_padrao_minutos, flushKanbanPush],
  )

  const recusarCargaMinerva = useCallback((cargaId: string) => {
    setState((prev) => ({
      ...prev,
      cargas: prev.cargas.map((c) =>
        c.id === cargaId
          ? {
              ...c,
              status: 'recusadas' as const,
              transportador_vencedor_id: null,
              frete_fechado: null,
              placa: null,
              motorista: null,
            }
          : c,
      ),
      lances: prev.lances.map((l) =>
        l.carga_id === cargaId && l.status === 'vencedor'
          ? { ...l, status: 'recusado' as const }
          : l,
      ),
    }))
  }, [])

  const moverCargaKanban = useCallback(
    (cargaId: string, targetColumn: string) => {
      const carga = state.cargas.find((c) => c.id === cargaId)
      if (!carga) return { ok: false, error: 'Carga não encontrada' }

      const temLanceAtivo = state.lances.some(
        (l) => l.carga_id === cargaId && l.status === 'ativo',
      )

      let fromCol: string = carga.status
      if (
        carga.transportador_vencedor_id &&
        !['alocadas', 'recusadas', 'canceladas'].includes(carga.status)
      ) {
        fromCol = 'confirmadas'
      } else if (
        !carga.transportador_vencedor_id &&
        ['negociando', 'propostas'].includes(carga.status) &&
        temLanceAtivo
      ) {
        fromCol = 'negociando'
      } else if (
        !carga.transportador_vencedor_id &&
        (carga.status === 'nova_carga' ||
          (['negociando', 'propostas'].includes(carga.status) && !temLanceAtivo))
      ) {
        fromCol = 'nova_carga'
      }

      if (fromCol === targetColumn) return { ok: true }

      if (targetColumn === 'suspensas') {
        return suspenderCarga(cargaId)
      }

      if (carga.status === 'suspensas') {
        if (targetColumn === 'negociando' || targetColumn === 'propostas') {
          return retomarCarga(cargaId)
        }
        if (targetColumn === 'canceladas') {
          return cancelarPublicacao(cargaId)
        }
        if (targetColumn === 'nova_carga') {
          return republicarCarga(cargaId)
        }
        return {
          ok: false,
          error: 'Da suspensa, solte em Negociando, Propostas, Canceladas ou Nova carga',
        }
      }

      if (targetColumn === 'canceladas') {
        return cancelarPublicacao(cargaId)
      }

      if (targetColumn === 'nova_carga') {
        if (carga.status === 'nova_carga') return { ok: true }
        return republicarCarga(cargaId)
      }

      if (targetColumn === 'confirmadas') {
        return {
          ok: false,
          error: 'Para confirmar, aceite um lance no painel da carga',
        }
      }

      if (targetColumn === 'alocadas') {
        return {
          ok: false,
          error: 'Para alocar, informe placa e motorista no painel',
        }
      }

      if (targetColumn === 'recusadas') {
        if (!carga.transportador_vencedor_id) {
          return { ok: false, error: 'Só é possível recusar frete já fechado' }
        }
        recusarCargaMinerva(cargaId)
        return { ok: true }
      }

      if (targetColumn === 'negociando') {
        if (carga.status === 'nova_carga') {
          return {
            ok: false,
            needsPublish: true,
            error: 'Publique a carga — ela fica em Nova Carga até o primeiro lance',
          }
        }
        if (['negociando', 'propostas'].includes(carga.status) && !carga.transportador_vencedor_id) {
          if (!temLanceAtivo) {
            return {
              ok: false,
              error: 'Negociando só depois que alguém der um lance',
            }
          }
          return { ok: true }
        }
        if (
          ['canceladas', 'recusadas', 'alocadas'].includes(carga.status) ||
          Boolean(carga.transportador_vencedor_id)
        ) {
          return reabrirNegociacao(cargaId)
        }
        return { ok: false, error: 'Não é possível mover para Negociando' }
      }

      if (targetColumn === 'propostas') {
        // Coluna unificada com Negociando no board
        if (carga.status === 'nova_carga') {
          return {
            ok: false,
            needsPublish: true,
            error: 'Publique a carga — ela fica em Nova Carga até o primeiro lance',
          }
        }
        if (['negociando', 'propostas'].includes(carga.status) && !carga.transportador_vencedor_id) {
          if (!temLanceAtivo) {
            return {
              ok: false,
              error: 'Negociando só depois que alguém der um lance',
            }
          }
          return { ok: true }
        }
        return { ok: false, error: 'Movimento não permitido' }
      }

      return { ok: false, error: 'Movimento não permitido nesta coluna' }
    },
    [
      state.cargas,
      state.lances,
      suspenderCarga,
      retomarCarga,
      cancelarPublicacao,
      republicarCarga,
      reabrirNegociacao,
      recusarCargaMinerva,
      user,
    ],
  )

  const recusarCargaTransportador = useCallback(
    (cargaId: string) => {
      const tid = actingTransportadorId || userRef.current?.transportador_id
      if (!tid) return { ok: false as const, error: 'Usuário sem transportador' }

      const prev = stateRef.current
      const carga = prev.cargas.find((c) => c.id === cargaId)
      if (!carga) return { ok: false as const, error: 'Carga não encontrada' }
      if (carga.transportador_vencedor_id) {
        return { ok: false as const, error: 'Frete já fechado — não é possível recusar' }
      }
      if (!['negociando', 'propostas', 'suspensas'].includes(carga.status)) {
        return { ok: false as const, error: 'Carga não está aberta para recusa' }
      }

      const jaRecusou = (carga.recusado_por_ids ?? []).includes(tid)
      if (jaRecusou) return { ok: true as const }

      const agora = new Date().toISOString()
      const userNow = userRef.current
      const next: DataState = {
        ...prev,
        cargas: prev.cargas.map((c) => {
          if (c.id !== cargaId) return c
          const ids = [...(c.recusado_por_ids ?? [])]
          if (!ids.includes(tid)) ids.push(tid)
          return {
            ...c,
            recusado_por_ids: ids,
            recusas: (c.recusas ?? 0) + 1,
            updated_at: agora,
          }
        }),
        lances: prev.lances.map((l) =>
          l.carga_id === cargaId && l.transportador_id === tid && l.status === 'ativo'
            ? { ...l, status: 'cancelado' as const, updated_at: agora }
            : l,
        ),
        transportadores: prev.transportadores.map((t) => {
          if (t.id !== tid) return t
          const pontuacao = t.pontuacao + PONTOS_ADERENCIA.recusada
          return { ...t, pontuacao, classificacao: classificacaoPorPontuacao(pontuacao) }
        }),
        historico: [
          makeHistorico(
            'frete_recusado',
            `Oferta recusada pelo transportador — ${carga.numero}`,
            {
              carga_id: cargaId,
              transportador_id: tid,
            },
            userNow,
          ),
          ...prev.historico,
        ].slice(0, 2000),
        notificacoes: pushNotif(prev.notificacoes, {
          role: 'minerva',
          titulo: 'Oferta recusada',
          mensagem: `Um transportador recusou a carga ${carga.numero}.`,
          carga_id: cargaId,
        }),
      }
      stateRef.current = next
      setState(next)
      flushKanbanPush(next)
      return { ok: true as const }
    },
    [actingTransportadorId, flushKanbanPush],
  )

  const alocarComposicao = useCallback(
    async (
      cargaId: string,
      placa: string,
      motorista: string,
      opts?: { veiculoId?: string; motoristaId?: string },
    ) => {
      if (!placa.trim() || !motorista.trim()) {
        return { ok: false, error: 'Informe placa e o nome do motorista' }
      }
      const placaNorm = placa.toUpperCase().trim()
      const motoristaNorm = motorista.trim()
      const base = stateRef.current.cargas.find((c) => c.id === cargaId)
      if (!base) return { ok: false, error: 'Carga não encontrada' }
      if (!base.transportador_vencedor_id) {
        return { ok: false, error: 'Frete ainda não fechado' }
      }

      const agora = new Date().toISOString()
      const cargaAlocada: Carga = {
        ...base,
        status: 'alocadas',
        status_viagem: 'aguardando_inicio',
        placa: placaNorm,
        motorista: motoristaNorm,
        veiculo_id: opts?.veiculoId || base.veiculo_id || null,
        motorista_id: opts?.motoristaId || base.motorista_id || null,
        updated_at: agora,
      }

      setState((prev) => {
        const hist = makeHistorico('carga_alocada', `Composição alocada — ${base.numero}`, {
          carga_id: cargaId,
          transportador_id: base.transportador_vencedor_id,
          detalhe: `${placaNorm} · ${motoristaNorm}`,
        })
        const next = {
          ...prev,
          cargas: prev.cargas.map((c) => (c.id === cargaId ? cargaAlocada : c)),
          historico: [hist, ...prev.historico].slice(0, 2000),
        }
        flushKanbanPush(next)
        return next
      })

      try {
        const resultado = await enviarControleFretes(cargaAlocada, config)
        const integracao: IntegracaoFrete = { id: uid('intg'), ...resultado }
        setState((prev) => ({
          ...prev,
          integracoes: [integracao, ...prev.integracoes].slice(0, 500),
          historico: [
            makeHistorico('integracao_fretes', `Controle de Fretes — ${resultado.status}`, {
              carga_id: cargaId,
              detalhe: resultado.resposta,
            }),
            ...prev.historico,
          ].slice(0, 2000),
        }))
      } catch {
        /* alocação local já persistiu — integração é secundária */
      }

      return { ok: true }
    },
    [config, flushKanbanPush],
  )

  const iniciarViagem = useCallback(
    (cargaId: string) => {
      const base = stateRef.current.cargas.find((c) => c.id === cargaId)
      if (!base) return { ok: false, error: 'Carga não encontrada' }
      if (base.status !== 'alocadas') {
        return { ok: false, error: 'Só viagens alocadas podem ser iniciadas' }
      }
      const st = base.status_viagem || 'aguardando_inicio'
      if (st !== 'aguardando_inicio') {
        return { ok: false, error: 'Esta viagem já foi iniciada ou encerrada' }
      }
      const agora = new Date().toISOString()
      setState((prev) => {
        const next = {
          ...prev,
          cargas: prev.cargas.map((c) =>
            c.id === cargaId
              ? {
                  ...c,
                  status_viagem: 'rota_iniciada' as const,
                  viagem_iniciada_em: agora,
                  updated_at: agora,
                }
              : c,
          ),
          historico: [
            makeHistorico('viagem_iniciada', `Viagem iniciada — ${base.numero}`, {
              carga_id: cargaId,
              transportador_id: base.transportador_vencedor_id,
              detalhe: `${base.placa} · ${base.motorista}`,
            }),
            ...prev.historico,
          ].slice(0, 2000),
          notificacoes: pushNotif(prev.notificacoes, {
            role: 'minerva',
            titulo: 'Viagem iniciada',
            mensagem: `Carga ${base.numero}: ${base.placa} · ${base.motorista}`,
            carga_id: cargaId,
            href: '/embarcador/viagens',
          }),
        }
        flushKanbanPush(next)
        return next
      })
      return { ok: true }
    },
    [flushKanbanPush],
  )

  const finalizarViagem = useCallback(
    (cargaId: string) => {
      const base = stateRef.current.cargas.find((c) => c.id === cargaId)
      if (!base) return { ok: false, error: 'Carga não encontrada' }
      if (base.status !== 'alocadas') {
        return { ok: false, error: 'Só viagens alocadas podem ser finalizadas' }
      }
      if (base.status_viagem !== 'rota_iniciada') {
        return { ok: false, error: 'Inicie a viagem antes de finalizar' }
      }
      const agora = new Date().toISOString()
      setState((prev) => {
        const next = {
          ...prev,
          cargas: prev.cargas.map((c) =>
            c.id === cargaId
              ? {
                  ...c,
                  status_viagem: 'rota_finalizada' as const,
                  viagem_finalizada_em: agora,
                  updated_at: agora,
                }
              : c,
          ),
          historico: [
            makeHistorico('viagem_finalizada', `Viagem finalizada — ${base.numero}`, {
              carga_id: cargaId,
              transportador_id: base.transportador_vencedor_id,
              detalhe: `${base.placa} · ${base.motorista}`,
            }),
            ...prev.historico,
          ].slice(0, 2000),
          notificacoes: pushNotif(prev.notificacoes, {
            role: 'minerva',
            titulo: 'Viagem finalizada — avaliar',
            mensagem: `Carga ${base.numero}: avalie motorista e veículo (1 a 5 estrelas).`,
            carga_id: cargaId,
            href: '/embarcador/viagens',
          }),
        }
        flushKanbanPush(next)
        return next
      })

      // Atualiza localização da placa para o destino (se ligado nas configs do transportador)
      void (async () => {
        try {
          const veiculo = (stateRef.current.veiculos ?? []).find(
            (v) => v.id === base.veiculo_id,
          )
          const rota = base.rota_id
            ? stateRef.current.rotas.find((r) => r.id === base.rota_id)
            : undefined
          const patch = await montarPatchLocalizacaoAposViagem({
            carga: base,
            veiculo,
            rota,
          })
          if (!patch || !veiculo) return
          const atualizado = {
            ...veiculo,
            ...patch,
            updated_at: new Date().toISOString(),
          }
          setState((prev) => {
            const next = {
              ...prev,
              veiculos: (prev.veiculos ?? []).map((v) =>
                v.id === atualizado.id ? atualizado : v,
              ),
              historico: [
                makeHistorico(
                  'viagem_finalizada',
                  `Localização da placa atualizada — ${base.placa || atualizado.placa}`,
                  {
                    carga_id: cargaId,
                    transportador_id: base.transportador_vencedor_id,
                    detalhe: `Nova posição: ${base.destino}`,
                  },
                ),
                ...prev.historico,
              ].slice(0, 2000),
            }
            flushKanbanPush(next)
            return next
          })
          void upsertVeiculoRemote(atualizado)
        } catch (e) {
          console.warn('[finalizarViagem] localização:', e)
        }
      })()

      return { ok: true }
    },
    [flushKanbanPush],
  )

  const cancelarViagem = useCallback(
    (cargaId: string, motivo?: string) => {
      const base = stateRef.current.cargas.find((c) => c.id === cargaId)
      if (!base) return { ok: false, error: 'Carga não encontrada' }
      if (base.status !== 'alocadas') {
        return { ok: false, error: 'Só viagens alocadas podem ser canceladas' }
      }
      const st = base.status_viagem || 'aguardando_inicio'
      if (st === 'rota_finalizada' || st === 'cancelada') {
        return { ok: false, error: 'Esta viagem já foi encerrada' }
      }
      const agora = new Date().toISOString()
      const motivoLimpo = (motivo || '').trim() || null
      setState((prev) => {
        const next = {
          ...prev,
          cargas: prev.cargas.map((c) =>
            c.id === cargaId
              ? {
                  ...c,
                  status_viagem: 'cancelada' as const,
                  viagem_cancelada_em: agora,
                  motivo_cancelamento_viagem: motivoLimpo,
                  updated_at: agora,
                }
              : c,
          ),
          historico: [
            makeHistorico('viagem_cancelada', `Viagem cancelada — ${base.numero}`, {
              carga_id: cargaId,
              transportador_id: base.transportador_vencedor_id,
              detalhe: motivoLimpo || 'Cancelada no percurso',
            }),
            ...prev.historico,
          ].slice(0, 2000),
          notificacoes: pushNotif(prev.notificacoes, {
            role: 'minerva',
            titulo: 'Viagem cancelada',
            mensagem: `Carga ${base.numero}${motivoLimpo ? `: ${motivoLimpo}` : ''}`,
            carga_id: cargaId,
            href: '/embarcador/viagens',
          }),
        }
        flushKanbanPush(next)
        return next
      })
      return { ok: true }
    },
    [flushKanbanPush],
  )

  const avaliarViagem = useCallback(
    async (
      cargaId: string,
      opts: { notaMotorista: number; notaVeiculo: number; comentario?: string },
    ) => {
      const notaM = Math.round(opts.notaMotorista)
      const notaV = Math.round(opts.notaVeiculo)
      if (notaM < 1 || notaM > 5) {
        return { ok: false, error: 'Nota do motorista deve ser de 1 a 5' }
      }
      if (notaV < 1 || notaV > 5) {
        return { ok: false, error: 'Nota do veículo deve ser de 1 a 5' }
      }
      const base = stateRef.current.cargas.find((c) => c.id === cargaId)
      if (!base) return { ok: false, error: 'Carga não encontrada' }
      if (base.status_viagem !== 'rota_finalizada') {
        return { ok: false, error: 'Só é possível avaliar após finalizar a viagem' }
      }
      if (base.avaliado_em) {
        return { ok: false, error: 'Esta viagem já foi avaliada' }
      }
      const agora = new Date().toISOString()
      const comentario = (opts.comentario || '').trim() || null

      setState((prev) => {
        let motoristas = prev.motoristas
        let veiculos = prev.veiculos

        if (base.motorista_id) {
          motoristas = motoristas.map((m) => {
            if (m.id !== base.motorista_id) return m
            const total = (m.total_avaliacoes ?? 0) + 1
            const soma = (m.avaliacao ?? 0) * (m.total_avaliacoes ?? 0) + notaM
            return {
              ...m,
              avaliacao: Math.round((soma / total) * 10) / 10,
              total_avaliacoes: total,
              updated_at: agora,
            }
          })
        }
        if (base.veiculo_id) {
          veiculos = veiculos.map((v) => {
            if (v.id !== base.veiculo_id) return v
            const total = (v.total_avaliacoes ?? 0) + 1
            const soma = (v.avaliacao ?? 0) * (v.total_avaliacoes ?? 0) + notaV
            return {
              ...v,
              avaliacao: Math.round((soma / total) * 10) / 10,
              total_avaliacoes: total,
              updated_at: agora,
            }
          })
        }

        const next = {
          ...prev,
          cargas: prev.cargas.map((c) =>
            c.id === cargaId
              ? {
                  ...c,
                  avaliacao_motorista: notaM,
                  avaliacao_veiculo: notaV,
                  avaliacao_comentario: comentario,
                  avaliado_em: agora,
                  updated_at: agora,
                }
              : c,
          ),
          motoristas,
          veiculos,
          historico: [
            makeHistorico(
              'viagem_avaliada',
              `Avaliação — ${base.numero}`,
              {
                carga_id: cargaId,
                transportador_id: base.transportador_vencedor_id,
                detalhe: `Motorista ${notaM}/5 · Veículo ${notaV}/5${
                  comentario ? ` · ${comentario}` : ''
                }`,
              },
              userRef.current,
            ),
            ...prev.historico,
          ].slice(0, 2000),
          notificacoes: pushNotif(prev.notificacoes, {
            role: 'transportador',
            transportador_id: base.transportador_vencedor_id,
            titulo: 'Avaliação recebida',
            mensagem: `Carga ${base.numero}: motorista ${notaM}/5 · veículo ${notaV}/5`,
            carga_id: cargaId,
            href: '/transportador/viagens',
          }),
        }
        flushKanbanPush(next)
        return next
      })
      return { ok: true }
    },
    [flushKanbanPush],
  )

  const registrarVisualizacao = useCallback(
    (cargaId: string) => {
      setState((prev) => ({
        ...prev,
        cargas: prev.cargas.map((c) =>
          c.id === cargaId ? { ...c, visualizacoes: c.visualizacoes + 1 } : c,
        ),
      }))
    },
    [],
  )

  const salvarGrupo = useCallback((grupo: GrupoTransportador) => {
    const agora = new Date().toISOString()
    // Canonicaliza e remove duplicatas (t1 ↔ UUID demo, etc.)
    const idsCanon = Array.from(
      new Set(
        (grupo.transportador_ids ?? [])
          .map((id) => canonicalTransportadorId(id) ?? id)
          .filter(Boolean),
      ),
    )
    const salvo: GrupoTransportador = {
      ...grupo,
      transportador_ids: idsCanon,
      updated_at: agora,
    }
    setState((prev) => {
      const exists = prev.grupos.some((g) => g.id === salvo.id)
      const next = {
        ...prev,
        grupos: exists
          ? prev.grupos.map((g) => (g.id === salvo.id ? salvo : g))
          : [...prev.grupos, salvo],
      }
      stateRef.current = next
      // Flush imediato — não depender só do debounce (outro aparelho sobrescrevia)
      queueMicrotask(() => flushKanbanPush(next))
      return next
    })
  }, [flushKanbanPush])

  const salvarTransportador = useCallback((t: Transportador) => {
    const perfil = t.perfil_publico
      ? normalizePerfilPublico(t.perfil_publico)
      : t.perfil_publico === null
        ? normalizePerfilPublico(null)
        : t.perfil_publico
    const salvo: Transportador = {
      ...t,
      perfil_publico: perfil ?? t.perfil_publico,
    }
    if (salvo.situacao === 'ativo') setPortalAccountAtivoPorTransportador(salvo.id, true)
    if (
      salvo.situacao === 'pendente' ||
      salvo.situacao === 'recusado' ||
      salvo.situacao === 'inativo'
    ) {
      setPortalAccountAtivoPorTransportador(salvo.id, false)
    }
    setState((prev) => {
      const exists = prev.transportadores.some((x) => x.id === salvo.id)
      const next = {
        ...prev,
        transportadores: exists
          ? prev.transportadores.map((x) => (x.id === salvo.id ? salvo : x))
          : [...prev.transportadores, salvo],
      }
      flushKanbanPush(next)
      return next
    })
    if (salvo.situacao === 'inativo' || salvo.situacao === 'recusado') {
      removeTransportadoraDaHierarquia(salvo.id)
    } else {
      syncTransportadoraNaHierarquia({
        id: salvo.id,
        nome_fantasia: salvo.nome_fantasia,
        cnpj: salvo.cnpj,
      })
    }
    if (salvo.perfil_publico) {
      void salvarPerfilPublicoRemoto(salvo.id, salvo.perfil_publico)
    }
  }, [flushKanbanPush])

  const atualizarLogoTransportador = useCallback(
    async (transportadorId: string, file: File | null) => {
      const tid = canonicalTransportadorId(transportadorId) || transportadorId
      const atual =
        stateRef.current.transportadores.find((t) => t.id === tid) ||
        stateRef.current.transportadores.find((t) => t.id === transportadorId)
      if (!atual) return { ok: false, error: 'Transportador não encontrado.' }
      const result = await atualizarLogoTransportadorRemoto(tid, file)
      if (!result.ok) return { ok: false, error: result.erro }
      const next: Transportador = {
        ...atual,
        id: tid,
        logo_url: result.logo_url || undefined,
      }
      setState((prev) => {
        const nextState = {
          ...prev,
          transportadores: prev.transportadores.map((t) =>
            t.id === tid || t.id === transportadorId ? next : t,
          ),
        }
        stateRef.current = nextState
        return nextState
      })
      return { ok: true }
    },
    [],
  )

  const atualizarAvatarPerfil = useCallback(async (file: File | null) => {
    const u = user
    if (!u?.id) return { ok: false, error: 'Faça login novamente.' }
    // Transportador com empresa: mantém logo da empresa em sync
    const tid = canonicalTransportadorId(u.transportador_id || null)
    if (tid && u.role === 'transportador') {
      const logo = await atualizarLogoTransportador(tid, file)
      if (!logo.ok) return logo
    }
    const result = await atualizarAvatarUsuarioRemoto(u.id, file, {
      email: u.email,
      usuario: u.usuario,
    })
    if (!result.ok) return { ok: false, error: result.erro }
    // Mantém avatar também no cache de contas do portal (sobrevida a novo login)
    try {
      const accounts = loadPortalAccounts().map((a) => {
        const mesmoId = a.id === u.id
        const mesmoEmail =
          u.email && a.email?.toLowerCase() === u.email.toLowerCase()
        const mesmoUser =
          u.usuario && a.usuario?.toLowerCase() === u.usuario.toLowerCase()
        if (!mesmoId && !mesmoEmail && !mesmoUser) return a
        return { ...a, avatar_url: result.avatar_url }
      })
      savePortalAccounts(accounts)
    } catch {
      /* ignore */
    }
    setUser((prev) => {
      if (!prev) return prev
      return { ...prev, avatar_url: result.avatar_url }
    })
    return { ok: true }
  }, [user, atualizarLogoTransportador])

  const setDisponivelMapaVeiculo = useCallback(
    async (veiculoId: string, disponivel: boolean) => {
      const atual = stateRef.current.veiculos.find((x) => x.id === veiculoId)
      if (!atual) return { ok: false, error: 'Veículo não encontrado.' }
      const nextVeiculo = { ...atual, disponivel_mapa: disponivel }
      const prev = stateRef.current
      const next = {
        ...prev,
        veiculos: (prev.veiculos ?? []).map((v) => (v.id === veiculoId ? nextVeiculo : v)),
      }
      stateRef.current = next
      setState(next)
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('veiculos')
          .update({ disponivel_mapa: disponivel })
          .eq('id', veiculoId)
        if (error && !/Could not find|schema cache/i.test(error.message)) {
          return { ok: false, error: error.message }
        }
      }
      return { ok: true }
    },
    [],
  )

  const setDisponivelMapa = useCallback(
    async (transportadorId: string, disponivel: boolean) => {
      const prev = stateRef.current
      const list = (prev.veiculos ?? []).filter((v) => v.transportador_id === transportadorId)
      if (list.length === 0) {
        return { ok: false, error: 'Nenhuma placa cadastrada para esta transportadora.' }
      }
      const ids = new Set(list.map((v) => v.id))
      const next = {
        ...prev,
        veiculos: (prev.veiculos ?? []).map((v) =>
          ids.has(v.id) ? { ...v, disponivel_mapa: disponivel } : v,
        ),
        // Mantém flag legado no transportador (compat)
        transportadores: prev.transportadores.map((t) =>
          t.id === transportadorId ? { ...t, disponivel_mapa: disponivel } : t,
        ),
      }
      stateRef.current = next
      setState(next)
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('veiculos')
          .update({ disponivel_mapa: disponivel })
          .eq('transportador_id', transportadorId)
        if (error && !/Could not find|schema cache/i.test(error.message)) {
          return { ok: false, error: error.message }
        }
      }
      return { ok: true }
    },
    [],
  )

  const vinculosTransportador = useCallback(
    (id: string) => {
      const placas = (state.veiculos ?? [])
        .filter((v) => v.transportador_id === id)
        .map((v) => v.placa)
      const motoristas = (state.motoristas ?? [])
        .filter((m) => m.transportador_id === id)
        .map((m) => m.nome)
      const documentos = (state.documentos ?? []).filter((d) => d.transportador_id === id).length
      const grupos = (state.grupos ?? [])
        .filter((g) => g.transportador_ids.includes(id))
        .map((g) => g.descricao)
      const lances = (state.lances ?? []).filter((l) => l.transportador_id === id).length
      const cargasVencedor = (state.cargas ?? [])
        .filter((c) => c.transportador_vencedor_id === id)
        .map((c) => c.numero)
      return { placas, motoristas, documentos, grupos, lances, cargasVencedor }
    },
    [state.veiculos, state.motoristas, state.documentos, state.grupos, state.lances, state.cargas],
  )

  const excluirTransportador = useCallback(
    async (id: string) => {
      const t = state.transportadores.find((x) => x.id === id)
      if (!t) return { ok: false, error: 'Transportadora não encontrada.' }

      const vinculos = vinculosTransportador(id)
      removePortalAccountsPorTransportador(id)
      removeTransportadoraDaHierarquia(id)

      // Apaga no Supabase; sem isso o refresh (15s) traz o cadastro de volta
      let avisoRemoto = ''
      if (isSupabaseConfigured && supabase) {
        const docs = (state.documentos ?? []).filter((d) => d.transportador_id === id)
        const paths = docs.map((d) => d.storage_path).filter((p): p is string => Boolean(p))
        if (paths.length > 0) {
          await supabase.storage.from('documentos-transportadores').remove(paths)
        }
        await supabase.from('transportador_documentos').delete().eq('transportador_id', id)
        await supabase.from('grupo_transportador_membros').delete().eq('transportador_id', id)
        await supabase.from('profiles').update({ transportador_id: null }).eq('transportador_id', id)
        const { data, error } = await supabase
          .from('transportadores')
          .delete()
          .eq('id', id)
          .select('id')
        if (error) {
          avisoRemoto = `Removida localmente, mas o Supabase recusou: ${error.message}`
        } else if (!data || data.length === 0) {
          avisoRemoto =
            'Removida localmente, mas o Supabase não apagou nenhuma linha (falta policy de DELETE para anon). Rode supabase/rls_exclusao_transportador.sql.'
        }
      }

      const hist = makeHistorico(
        'transportador_excluido',
        `Transportadora excluída — ${t.nome_fantasia}`,
        {
          transportador_id: id,
          detalhe: [
            vinculos.placas.length ? `Placas: ${vinculos.placas.join(', ')}` : null,
            vinculos.motoristas.length ? `Motoristas: ${vinculos.motoristas.join(', ')}` : null,
            vinculos.documentos ? `${vinculos.documentos} documento(s)` : null,
            vinculos.grupos.length ? `Grupos: ${vinculos.grupos.join(', ')}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        },
        user,
      )
      const prev = stateRef.current
      const next: DataState = {
        ...prev,
        transportadores: prev.transportadores.filter((x) => x.id !== id),
        veiculos: (prev.veiculos ?? []).filter((v) => v.transportador_id !== id),
        motoristas: (prev.motoristas ?? []).filter((m) => m.transportador_id !== id),
        documentos: (prev.documentos ?? []).filter((d) => d.transportador_id !== id),
        lances: (prev.lances ?? []).filter((l) => l.transportador_id !== id),
        historicoPropostas: (prev.historicoPropostas ?? []).filter(
          (h) => h.transportador_id !== id,
        ),
        interacoes: (prev.interacoes ?? []).filter((i) => i.transportador_id !== id),
        grupos: (prev.grupos ?? []).map((g) => ({
          ...g,
          transportador_ids: g.transportador_ids.filter((tid) => tid !== id),
        })),
        cargas: (prev.cargas ?? []).map((c) =>
          c.transportador_vencedor_id === id ? { ...c, transportador_vencedor_id: null } : c,
        ),
        transportadores_excluidos: [
          ...(prev.transportadores_excluidos ?? []).filter((x) => x !== id),
          id,
        ].slice(-500),
        veiculos_excluidos: [
          ...(prev.veiculos_excluidos ?? []),
          ...(prev.veiculos ?? []).filter((v) => v.transportador_id === id).map((v) => v.id),
        ].slice(-500),
        motoristas_excluidos: [
          ...(prev.motoristas_excluidos ?? []),
          ...(prev.motoristas ?? []).filter((m) => m.transportador_id === id).map((m) => m.id),
        ].slice(-500),
        historico: [hist, ...prev.historico].slice(0, 2000),
      }
      stateRef.current = next
      setState(next)
      flushKanbanPush(next)
      return avisoRemoto ? { ok: true, error: avisoRemoto } : { ok: true }
    },
    [state.transportadores, state.documentos, vinculosTransportador, user, flushKanbanPush],
  )

  const documentosDoTransportador = useCallback(
    (transportadorId: string) =>
      (state.documentos ?? []).filter((d) => d.transportador_id === transportadorId),
    [state.documentos],
  )

  const excluirDocumentoTransportador = useCallback(async (documentoId: string) => {
    const doc = stateRef.current.documentos?.find((d) => d.id === documentoId)
    if (!doc) return { ok: false, error: 'Documento não encontrado.' }

    if (isSupabaseConfigured && supabase) {
      if (doc.storage_path) {
        await supabase.storage.from('documentos-transportadores').remove([doc.storage_path])
      }
      const { error } = await supabase.from('transportador_documentos').delete().eq('id', documentoId)
      if (error) return { ok: false, error: error.message }
    }

    setState((prev) => {
      const next = {
        ...prev,
        documentos: (prev.documentos ?? []).filter((d) => d.id !== documentoId),
      }
      stateRef.current = next
      return next
    })
    flushKanbanPush(stateRef.current)
    return { ok: true }
  }, [flushKanbanPush])

  const substituirDocumentoTransportador = useCallback(
    async (documentoId: string, file: File) => {
      const doc = stateRef.current.documentos?.find((d) => d.id === documentoId)
      if (!doc) return { ok: false, error: 'Documento não encontrado.' }

      const now = new Date().toISOString()
      let url = ''
      let storage_path = doc.storage_path

      if (isSupabaseConfigured && supabase) {
        const safeName = file.name.replace(/[^\w.\-]+/g, '_')
        const path = `${doc.transportador_id}/${doc.tipo}-${Date.now()}-${safeName}`
        const { error: upErr } = await supabase.storage
          .from('documentos-transportadores')
          .upload(path, file, { upsert: true })
        if (upErr) return { ok: false, error: upErr.message }

        if (doc.storage_path && doc.storage_path !== path) {
          await supabase.storage.from('documentos-transportadores').remove([doc.storage_path])
        }

        const { data: pub } = supabase.storage.from('documentos-transportadores').getPublicUrl(path)
        url = pub.publicUrl
        storage_path = path

        const { error } = await supabase
          .from('transportador_documentos')
          .update({
            nome_arquivo: file.name,
            url,
            storage_path: path,
          })
          .eq('id', documentoId)
        if (error) return { ok: false, error: error.message }
      } else {
        url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error('Falha ao ler arquivo'))
          reader.readAsDataURL(file)
        })
      }

      setState((prev) => {
        const next = {
          ...prev,
          documentos: (prev.documentos ?? []).map((d) =>
            d.id === documentoId
              ? {
                  ...d,
                  nome_arquivo: file.name,
                  url,
                  storage_path,
                  created_at: now,
                }
              : d,
          ),
        }
        stateRef.current = next
        return next
      })
      flushKanbanPush(stateRef.current)
      return { ok: true }
    },
    [flushKanbanPush],
  )

  const registrarCadastroTransportador = useCallback(
    async (input: CadastroTransportadorInput) => {
      const result = await submeterCadastroTransportador(input)
      if (!result.ok) return { ok: false, error: result.erro }
      setState((prev) => {
        let notificacoes = prev.notificacoes
        if (result.transportador.situacao === 'pendente') {
          notificacoes = pushNotif(notificacoes, notifCadastroPendente(result.transportador))
        }
        const next = {
          ...prev,
          transportadores: [
            ...prev.transportadores.filter((t) => t.id !== result.transportador.id),
            result.transportador,
          ],
          documentos: [
            ...(prev.documentos ?? []).filter((d) => d.transportador_id !== result.transportador.id),
            ...result.documentos,
          ],
          notificacoes,
        }
        stateRef.current = next
        return next
      })
      syncTransportadoraNaHierarquia({
        id: result.transportador.id,
        nome_fantasia: result.transportador.nome_fantasia,
        cnpj: result.transportador.cnpj,
      })
      flushKanbanPush(stateRef.current)
      return { ok: true, mensagem: result.mensagem }
    },
    [flushKanbanPush],
  )

  const gravarSituacaoTransportador = useCallback(
    async (
      id: string,
      situacao: 'ativo' | 'recusado',
      motivoRecusa?: string | null,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!isSupabaseConfigured || !supabase) return { ok: true }

      const tentar = async (body: Record<string, unknown>) => {
        const { data, error } = await supabase
          .from('transportadores')
          .update(body)
          .eq('id', id)
          .select('id, situacao')
          .maybeSingle()
        return { data, error }
      }

      let body: Record<string, unknown> =
        situacao === 'ativo'
          ? { situacao: 'ativo', motivo_recusa: null }
          : { situacao: 'recusado', motivo_recusa: motivoRecusa ?? null }

      let { data, error } = await tentar(body)

      // Coluna motivo_recusa pode faltar se a migration ainda não rodou
      if (error && /motivo_recusa|schema cache|Could not find/i.test(error.message)) {
        body = { situacao }
        ;({ data, error } = await tentar(body))
      }

      if (error) {
        return {
          ok: false,
          error: `Falha ao gravar no banco: ${error.message}`,
        }
      }
      // RLS bloqueia UPDATE do anon sem retornar erro — 0 linhas
      if (!data) {
        return {
          ok: false,
          error:
            'A aprovação não gravou no banco (permissão RLS). No Supabase SQL Editor, execute o arquivo supabase/rls_aprovacao_cadastro.sql e tente de novo.',
        }
      }

      await supabase
        .from('profiles')
        .update({ ativo: situacao === 'ativo' })
        .eq('transportador_id', id)

      // Fonte da verdade do login do portal: usuarios.ativo
      // Atualiza por transportador_id E por e-mail (cadastros com vínculo incompleto).
      const liberar = situacao === 'ativo'
      let email = (stateRef.current.transportadores.find((t) => t.id === id)?.email || '')
        .trim()
        .toLowerCase()
      if (!email) {
        const { data: tRow } = await supabase
          .from('transportadores')
          .select('email')
          .eq('id', id)
          .maybeSingle()
        email = String((tRow as { email?: string } | null)?.email || '')
          .trim()
          .toLowerCase()
      }

      const marcarUsuariosAtivo = async () => {
        const aplicar = async (filtro: {
          column: 'transportador_id' | 'email'
          value: string
        }) => {
          const base = { ativo: liberar, updated_at: new Date().toISOString() }
          let q =
            filtro.column === 'transportador_id'
              ? supabase.from('usuarios').update(base).eq('transportador_id', filtro.value)
              : supabase.from('usuarios').update(base).ilike('email', filtro.value)
          let { data, error } = await q.select('id')
          if (error && /updated_at/i.test(error.message)) {
            const sem = { ativo: liberar }
            q =
              filtro.column === 'transportador_id'
                ? supabase.from('usuarios').update(sem).eq('transportador_id', filtro.value)
                : supabase.from('usuarios').update(sem).ilike('email', filtro.value)
            ;({ data, error } = await q.select('id'))
          }
          return { data, error }
        }

        let { data, error } = await aplicar({ column: 'transportador_id', value: id })
        if (error) {
          console.warn('[aprovacao] falha ao atualizar usuarios.ativo:', error.message)
          return false
        }
        if ((!data || data.length === 0) && email) {
          ;({ data, error } = await aplicar({ column: 'email', value: email }))
          if (error) {
            console.warn('[aprovacao] falha ao atualizar usuarios por email:', error.message)
            return false
          }
        }
        if (!data?.length) {
          console.warn('[aprovacao] nenhum usuario atualizado para transportador', id)
          return false
        }
        return true
      }

      const okUsuarios = await marcarUsuariosAtivo()
      if (!okUsuarios && liberar) {
        return {
          ok: false,
          error:
            'Transportadora aprovada, mas o login (usuarios.ativo) não liberou. Tente de novo ou ative a conta em Portal / Usuários.',
        }
      }

      return { ok: true }
    },
    [],
  )

  const aprovarTransportador = useCallback(async (id: string) => {
    const remote = await gravarSituacaoTransportador(id, 'ativo')
    if (!remote.ok) return remote

    setPortalAccountAtivoPorTransportador(id, true)
    const prev = stateRef.current
    const atual = prev.transportadores.find((t) => t.id === id)
    if (atual) {
      syncTransportadoraNaHierarquia({
        id: atual.id,
        nome_fantasia: atual.nome_fantasia,
        cnpj: atual.cnpj,
      })
    }
    const next = {
      ...prev,
      transportadores: prev.transportadores.map((t) =>
        t.id === id ? { ...t, situacao: 'ativo' as const, motivo_recusa: undefined } : t,
      ),
      notificacoes: (prev.notificacoes ?? []).map((n) =>
        n.chave === `cadastro-pendente:${id}` ? { ...n, lida: true } : n,
      ),
    }
    stateRef.current = next
    setState(next)
    flushKanbanPush(next)
    return { ok: true }
  }, [flushKanbanPush, gravarSituacaoTransportador])

  const recusarTransportador = useCallback(async (id: string, motivo?: string) => {
    const motivoTxt = (motivo || '').trim()
    if (!motivoTxt) {
      return { ok: false, error: 'Informe o motivo da recusa. Ele será enviado por e-mail.' }
    }

    const atual = stateRef.current.transportadores.find((t) => t.id === id)
    const emailDestino = (atual?.email || '').trim()
    if (!emailDestino || !emailDestino.includes('@')) {
      return {
        ok: false,
        error: 'Cadastro sem e-mail válido. Não é possível enviar a recusa por e-mail.',
      }
    }

    const linkCadastro =
      typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname || '/'}#/cadastro-transportador`
        : ''

    const mail = await portalEmailRecusaCadastro({
      email: emailDestino,
      nome: atual?.nome_fantasia || atual?.contato_nome || 'Transportador',
      motivo: motivoTxt,
      linkCadastro,
    })
    if (!mail.ok) {
      return { ok: false, error: mail.erro || 'Falha ao enviar e-mail de recusa.' }
    }

    const remote = await gravarSituacaoTransportador(id, 'recusado', motivoTxt)
    if (!remote.ok) return remote

    setPortalAccountAtivoPorTransportador(id, false)
    removePortalAccountsPorTransportador(id)
    removeTransportadoraDaHierarquia(id)
    const prev = stateRef.current
    const next = {
      ...prev,
      transportadores: prev.transportadores.map((t) =>
        t.id === id ? { ...t, situacao: 'recusado' as const, motivo_recusa: motivoTxt } : t,
      ),
      notificacoes: (prev.notificacoes ?? []).map((n) =>
        n.chave === `cadastro-pendente:${id}` ? { ...n, lida: true } : n,
      ),
    }
    stateRef.current = next
    setState(next)
    flushKanbanPush(next)
    return {
      ok: true,
      mensagem: mail.mensagem || `E-mail de recusa enviado para ${emailDestino}.`,
    }
  }, [flushKanbanPush, gravarSituacaoTransportador])

  const salvarVeiculo = useCallback((v: Veiculo) => {
    // Sempre UUID para sincronizar entre Super e transportador
    const id = isUuid(v.id) ? v.id : newVeiculoId()
    const antigoId = v.id !== id ? v.id : null
    let base: Veiculo = {
      ...v,
      id,
      placa: (v.placa || '').trim().toUpperCase(),
      disponivel_mapa: v.disponivel_mapa !== false,
      updated_at: new Date().toISOString(),
    }
    // Sem localização na placa → herda origem da transportadora (aparece no mapa)
    if (veiculoSemLocalizacaoMapa(base) && base.transportador_id) {
      const t = stateRef.current.transportadores.find(
        (x) => x.id === base.transportador_id,
      )
      const patch = t ? localizacaoDaTransportadora(t) : null
      if (patch) {
        base = {
          ...base,
          ...patch,
          raio_km:
            base.raio_km != null && Number(base.raio_km) > 0
              ? Number(base.raio_km)
              : patch.raio_km,
        }
      }
    }
    const salvo = base

    setState((prev) => {
      const list = (prev.veiculos ?? []).filter((x) => x.id !== antigoId)
      const exists = list.some((x) => x.id === salvo.id)
      let veiculos = exists
        ? list.map((x) => (x.id === salvo.id ? salvo : x))
        : [...list, salvo]

      // Vincula o motorista escolhido como Condutor à placa + transportadora
      let motoristas = prev.motoristas ?? []
      const nomeCondutor = (salvo.condutor || '').trim().toLowerCase()
      if (nomeCondutor) {
        const idx = motoristas.findIndex((m) => (m.nome || '').trim().toLowerCase() === nomeCondutor)
        if (idx >= 0) {
          motoristas = motoristas.map((x, i) => {
            if (i === idx) {
              return {
                ...x,
                veiculo_id: salvo.id,
                transportador_id: salvo.transportador_id,
                autonomo: !salvo.transportador_id,
                updated_at: salvo.updated_at,
              }
            }
            if (x.veiculo_id === salvo.id || (antigoId && x.veiculo_id === antigoId)) {
              return { ...x, veiculo_id: null, updated_at: salvo.updated_at }
            }
            return x
          })
        }
      } else if (antigoId) {
        motoristas = motoristas.map((x) =>
          x.veiculo_id === antigoId
            ? { ...x, veiculo_id: salvo.id, updated_at: salvo.updated_at }
            : x,
        )
      }

      // Placa recriada deixa de estar na lista de excluídos
      const veiculos_excluidos = (prev.veiculos_excluidos ?? []).filter(
        (x) => x !== salvo.id && x !== antigoId,
      )

      const next = { ...prev, veiculos, motoristas, veiculos_excluidos }
      stateRef.current = next
      // Publica agora para os demais usuários (super e transportadora vinculada)
      flushKanbanPush(next)
      return next
    })

    // Fotos vão para o Storage: só a URL trafega no sync (base64 estoura o payload)
    void subirFotosVeiculo(salvo).then(async (comUrls) => {
      const res = await upsertVeiculoRemote(comUrls)
      if (!res.ok) console.warn('[veiculos] falha ao gravar no Supabase:', res.erro)
      if (comUrls.fotos === salvo.fotos && comUrls.foto_url === salvo.foto_url) return
      setState((prev) => {
        const next = {
          ...prev,
          veiculos: (prev.veiculos ?? []).map((x) => (x.id === comUrls.id ? comUrls : x)),
        }
        stateRef.current = next
        flushKanbanPush(next)
        return next
      })
    })
  }, [flushKanbanPush])

  const excluirVeiculo = useCallback((id: string) => {
    setState((prev) => {
      const next = {
        ...prev,
        veiculos: (prev.veiculos ?? []).filter((v) => v.id !== id),
        motoristas: (prev.motoristas ?? []).map((m) =>
          m.veiculo_id === id
            ? { ...m, veiculo_id: null, updated_at: new Date().toISOString() }
            : m,
        ),
        veiculos_excluidos: [
          ...(prev.veiculos_excluidos ?? []).filter((x) => x !== id),
          id,
        ].slice(-500),
      }
      stateRef.current = next
      flushKanbanPush(next)
      return next
    })
    void deleteVeiculoRemote(id)
  }, [flushKanbanPush])

  const salvarRota = useCallback(
    (r: Rota) => {
      const rota: Rota = {
        ...r,
        id: isUuid(r.id) ? r.id : newRotaId(),
        descricao: r.descricao.trim(),
        origem: r.origem.trim(),
        destino: r.destino.trim(),
        pontos_passagem: limparPontosPassagemRota(r.pontos_passagem),
      }
      setState((prev) => {
        const mesma = prev.rotas.find(
          (x) => x.id === rota.id || x.id === r.id,
        )
        // Ao atualizar, nunca perde pontos locais se o payload vier vazio por engano
        const pontosMerge =
          (rota.pontos_passagem?.length ?? 0) > 0
            ? rota.pontos_passagem
            : mesma?.pontos_passagem ?? []
        const rotaFinal = { ...rota, pontos_passagem: pontosMerge }
        const rotas = dedupeRotas(
          mesma
            ? prev.rotas.map((x) =>
                x.id === mesma.id ? { ...rotaFinal, id: mesma.id } : x,
              )
            : [...prev.rotas, rotaFinal],
        )
        const next = { ...prev, rotas }
        stateRef.current = next
        flushKanbanPush(next)
        return next
      })
      const idFinal =
        stateRef.current.rotas.find((x) => x.id === rota.id || x.id === r.id)?.id ??
        rota.id
      const rotaGravar =
        stateRef.current.rotas.find((x) => x.id === idFinal) ?? rota
      void upsertRotaRemote({ ...rotaGravar, id: idFinal }).then((res) => {
        if (!res.ok || res.id === idFinal) return
        setState((prev) => {
          const rotas = dedupeRotas(
            prev.rotas.map((x) => (x.id === idFinal ? { ...x, id: res.id } : x)),
          )
          const next = { ...prev, rotas }
          stateRef.current = next
          flushKanbanPush(next)
          return next
        })
      })
    },
    [flushKanbanPush],
  )

  const criarCarga = useCallback(
    (partial?: Partial<Carga>) => {
      const nova = montarNovaCarga(partial, user?.id ?? null, { persistir: true })
      setState((prev) => ({
        ...prev,
        cargas: [...prev.cargas.filter((c) => c.id !== nova.id), nova],
        historico: [
          makeHistorico('carga_criada', `Carga ${nova.numero} criada`, { carga_id: nova.id }, user),
          ...prev.historico,
        ].slice(0, 2000),
      }))
      return nova
    },
    [user],
  )

  const atualizarCarga = useCallback(
    (id: string, patch: Partial<Carga>) => {
      const atual = state.cargas.find((c) => c.id === id)
      if (!atual) return { ok: false, error: 'Carga não encontrada' }
      if (atual.status !== 'nova_carga') {
        // Após publicar, só permite ajustar flags de retorno (aparecem no card).
        const keys = Object.keys(patch).filter((k) => k !== 'updated_at')
        const soRetorno =
          keys.length > 0 &&
          keys.every((k) => k === 'carga_retorno' || k === 'retorna_origem')
        if (!soRetorno) {
          return { ok: false, error: 'Só é possível editar cargas ainda não publicadas' }
        }
      }
      if (!patch.rota_id && !atual.rota_id && !(patch.origem && patch.destino)) {
        /* ok — validação de campos obrigatórios fica na UI */
      }
      setState((prev) => ({
        ...prev,
        cargas: prev.cargas.map((c) =>
          c.id === id
            ? {
                ...c,
                ...patch,
                updated_at: new Date().toISOString(),
              }
            : c,
        ),
      }))
      return { ok: true }
    },
    [state.cargas],
  )

  const excluirCargaRascunho = useCallback(
    (cargaId: string) => {
      const prev = stateRef.current
      const carga = prev.cargas.find((c) => c.id === cargaId)
      if (!carga) return { ok: false, error: 'Carga não encontrada' }
      if (carga.status !== 'nova_carga' || carga.publicado_em) {
        return {
          ok: false,
          error: 'Só é possível excluir rascunhos ainda não publicados',
        }
      }
      const agora = new Date().toISOString()
      const next: DataState = {
        ...prev,
        cargas: prev.cargas.filter((c) => c.id !== cargaId),
        lances: prev.lances.filter((l) => l.carga_id !== cargaId),
        historicoPropostas: (prev.historicoPropostas ?? []).filter(
          (h) => h.carga_id !== cargaId,
        ),
        mensagens: (prev.mensagens ?? []).filter((m) => m.carga_id !== cargaId),
        notificacoes: (prev.notificacoes ?? []).filter((n) => n.carga_id !== cargaId),
        cargas_excluidas: [...(prev.cargas_excluidas ?? []).filter((id) => id !== cargaId), cargaId].slice(
          -500,
        ),
        historico: [
          makeHistorico(
            'carga_excluida',
            `Rascunho ${carga.numero} excluído`,
            { carga_id: cargaId, detalhe: agora },
            userRef.current,
          ),
          ...prev.historico,
        ].slice(0, 2000),
      }
      stateRef.current = next
      setState(next)
      flushKanbanPush(next)
      return { ok: true }
    },
    [flushKanbanPush],
  )

  const lancesDaCarga = useCallback(
    (cargaId: string) => {
      const carga = state.cargas.find((c) => c.id === cargaId)
      return ordenarLancesParaVitoria(
        state.lances.filter(
          (l) =>
            l.carga_id === cargaId &&
            l.status !== 'cancelado' &&
            (!carga || lanceNaRodadaAtual(l, carga)),
        ),
        (id) => state.transportadores.find((t) => t.id === id),
      )
    },
    [state.cargas, state.lances, state.transportadores],
  )

  const historicoPropostasDaCarga = useCallback(
    (cargaId: string) =>
      state.historicoPropostas
        .filter((h) => h.carga_id === cargaId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [state.historicoPropostas],
  )

  const salvarMotorista = useCallback((m: Motorista) => {
    const agora = new Date().toISOString()
    const normalized = { ...normalizeMotorista(m), updated_at: agora }
    setState((prev) => {
      const list = prev.motoristas ?? []
      const exists = list.some((x) => x.id === normalized.id)
      // Um veículo só pode estar vinculado a um motorista ativo
      let motoristas = exists
        ? list.map((x) => (x.id === normalized.id ? normalized : x))
        : [...list, normalized]
      if (normalized.veiculo_id) {
        motoristas = motoristas.map((x) =>
          x.id !== normalized.id && x.veiculo_id === normalized.veiculo_id
            ? { ...x, veiculo_id: null, updated_at: agora }
            : x,
        )
      }
      let veiculoAtualizado: Veiculo | null = null
      const veiculos = (prev.veiculos ?? []).map((v) => {
        if (v.id !== normalized.veiculo_id) return v
        veiculoAtualizado = {
          ...v,
          transportador_id: normalized.autonomo ? null : normalized.transportador_id,
          condutor: normalized.nome,
          updated_at: agora,
        }
        return veiculoAtualizado
      })
      const motoristas_excluidos = (prev.motoristas_excluidos ?? []).filter(
        (x) => x !== normalized.id,
      )
      const next = { ...prev, motoristas, veiculos, motoristas_excluidos }
      stateRef.current = next
      flushKanbanPush(next)
      if (veiculoAtualizado) void upsertVeiculoRemote(veiculoAtualizado)
      return next
    })
  }, [flushKanbanPush])

  const excluirMotorista = useCallback((id: string) => {
    setState((prev) => {
      const next = {
        ...prev,
        motoristas: (prev.motoristas ?? []).filter((m) => m.id !== id),
        motoristas_excluidos: [
          ...(prev.motoristas_excluidos ?? []).filter((x) => x !== id),
          id,
        ].slice(-500),
      }
      stateRef.current = next
      flushKanbanPush(next)
      return next
    })
  }, [flushKanbanPush])

  const motoristasDoTransportador = useCallback(
    (transportadorId: string) =>
      (state.motoristas ?? []).filter((m) =>
        sameTransportadorId(m.transportador_id, transportadorId),
      ),
    [state.motoristas],
  )

  const marcarNotificacaoLida = useCallback((id: string) => {
    const agora = new Date().toISOString()
    setState((prev) => {
      const next = {
        ...prev,
        notificacoes: prev.notificacoes.map((n) =>
          n.id === id ? { ...n, lida: true, updated_at: agora } : n,
        ),
      }
      stateRef.current = next
      return next
    })
  }, [])

  const marcarTodasNotificacoesLidas = useCallback(() => {
    const agora = new Date().toISOString()
    const userNow = userRef.current
    const acting = actingTransportadorId
    setState((prev) => {
      const next = {
        ...prev,
        notificacoes: prev.notificacoes.map((n) => {
          if (n.lida) return n
          if (userNow && !notifDestinadaAoUsuario(n, userNow, acting)) {
            // Super sem “ver como” marca tudo
            if (!(userNow.is_superuser || userNow.role === 'super') || acting) return n
          }
          return { ...n, lida: true, updated_at: agora }
        }),
      }
      stateRef.current = next
      flushKanbanPush(next)
      return next
    })
  }, [actingTransportadorId, flushKanbanPush])

  const mensagensDaCarga = useCallback(
    (cargaId: string) =>
      (state.mensagens ?? [])
        .filter((m) => m.carga_id === cargaId)
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [state.mensagens],
  )

  const enviarMensagemCarga = useCallback(
    (cargaId: string, texto: string) => {
      const userNow = userRef.current
      if (!userNow) return { ok: false, error: 'Faça login para enviar mensagens.' }
      const limpo = texto.trim()
      if (!limpo) return { ok: false, error: 'Digite uma mensagem.' }
      if (limpo.length > 2000) return { ok: false, error: 'Mensagem muito longa (máx. 2000).' }

      const prev = stateRef.current
      const carga = prev.cargas.find((c) => c.id === cargaId)
      if (!carga) return { ok: false, error: 'Carga não encontrada.' }

      const agora = new Date().toISOString()
      const msg: ChatMensagem = {
        id: uid('msg'),
        carga_id: cargaId,
        autor_id: userNow.id,
        autor_nome: userNow.nome,
        autor_role: userNow.role,
        texto: limpo,
        created_at: agora,
      }

      const preview = limpo.length > 80 ? `${limpo.slice(0, 77)}…` : limpo
      // Transportador (ou Super/Minerva “Ver como”) → avisa embarcador; senão → avisa transportadores
      const enviandoComoTransportador =
        userNow.role === 'transportador' || Boolean(actingTransportadorId)

      let notificacoes = prev.notificacoes
      if (enviandoComoTransportador) {
        notificacoes = pushNotif(notificacoes, {
          role: 'minerva',
          titulo: 'Nova mensagem',
          mensagem: `Carga ${carga.numero} · ${userNow.nome}: ${preview}`,
          carga_id: cargaId,
        })
      } else {
        // Embarcador / super → avisa transportadores envolvidos
        const tids = new Set<string>()
        if (carga.transportador_vencedor_id) tids.add(carga.transportador_vencedor_id)
        for (const l of prev.lances) {
          if (l.carga_id === cargaId && ['ativo', 'vencedor'].includes(l.status)) {
            tids.add(l.transportador_id)
          }
        }
        if (tids.size === 0) {
          const gruposChat =
            (carga.grupos_notificados?.length ?? 0) > 0
              ? carga.grupos_notificados!
              : (carga.grupo_ids ?? [])
          for (const g of prev.grupos) {
            if (!gruposChat.includes(g.id)) continue
            for (const tid of g.transportador_ids ?? []) tids.add(tid)
          }
        }
        if (tids.size === 0) {
          notificacoes = pushNotif(notificacoes, {
            role: 'transportador',
            titulo: 'Nova mensagem',
            mensagem: `Carga ${carga.numero} · ${userNow.nome}: ${preview}`,
            carga_id: cargaId,
          })
        } else {
          for (const tid of tids) {
            notificacoes = pushNotif(notificacoes, {
              role: 'transportador',
              transportador_id: tid,
              titulo: 'Nova mensagem',
              mensagem: `Carga ${carga.numero} · ${userNow.nome}: ${preview}`,
              carga_id: cargaId,
            })
          }
        }
      }

      // Quem envia já “leu” até esta mensagem
      const leituraKey = `${userNow.id}:${cargaId}`
      const chatLeituras = {
        ...(prev.chatLeituras ?? {}),
        [leituraKey]: agora,
      }

      const next = {
        ...prev,
        mensagens: [...(prev.mensagens ?? []), msg],
        notificacoes,
        chatLeituras,
      }
      stateRef.current = next
      setState(next)
      flushKanbanPush(next)
      return { ok: true }
    },
    [actingTransportadorId, flushKanbanPush],
  )

  const mensagensNaoLidasDaCarga = useCallback(
    (cargaId: string) => {
      const userNow = userRef.current
      if (!userNow) return 0
      const leituras = state.chatLeituras ?? {}
      const last = leituras[`${userNow.id}:${cargaId}`]
      const lastMs = last ? new Date(last).getTime() : 0
      return (state.mensagens ?? []).filter(
        (m) =>
          m.carga_id === cargaId &&
          m.autor_id !== userNow.id &&
          new Date(m.created_at).getTime() > lastMs,
      ).length
    },
    [state.mensagens, state.chatLeituras],
  )

  const marcarChatLido = useCallback(
    (cargaId: string) => {
      const userNow = userRef.current
      if (!userNow) return
      const agora = new Date().toISOString()
      const prev = stateRef.current
      const leituraKey = `${userNow.id}:${cargaId}`
      const acting = actingTransportadorId
      const next = {
        ...prev,
        chatLeituras: { ...(prev.chatLeituras ?? {}), [leituraKey]: agora },
        notificacoes: prev.notificacoes.map((n) => {
          if (n.carga_id !== cargaId || n.lida || !isNotifChat(n)) return n
          // Não apagar a notificação do outro lado só porque eu enviei/abri o chat
          if (!notifDestinadaAoUsuario(n, userNow, acting)) return n
          return { ...n, lida: true, updated_at: agora }
        }),
      }
      stateRef.current = next
      setState(next)
      flushKanbanPush(next)
    },
    [actingTransportadorId, flushKanbanPush],
  )

  const transportadorById = useCallback(
    (id: string) => state.transportadores.find((t) => t.id === id),
    [state.transportadores],
  )

  const cargasVisiveisTransportador = useCallback(
    (transportadorId: string) => {
      if (!transportadorId) return []
      const transportador = state.transportadores.find((t) =>
        sameTransportadorId(t.id, transportadorId),
      )
      // situacao ausente = ativo (dados antigos); só bloqueia inativo
      if (!transportador || transportador.situacao === 'inativo') {
        return []
      }

      return state.cargas.filter((c) => {
        // Frete fechado: só o vencedor continua vendo (Confirmadas / Alocadas)
        if (c.transportador_vencedor_id) {
          if (!sameTransportadorId(c.transportador_vencedor_id, transportadorId)) return false
          return !['canceladas'].includes(c.status)
        }

        // Recusou esta oferta: some do Kanban
        if ((c.recusado_por_ids ?? []).some((id) => sameTransportadorId(id, transportadorId))) {
          return false
        }

        // Já participou na rodada atual — continua vendo enquanto a negociação existir
        const temLanceProprio = state.lances.some(
          (l) =>
            l.carga_id === c.id &&
            sameTransportadorId(l.transportador_id, transportadorId) &&
            l.status !== 'cancelado' &&
            lanceNaRodadaAtual(l, c),
        )
        if (
          temLanceProprio &&
          ['negociando', 'propostas', 'suspensas'].includes(c.status)
        ) {
          return true
        }

        if (!['negociando', 'propostas', 'suspensas'].includes(c.status)) return false
        if (!c.publicado_em) return false

        // Negociação direta: só as transportadoras escolhidas na publicação
        if (c.modo_publicacao === 'negociacao_direta') {
          return (c.transportador_direto_ids ?? []).some((id) =>
            sameTransportadorId(id, transportadorId),
          )
        }

        // Escalonar: só quem já foi notificado; sem escalonar, grupos_notificados = todos
        const candidatos =
          (c.grupos_notificados?.length ?? 0) > 0
            ? c.grupos_notificados!
            : (c.grupo_ids ?? [])

        // Sem grupo definido: todos os transportadores ativos veem
        if (candidatos.length === 0) return true

        const emGrupo = state.grupos.some((g) => {
          if (g.situacao === 'inativo') return false
          if (!candidatos.includes(g.id)) return false
          return (g.transportador_ids ?? []).some((id) =>
            sameTransportadorId(id, transportadorId),
          )
        })
        if (emGrupo) return true

        // Fallback: IDs de grupo órfãos (migração) — libera para ativos
        const grupoIdsConhecidos = new Set(state.grupos.map((g) => g.id))
        const gruposOrfaos =
          candidatos.length > 0 && candidatos.every((id) => !grupoIdsConhecidos.has(id))
        return gruposOrfaos
      })
    },
    [state.cargas, state.grupos, state.transportadores, state.lances],
  )

  const historicoDoTransportador = useCallback(
    (transportadorId: string) =>
      state.historico.filter((h) => h.transportador_id === transportadorId),
    [state.historico],
  )

  const rankingTransportadores = useCallback(
    () =>
      [...state.transportadores]
        .filter((t) => t.situacao === 'ativo')
        .sort((a, b) => b.pontuacao - a.pontuacao),
    [state.transportadores],
  )

  const value = useMemo<DataContextValue>(
    () => ({
      ...state,
      tick,
      config,
      salvarConfig,
      configTransportador,
      salvarConfigTransportador,
      user,
      login,
      logout,
      refreshPermissoes,
      demoUsers: DEMO_USERS,
      publicarCarga,
      enviarLance,
      aceitarLance,
      rejeitarLance,
      enviarContraProposta,
      aguardarMelhoresOfertas,
      encerrarComMelhorLance,
      finalizarNegociacao,
      cancelarPublicacao,
      suspenderCarga,
      retomarCarga,
      republicarCarga,
      reabrirNegociacao,
      moverCargaKanban,
      recusarCargaMinerva,
      recusarCargaTransportador,
      alocarComposicao,
      iniciarViagem,
      finalizarViagem,
      cancelarViagem,
      avaliarViagem,
      registrarVisualizacao,
      notificarTodosGrupos,
      salvarGrupo,
      salvarTransportador,
      atualizarLogoTransportador,
      atualizarAvatarPerfil,
      setDisponivelMapa,
      setDisponivelMapaVeiculo,
      excluirTransportador,
      vinculosTransportador,
      salvarVeiculo,
      excluirVeiculo,
      salvarMotorista,
      excluirMotorista,
      salvarRota,
      criarCarga,
      atualizarCarga,
      excluirCargaRascunho,
      actingTransportadorId,
      setActingTransportadorId,
      effectiveTransportadorId,
      lancesDaCarga,
      historicoPropostasDaCarga,
      transportadorById,
      cargasVisiveisTransportador,
      historicoDoTransportador,
      rankingTransportadores,
      motoristasDoTransportador,
      marcarNotificacaoLida,
      marcarTodasNotificacoesLidas,
      mensagensDaCarga,
      enviarMensagemCarga,
      mensagensNaoLidasDaCarga,
      marcarChatLido,
      documentosDoTransportador,
      excluirDocumentoTransportador,
      substituirDocumentoTransportador,
      registrarCadastroTransportador,
      refreshTransportadores,
      forcarSincronizarKanban,
      aprovarTransportador,
      recusarTransportador,
    }),
    [
      state,
      tick,
      config,
      salvarConfig,
      configTransportador,
      salvarConfigTransportador,
      user,
      login,
      logout,
      refreshPermissoes,
      forcarSincronizarKanban,
      publicarCarga,
      enviarLance,
      aceitarLance,
      rejeitarLance,
      enviarContraProposta,
      aguardarMelhoresOfertas,
      encerrarComMelhorLance,
      finalizarNegociacao,
      cancelarPublicacao,
      suspenderCarga,
      retomarCarga,
      republicarCarga,
      reabrirNegociacao,
      moverCargaKanban,
      recusarCargaMinerva,
      recusarCargaTransportador,
      alocarComposicao,
      iniciarViagem,
      finalizarViagem,
      cancelarViagem,
      avaliarViagem,
      registrarVisualizacao,
      notificarTodosGrupos,
      salvarGrupo,
      salvarTransportador,
      atualizarLogoTransportador,
      atualizarAvatarPerfil,
      setDisponivelMapa,
      setDisponivelMapaVeiculo,
      excluirTransportador,
      vinculosTransportador,
      salvarVeiculo,
      excluirVeiculo,
      salvarMotorista,
      excluirMotorista,
      salvarRota,
      criarCarga,
      atualizarCarga,
      excluirCargaRascunho,
      actingTransportadorId,
      effectiveTransportadorId,
      lancesDaCarga,
      historicoPropostasDaCarga,
      transportadorById,
      cargasVisiveisTransportador,
      historicoDoTransportador,
      rankingTransportadores,
      motoristasDoTransportador,
      marcarNotificacaoLida,
      marcarTodasNotificacoesLidas,
      mensagensDaCarga,
      enviarMensagemCarga,
      mensagensNaoLidasDaCarga,
      marcarChatLido,
      documentosDoTransportador,
      excluirDocumentoTransportador,
      substituirDocumentoTransportador,
      registrarCadastroTransportador,
      refreshTransportadores,
      aprovarTransportador,
      recusarTransportador,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData deve ser usado dentro de DataProvider')
  return ctx
}
