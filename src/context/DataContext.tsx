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
} from '../lib/businessRules'
import {
  limitesLance,
  loadConfigNegocio,
  saveConfigNegocio,
  type ConfigNegocio,
} from '../lib/configNegocio'
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
  Profile,
  Rota,
  TipoHistorico,
  Transportador,
  TransportadorDocumento,
  Veiculo,
} from '../types'
import {
  portalLoginLocal,
  getPermissaoUsuario,
  loadPortalAccounts,
  removePortalAccountsPorTransportador,
  setPortalAccountAtivoPorTransportador,
} from '../lib/portalAuth'
import {
  submeterCadastroTransportador,
  type CadastroTransportadorInput,
} from '../lib/cadastroTransportador'
import { isLocalSuperUser } from '../lib/superUsers'
import {
  removeTransportadoraDaHierarquia,
  syncTransportadoraNaHierarquia,
} from '../lib/orgHierarchy'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import {
  applySyncSlice,
  pickSyncSlice,
  pullKanbanSync,
  pushKanbanSync,
  sliceFingerprint,
  subscribeKanbanSync,
} from '../lib/kanbanSync'
import { alinharStatusComLances } from '../lib/kanbanColumns'

const STORAGE_KEY = 'doca-livre-data-v8'
const STORAGE_KEY_LEGACY = 'doca-livre-data-v7'
const STORAGE_KEY_LEGACY2 = 'doca-livre-data-v6'
const AUTH_KEY = 'doca-livre-auth-v1'
/** Uma vez: zera Kanban (cargas/lances) ao migrar para v8 */
const KANBAN_WIPE_KEY = 'doca-livre-kanban-wipe-v8'

interface PublishPayload {
  cargaId: string
  margemPercentual: number
  grupoIds: string[]
  prazoLeilaoMinutos: number
  prazoAlocacaoMinutos: number
  justificativaMotivo?: string
  justificativaObs?: string
  observacao?: string
  /** Se true, só o 1º grupo vê agora; demais na metade do prazo. */
  escalonarGrupos?: boolean
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
}

interface AuthState {
  user: Profile | null
  login: (identificador: string, password: string) => { ok: boolean; error?: string }
  logout: () => void
  demoUsers: AppUser[]
  refreshPermissoes: () => void
}

interface DataContextValue extends DataState, AuthState {
  tick: number
  config: ConfigNegocio
  salvarConfig: (cfg: ConfigNegocio) => void
  publicarCarga: (payload: PublishPayload) => { ok: boolean; error?: string }
  enviarLance: (cargaId: string, valor: number) => { ok: boolean; error?: string }
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
  recusarCargaTransportador: (cargaId: string) => void
  alocarComposicao: (
    cargaId: string,
    placa: string,
    motorista: string,
    opts?: { veiculoId?: string; motoristaId?: string },
  ) => Promise<{ ok: boolean; error?: string }>
  registrarVisualizacao: (cargaId: string) => void
  notificarTodosGrupos: (cargaId: string) => void
  salvarGrupo: (grupo: GrupoTransportador) => void
  salvarTransportador: (t: Transportador) => void
  excluirTransportador: (id: string) => { ok: boolean; error?: string }
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
  aprovarTransportador: (id: string) => Promise<{ ok: boolean; error?: string }>
  recusarTransportador: (id: string, motivo?: string) => Promise<{ ok: boolean; error?: string }>
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
  }
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
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
  return [
    {
      id: uid('ntf'),
      lida: false,
      created_at: new Date().toISOString(),
      ...n,
    },
    ...list,
  ].slice(0, 300)
}

function normalizeCargasNegociacao(
  cargas: Carga[],
  grupos: GrupoTransportador[],
): Carga[] {
  const gruposAtivos = grupos.filter((g) => g.situacao === 'ativo').map((g) => g.id)
  const now = Date.now()
  return cargas.map((c) => {
    if (!['negociando', 'propostas', 'suspensas'].includes(c.status)) return c
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

/** Garante grupos com t1 (Santos); não reabre cargas automaticamente. */
function ensureDemoOfertasVisiveis(state: DataState): DataState {
  const DEMO_TID = 't1'
  let grupos = state.grupos.map((g) => {
    if (g.situacao === 'inativo') return g
    const ids = g.transportador_ids ?? []
    if (ids.includes(DEMO_TID)) return g
    return { ...g, transportador_ids: [...ids, DEMO_TID] }
  })
  if (grupos.length === 0) {
    grupos = structuredClone(SEED_GRUPOS)
  }

  let cargas = normalizeCargasNegociacao(state.cargas, grupos)
  let lances = cancelarLancesForaDaRodada(cargas, state.lances)
  cargas = alinharStatusComLances(cargas, lances)

  let transportadores = state.transportadores
  const t1 = transportadores.find((t) => t.id === DEMO_TID)
  if (t1 && t1.situacao === 'inativo') {
    transportadores = transportadores.map((t) =>
      t.id === DEMO_TID ? { ...t, situacao: 'ativo' as const } : t,
    )
  }

  return { ...state, cargas, lances, grupos, transportadores }
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
  }
}

function loadState(): DataState {
  const defaults = defaultState()
  try {
    const hasV8 = Boolean(localStorage.getItem(STORAGE_KEY))
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(STORAGE_KEY_LEGACY) ??
      localStorage.getItem(STORAGE_KEY_LEGACY2)
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
      rotas: Array.isArray(parsed.rotas) ? parsed.rotas : defaults.rotas,
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
    }
    if (loaded.cargas_excluidas.length > 0) {
      const ex = new Set(loaded.cargas_excluidas)
      loaded = {
        ...loaded,
        cargas: loaded.cargas.filter((c) => !ex.has(c.id)),
        lances: loaded.lances.filter((l) => !ex.has(l.carga_id)),
      }
    }
    // Migração v8: zera cargas publicadas, propostas e chat do Kanban
    if (!hasV8) {
      loaded = wipeKanbanFields(loaded)
    }
    return ensureDemoOfertasVisiveis(loaded)
  } catch {
    return ensureDemoOfertasVisiveis(defaults)
  }
}

function loadAuth(): Profile | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (raw) return JSON.parse(raw) as Profile
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
  const [actingTransportadorId, setActingTransportadorId] = useState<string | null>(null)
  /** Snapshot síncrono — evita depender do updater do setState para retornar ok/erro */
  const stateRef = useRef(state)
  stateRef.current = state
  const userRef = useRef(user)
  userRef.current = user
  const applyingRemoteRef = useRef(false)
  const lastSyncFpRef = useRef('')
  const pushTimerRef = useRef<number | null>(null)
  const pendingPushRef = useRef(false)

  const flushKanbanPush = useCallback((next: typeof state) => {
    if (!isSupabaseConfigured) return
    if (applyingRemoteRef.current) {
      pendingPushRef.current = true
      return
    }
    const slice = pickSyncSlice(next)
    const fp = sliceFingerprint(slice)
    if (fp === lastSyncFpRef.current) return
    lastSyncFpRef.current = fp
    if (pushTimerRef.current != null) {
      window.clearTimeout(pushTimerRef.current)
      pushTimerRef.current = null
    }
    void pushKanbanSync(slice)
  }, [])

  const scheduleKanbanPush = useCallback(() => {
    if (!isSupabaseConfigured) return
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
    return user?.transportador_id || actingTransportadorId || null
  }, [user?.transportador_id, actingTransportadorId])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    scheduleKanbanPush()
  }, [state, scheduleKanbanPush])

  // Sync multi-usuário — nunca sobrescreve com vazio / erro de pull
  useEffect(() => {
    let cancelled = false

    const finishRemoteApply = () => {
      applyingRemoteRef.current = false
      if (pendingPushRef.current) {
        pendingPushRef.current = false
        flushKanbanPush(stateRef.current)
      }
    }

    const applyRemote = (payload: {
      slice: ReturnType<typeof pickSyncSlice>
      client_id: string
      updated_at: string
    }) => {
      // Remoto vazio não apaga o que já temos
      if (
        Array.isArray(payload.slice.cargas) &&
        payload.slice.cargas.length === 0 &&
        stateRef.current.cargas.length > 0
      ) {
        return
      }
      const fp = sliceFingerprint(payload.slice)
      if (fp === lastSyncFpRef.current) return
      applyingRemoteRef.current = true
      setState((prev) => {
        const next = applySyncSlice(prev, payload.slice)
        stateRef.current = next
        lastSyncFpRef.current = sliceFingerprint(pickSyncSlice(next))
        return next
      })
      window.setTimeout(finishRemoteApply, 0)
    }

    void (async () => {
      if (localStorage.getItem(KANBAN_WIPE_KEY) !== '1') {
        localStorage.setItem(KANBAN_WIPE_KEY, '1')
      }

      const remote = await pullKanbanSync()
      if (cancelled) return

      if (!remote.ok) {
        // Erro de rede/SQL: NÃO sobrescreve o remoto com estado local vazio
        console.warn('[kanbanSync] bootstrap pull falhou — mantendo estado local')
        return
      }
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
    })()

    const unsub = subscribeKanbanSync((payload) => {
      applyRemote(payload)
    })

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      try {
        const parsed = JSON.parse(e.newValue) as Partial<DataState>
        if (!Array.isArray(parsed.cargas)) return
        const slice = pickSyncSlice({
          cargas: parsed.cargas,
          lances: parsed.lances ?? [],
          grupos: parsed.grupos ?? [],
          transportadores: parsed.transportadores ?? [],
          notificacoes: parsed.notificacoes ?? [],
          mensagens: parsed.mensagens ?? [],
          historico: parsed.historico ?? [],
          historicoPropostas: parsed.historicoPropostas ?? [],
          chatLeituras: parsed.chatLeituras ?? {},
          cargas_excluidas: parsed.cargas_excluidas ?? [],
        })
        applyRemote({
          slice,
          client_id: 'tab',
          updated_at: new Date().toISOString(),
        })
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('storage', onStorage)

    return () => {
      cancelled = true
      unsub()
      window.removeEventListener('storage', onStorage)
      if (pushTimerRef.current != null) window.clearTimeout(pushTimerRef.current)
    }
  }, [flushKanbanPush])

  useEffect(() => {
    saveConfigNegocio(config)
  }, [config])

  useEffect(() => {
    if (user) localStorage.setItem(AUTH_KEY, JSON.stringify(user))
    else localStorage.removeItem(AUTH_KEY)
  }, [user])

  const salvarConfig = useCallback((cfg: ConfigNegocio) => {
    setConfig(cfg)
  }, [])

  // Timer: metade do prazo → notifica demais grupos; fim do prazo → fecha leilão; alocação expira
  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => t + 1)
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
    }, 1000)
    return () => clearInterval(id)
  }, [config.empate_exige_aceite_manual])

  const login = useCallback((identificador: string, password: string) => {
    const result = portalLoginLocal(identificador, password)
    if (!result.ok) return { ok: false, error: result.erro }
    const { account, isSuperuser, permissoes } = result
    const role =
      isSuperuser || account.role === 'super'
        ? ('super' as const)
        : account.role === 'transportador'
          ? ('transportador' as const)
          : ('minerva' as const)
    setUser({
      id: account.id,
      email: account.email,
      nome: account.nome,
      usuario: account.usuario,
      role,
      transportador_id: account.transportador_id ?? null,
      empresa_org_id: account.empresa_org_id ?? null,
      is_superuser: isSuperuser,
      perfil_operacional: account.perfil_operacional ?? null,
      permissoes_modulos: permissoes.modulos,
    })
    return { ok: true }
  }, [])

  const logout = useCallback(() => setUser(null), [])

  const refreshPermissoes = useCallback(() => {
    setUser((prev) => {
      if (!prev) return prev
      const accounts = loadPortalAccounts()
      const account = accounts.find(
        (a) =>
          a.id === prev.id ||
          a.usuario === prev.usuario ||
          a.email.toLowerCase() === (prev.email || '').toLowerCase(),
      )
      if (!account) return prev
      const isSuperuser =
        Boolean(prev.is_superuser) ||
        isLocalSuperUser(account.usuario) ||
        isLocalSuperUser(account.email)
      const perms = getPermissaoUsuario(account)
      // Conta demo / portal sempre manda no vínculo; evita sessão antiga sem transportador_id
      const transportador_id =
        account.transportador_id !== undefined && account.transportador_id !== null
          ? account.transportador_id
          : (prev.transportador_id ?? null)
      const role = isSuperuser
        ? prev.role === 'transportador'
          ? prev.role
          : prev.role === 'super'
            ? prev.role
            : ('minerva' as const)
        : account.role === 'transportador'
          ? ('transportador' as const)
          : account.role === 'super'
            ? ('super' as const)
            : ('minerva' as const)
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

  // Revincula transportador_id da conta (sessões antigas / demo Santos)
  useEffect(() => {
    refreshPermissoes()
  }, [refreshPermissoes])

  const publicarCarga = useCallback(
    (payload: PublishPayload) => {
      const { prioridade, modo, exigeJustificativa } = calcularPrioridadeEModo(
        payload.prazoLeilaoMinutos,
        config.limite_urgencia_minutos,
      )
      if (exigeJustificativa && !payload.justificativaMotivo) {
        return {
          ok: false,
          error: `Justificativa obrigatória para prazo ≤ ${config.limite_urgencia_minutos} minutos`,
        }
      }
      if (payload.grupoIds.length === 0) {
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

      const escalonar = Boolean(payload.escalonarGrupos) && payload.grupoIds.length > 1
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

      const cargas = prev.cargas.map((c) => {
        if (c.id !== payload.cargaId) return c
        return {
          ...c,
          margem_percentual: payload.margemPercentual,
          frete_oferta: freteOferta,
          frete_minimo: lim.min,
          frete_maximo: lim.max,
          grupo_ids: payload.grupoIds,
          grupos_notificados: escalonar ? [payload.grupoIds[0]] : [...payload.grupoIds],
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
      const hist = makeHistorico(
        'carga_publicada',
        `Carga ${carga?.numero ?? ''} publicada`,
        {
          carga_id: payload.cargaId,
          detalhe: `${modo} · ${prioridade} · ${payload.prazoLeilaoMinutos} min · ${payload.grupoIds.length} grupo(s)`,
        },
        actor,
      )
      const gruposNotif = escalonar ? [payload.grupoIds[0]] : [...payload.grupoIds]
      const transportadoresNotificados = new Set<string>()
      for (const g of prev.grupos) {
        if (!gruposNotif.includes(g.id)) continue
        for (const tid of g.transportador_ids ?? []) transportadoresNotificados.add(tid)
      }
      let notificacoes = pushNotif(prev.notificacoes, {
        role: 'todos',
        titulo: 'Nova carga publicada',
        mensagem: `Carga ${carga?.numero ?? ''} disponível para negociação.`,
        carga_id: payload.cargaId,
      })
      for (const tid of transportadoresNotificados) {
        notificacoes = pushNotif(notificacoes, {
          transportador_id: tid,
          titulo: 'Nova oferta de carga',
          mensagem: `Carga ${carga?.numero ?? ''} disponível no seu Kanban.`,
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
      return { ok: true }
    },
    [config, flushKanbanPush],
  )

  const notificarTodosGrupos = useCallback((cargaId: string) => {
    setState((prev) => {
      const carga = prev.cargas.find((c) => c.id === cargaId)
      const hist = makeHistorico(
        'grupos_notificados',
        `Notificação manual de todos os grupos — ${carga?.numero ?? ''}`,
        { carga_id: cargaId },
      )
      return {
        ...prev,
        cargas: prev.cargas.map((c) =>
          c.id === cargaId ? { ...c, grupos_notificados: [...c.grupo_ids] } : c,
        ),
        historico: [hist, ...prev.historico].slice(0, 2000),
      }
    })
  }, [])

  const enviarLance = useCallback(
    (cargaId: string, valor: number) => {
      const tid = userRef.current?.transportador_id || actingTransportadorId
      if (!tid) return { ok: false, error: 'Usuário sem transportador' }

      const prev = stateRef.current
      const carga = prev.cargas.find((c) => c.id === cargaId)
      if (!carga) return { ok: false, error: 'Carga não encontrada' }
      if (!['negociando', 'propostas'].includes(carga.status)) {
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

      const freteRef = cargaOk.frete_oferta ?? cargaOk.frete_tabela
      const min = cargaOk.frete_minimo
      const max = cargaOk.frete_maximo
      if (min != null && valor < min - 0.009) {
        return {
          ok: false,
          error: `Lance abaixo do mínimo permitido (R$ ${min.toFixed(2)})`,
        }
      }
      if (max != null && valor > max + 0.009) {
        return {
          ok: false,
          error: `Lance acima do máximo permitido (R$ ${max.toFixed(2)})`,
        }
      }

      // Escalonar: só grupos já notificados; senão todos os da publicação
      const gruposOk =
        (cargaOk.grupos_notificados?.length ?? 0) > 0
          ? cargaOk.grupos_notificados!
          : (cargaOk.grupo_ids ?? [])
      const autorizado =
        gruposOk.length === 0 ||
        prev.grupos.some(
          (g) =>
            g.situacao !== 'inativo' &&
            gruposOk.includes(g.id) &&
            (g.transportador_ids ?? []).includes(tid),
        )
      if (!autorizado) {
        return { ok: false, error: 'Você ainda não foi chamado para negociar esta carga' }
      }

      const jaTemLance = stateRef.current.lances.some(
        (l) => l.carga_id === cargaId && l.transportador_id === tid && l.status === 'ativo',
      )
      if (jaTemLance && cargaOk.modo_publicacao === 'oferta') {
        return { ok: false, error: 'No modo Oferta não é permitido alterar a proposta.' }
      }

      const userNow = userRef.current
      const agora = new Date().toISOString()
      const base = stateRef.current

      // Modo Oferta: lance ≤ frete oferta fecha (inclui “Aceitar oferta”)
      if (cargaOk.modo_publicacao === 'oferta' && valor <= freteRef + 0.009) {
        const lance: Lance = {
          id: uid('lance'),
          carga_id: cargaId,
          transportador_id: tid,
          valor,
          status: 'vencedor',
          created_at: agora,
        }
        const next: DataState = {
          ...base,
          cargas: base.cargas.map((c) =>
            c.id === cargaId
              ? {
                  ...c,
                  status: 'propostas' as const,
                  transportador_vencedor_id: tid,
                  frete_fechado: valor,
                  alocacao_expira_em: new Date(
                    Date.now() + Math.max(c.prazo_alocacao_minutos ?? 10, 10) * 60_000,
                  ).toISOString(),
                }
              : c,
          ),
          lances: [
            ...base.lances.filter(
              (l) =>
                !(l.carga_id === cargaId && l.transportador_id === tid && l.status === 'ativo'),
            ),
            lance,
          ],
          transportadores: base.transportadores.map((t) => {
            if (t.id !== tid) return t
            const pontuacao =
              t.pontuacao + PONTOS_ADERENCIA.com_proposta + PONTOS_ADERENCIA.frete_fechado
            return { ...t, pontuacao, classificacao: classificacaoPorPontuacao(pontuacao) }
          }),
          historico: [
            makeHistorico(
              'lance_enviado',
              `Lance vencedor (modo Oferta) — ${cargaOk.numero}`,
              {
                carga_id: cargaId,
                transportador_id: tid,
                detalhe: `R$ ${valor.toFixed(2)}`,
              },
              userNow,
            ),
            ...base.historico,
          ].slice(0, 2000),
        }
        stateRef.current = next
        setState(next)
        flushKanbanPush(next)
        return { ok: true }
      }

      const existing = base.lances.find(
        (l) => l.carga_id === cargaId && l.transportador_id === tid && l.status === 'ativo',
      )
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
          },
          ...historicoPropostas,
        ]
        lances = base.lances.map((l) =>
          l.id === existing.id ? { ...l, valor, updated_at: agora } : l,
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
      // Sempre move para Propostas quando há lance ativo (Kanban Minerva + Transportador)
      const cargas = base.cargas.map((c) =>
        c.id === cargaId && !c.transportador_vencedor_id
          ? { ...c, status: 'propostas' as const, updated_at: agora }
          : c,
      )
      const transportadores = isNew
        ? base.transportadores.map((t) => {
            if (t.id !== tid) return t
            const pontuacao = t.pontuacao + PONTOS_ADERENCIA.com_proposta
            return { ...t, pontuacao, classificacao: classificacaoPorPontuacao(pontuacao) }
          })
        : base.transportadores

      const next: DataState = {
        ...base,
        cargas,
        lances,
        transportadores,
        historico: [
          makeHistorico(
            'lance_enviado',
            `${isNew ? 'Nova proposta' : 'Proposta atualizada'} — ${cargaOk.numero}`,
            {
              carga_id: cargaId,
              transportador_id: tid,
              detalhe: `R$ ${valor.toFixed(2)}`,
            },
            userNow,
          ),
          ...base.historico,
        ].slice(0, 2000),
        historicoPropostas: historicoPropostas.slice(0, 3000),
        notificacoes: pushNotif(base.notificacoes, {
          role: 'minerva',
          titulo: isNew ? 'Nova proposta recebida' : 'Proposta atualizada',
          mensagem: `Carga ${cargaOk.numero}: R$ ${valor.toFixed(2)}`,
          carga_id: cargaId,
        }),
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
      const next: DataState = {
        ...prev,
        cargas,
        lances,
        transportadores,
        historico: [hist, ...prev.historico].slice(0, 2000),
        notificacoes: pushNotif(prev.notificacoes, {
          role: 'transportador',
          transportador_id: current.transportador_id,
          titulo: 'Frete fechado',
          mensagem: `Sua proposta na carga ${cargaAtual.numero} foi aceita.`,
          carga_id: current.carga_id,
        }),
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
    const tNome =
      prev.transportadores.find((t) => t.id === lance.transportador_id)?.nome_fantasia ??
      'Transportador'
    const now = new Date().toISOString()
    const msg: ChatMensagem = {
      id: uid('msg'),
      carga_id: carga.id,
      autor_id: userNow?.id ?? 'embarcador',
      autor_nome: userNow?.nome ?? 'Embarcador',
      autor_role: userNow?.role ?? 'minerva',
      texto: `Contra-proposta para ${tNome}: R$ ${valorRound.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (sua oferta era R$ ${lance.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).`,
      created_at: now,
    }
    const histProp: HistoricoProposta = {
      id: uid('hp'),
      carga_id: carga.id,
      lance_id: lance.id,
      transportador_id: lance.transportador_id,
      valor_anterior: lance.valor,
      valor_novo: valorRound,
      created_at: now,
    }
    const next: DataState = {
      ...prev,
      cargas: prev.cargas.map((c) =>
        c.id === carga.id
          ? {
              ...c,
              frete_oferta: valorRound,
              status: c.status === 'negociando' ? ('propostas' as const) : c.status,
              updated_at: now,
            }
          : c,
      ),
      mensagens: [...(prev.mensagens ?? []), msg],
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
        titulo: 'Contra-proposta recebida',
        mensagem: `Carga ${carga.numero}: embarcador sugere R$ ${valorRound.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Responda com um novo lance.`,
        carga_id: carga.id,
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
        notificacoes: pushNotif(prev.notificacoes, {
          role: 'todos',
          titulo: 'Negociação reaberta',
          mensagem: `Carga ${carga.numero} reaberta para novas ofertas (Nova Carga).`,
          carga_id: cargaId,
        }),
      }
      stateRef.current = next
      setState(next)
      return { ok: true }
    },
    [config.prazo_oferta_padrao_minutos],
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
      const tid = user?.transportador_id || actingTransportadorId
      if (!tid) return
      setState((prev) => {
        const transportadores = prev.transportadores.map((t) => {
          if (t.id !== tid) return t
          const pontuacao = t.pontuacao + PONTOS_ADERENCIA.recusada
          return { ...t, pontuacao, classificacao: classificacaoPorPontuacao(pontuacao) }
        })
        const cargas = prev.cargas.map((c) =>
          c.id === cargaId ? { ...c, recusas: c.recusas + 1 } : c,
        )
        return { ...prev, transportadores, cargas }
      })
    },
    [user, actingTransportadorId],
  )

  const alocarComposicao = useCallback(
    async (
      cargaId: string,
      placa: string,
      motorista: string,
      opts?: { veiculoId?: string; motoristaId?: string },
    ) => {
      if (!placa.trim() || !motorista.trim()) {
        return { ok: false, error: 'Informe placa e motorista' }
      }
      const placaNorm = placa.toUpperCase().trim()
      const motoristaNorm = motorista.trim()
      const base = state.cargas.find((c) => c.id === cargaId)
      if (!base) return { ok: false, error: 'Carga não encontrada' }
      if (!base.transportador_vencedor_id) {
        return { ok: false, error: 'Frete ainda não fechado' }
      }

      const cargaAlocada: Carga = {
        ...base,
        status: 'alocadas',
        placa: placaNorm,
        motorista: motoristaNorm,
        veiculo_id: opts?.veiculoId ?? base.veiculo_id,
        motorista_id: opts?.motoristaId ?? base.motorista_id,
      }

      setState((prev) => {
        const hist = makeHistorico('carga_alocada', `Composição alocada — ${base.numero}`, {
          carga_id: cargaId,
          transportador_id: base.transportador_vencedor_id,
          detalhe: `${placaNorm} · ${motoristaNorm}`,
        })
        return {
          ...prev,
          cargas: prev.cargas.map((c) => (c.id === cargaId ? cargaAlocada : c)),
          historico: [hist, ...prev.historico].slice(0, 2000),
        }
      })

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

      return { ok: true }
    },
    [config, state.cargas],
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
    setState((prev) => {
      const exists = prev.grupos.some((g) => g.id === grupo.id)
      return {
        ...prev,
        grupos: exists
          ? prev.grupos.map((g) => (g.id === grupo.id ? grupo : g))
          : [...prev.grupos, grupo],
      }
    })
  }, [])

  const salvarTransportador = useCallback((t: Transportador) => {
    if (t.situacao === 'ativo') setPortalAccountAtivoPorTransportador(t.id, true)
    if (t.situacao === 'pendente' || t.situacao === 'recusado' || t.situacao === 'inativo') {
      setPortalAccountAtivoPorTransportador(t.id, false)
    }
    setState((prev) => {
      const exists = prev.transportadores.some((x) => x.id === t.id)
      return {
        ...prev,
        transportadores: exists
          ? prev.transportadores.map((x) => (x.id === t.id ? t : x))
          : [...prev.transportadores, t],
      }
    })
    if (t.situacao === 'inativo' || t.situacao === 'recusado') {
      removeTransportadoraDaHierarquia(t.id)
    } else {
      syncTransportadoraNaHierarquia({
        id: t.id,
        nome_fantasia: t.nome_fantasia,
        cnpj: t.cnpj,
      })
    }
  }, [])

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
    (id: string) => {
      const t = state.transportadores.find((x) => x.id === id)
      if (!t) return { ok: false, error: 'Transportadora não encontrada.' }

      const vinculos = vinculosTransportador(id)
      removePortalAccountsPorTransportador(id)
      removeTransportadoraDaHierarquia(id)

      setState((prev) => {
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
        return {
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
            c.transportador_vencedor_id === id
              ? { ...c, transportador_vencedor_id: null }
              : c,
          ),
          historico: [hist, ...prev.historico].slice(0, 2000),
        }
      })
      return { ok: true }
    },
    [state.transportadores, vinculosTransportador, user],
  )

  const documentosDoTransportador = useCallback(
    (transportadorId: string) =>
      (state.documentos ?? []).filter((d) => d.transportador_id === transportadorId),
    [state.documentos],
  )

  const registrarCadastroTransportador = useCallback(
    async (input: CadastroTransportadorInput) => {
      const result = await submeterCadastroTransportador(input)
      if (!result.ok) return { ok: false, error: result.erro }
      setState((prev) => ({
        ...prev,
        transportadores: [...prev.transportadores, result.transportador],
        documentos: [...(prev.documentos ?? []), ...result.documentos],
      }))
      syncTransportadoraNaHierarquia({
        id: result.transportador.id,
        nome_fantasia: result.transportador.nome_fantasia,
        cnpj: result.transportador.cnpj,
      })
      return { ok: true, mensagem: result.mensagem }
    },
    [],
  )

  const aprovarTransportador = useCallback(async (id: string) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('transportadores')
        .update({ situacao: 'ativo', motivo_recusa: null })
        .eq('id', id)
      if (error) return { ok: false, error: error.message }
      await supabase.from('profiles').update({ ativo: true }).eq('transportador_id', id)
    }
    setPortalAccountAtivoPorTransportador(id, true)
    setState((prev) => {
      const atual = prev.transportadores.find((t) => t.id === id)
      if (atual) {
        syncTransportadoraNaHierarquia({
          id: atual.id,
          nome_fantasia: atual.nome_fantasia,
          cnpj: atual.cnpj,
        })
      }
      return {
        ...prev,
        transportadores: prev.transportadores.map((t) =>
          t.id === id ? { ...t, situacao: 'ativo', motivo_recusa: undefined } : t,
        ),
      }
    })
    return { ok: true }
  }, [])

  const recusarTransportador = useCallback(async (id: string, motivo?: string) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('transportadores')
        .update({ situacao: 'recusado', motivo_recusa: motivo ?? null })
        .eq('id', id)
      if (error) return { ok: false, error: error.message }
      await supabase.from('profiles').update({ ativo: false }).eq('transportador_id', id)
    }
    setPortalAccountAtivoPorTransportador(id, false)
    removeTransportadoraDaHierarquia(id)
    setState((prev) => ({
      ...prev,
      transportadores: prev.transportadores.map((t) =>
        t.id === id ? { ...t, situacao: 'recusado', motivo_recusa: motivo } : t,
      ),
    }))
    return { ok: true }
  }, [])

  const salvarVeiculo = useCallback((v: Veiculo) => {
    setState((prev) => {
      const list = prev.veiculos ?? []
      const exists = list.some((x) => x.id === v.id)
      return {
        ...prev,
        veiculos: exists ? list.map((x) => (x.id === v.id ? v : x)) : [...list, v],
      }
    })
  }, [])

  const excluirVeiculo = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      veiculos: (prev.veiculos ?? []).filter((v) => v.id !== id),
    }))
  }, [])

  const salvarRota = useCallback((r: Rota) => {
    setState((prev) => {
      const exists = prev.rotas.some((x) => x.id === r.id)
      return {
        ...prev,
        rotas: exists ? prev.rotas.map((x) => (x.id === r.id ? r : x)) : [...prev.rotas, r],
      }
    })
  }, [])

  const criarCarga = useCallback(
    (partial?: Partial<Carga>) => {
      const numero = String(128688 + Math.floor(Math.random() * 9000))
      const nova: Carga = {
        id: uid('c'),
        numero,
        pedido: '',
        ordem: `O/${69000 + Math.floor(Math.random() * 900)}-1`,
        tipo_carga: 'COMERCIAL - SECO',
        veiculo: 'CARRETA BAU',
        remetente: 'DOCA LIVRE OFERTA DE CARGA',
        remetente_cnpj: '67.620.377/0001-00',
        origem: '',
        destino: 'distribuição',
        destinatario: '',
        destinatario_cnpj: '',
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
        transportador_vencedor_id: null,
        frete_fechado: null,
        placa: null,
        motorista: null,
        veiculo_id: null,
        motorista_id: null,
        criado_por: user?.id ?? null,
        visualizacoes: 0,
        recusas: 0,
        created_at: new Date().toISOString(),
        ...partial,
      }
      setState((prev) => ({
        ...prev,
        cargas: [...prev.cargas, nova],
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
        return { ok: false, error: 'Só é possível editar cargas ainda não publicadas' }
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
    const normalized = normalizeMotorista(m)
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
            ? { ...x, veiculo_id: null }
            : x,
        )
      }
      const veiculos = (prev.veiculos ?? []).map((v) => {
        if (v.id !== normalized.veiculo_id) return v
        return {
          ...v,
          transportador_id: normalized.autonomo ? null : normalized.transportador_id,
          condutor: normalized.nome,
        }
      })
      return { ...prev, motoristas, veiculos }
    })
  }, [])

  const excluirMotorista = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      motoristas: (prev.motoristas ?? []).filter((m) => m.id !== id),
    }))
  }, [])

  const motoristasDoTransportador = useCallback(
    (transportadorId: string) =>
      (state.motoristas ?? []).filter((m) => m.transportador_id === transportadorId),
    [state.motoristas],
  )

  const marcarNotificacaoLida = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      notificacoes: prev.notificacoes.map((n) => (n.id === id ? { ...n, lida: true } : n)),
    }))
  }, [])

  const marcarTodasNotificacoesLidas = useCallback(() => {
    setState((prev) => ({
      ...prev,
      notificacoes: prev.notificacoes.map((n) => ({ ...n, lida: true })),
    }))
  }, [])

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
      // Transportador (ou Super “Ver como”) → avisa embarcador; senão → avisa transportadores
      const enviandoComoTransportador =
        userNow.role === 'transportador' || Boolean(actingTransportadorId)

      let notificacoes = prev.notificacoes
      if (enviandoComoTransportador) {
        notificacoes = pushNotif(notificacoes, {
          role: 'minerva',
          titulo: `Nova mensagem · carga ${carga.numero}`,
          mensagem: `${userNow.nome}: ${preview}`,
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
            titulo: `Nova mensagem · carga ${carga.numero}`,
            mensagem: `${userNow.nome}: ${preview}`,
            carga_id: cargaId,
          })
        } else {
          for (const tid of tids) {
            notificacoes = pushNotif(notificacoes, {
              role: 'transportador',
              transportador_id: tid,
              titulo: `Nova mensagem · carga ${carga.numero}`,
              mensagem: `${userNow.nome}: ${preview}`,
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
      return { ok: true }
    },
    [actingTransportadorId],
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

  const marcarChatLido = useCallback((cargaId: string) => {
    const userNow = userRef.current
    if (!userNow) return
    const agora = new Date().toISOString()
    const prev = stateRef.current
    const leituraKey = `${userNow.id}:${cargaId}`
    const next = {
      ...prev,
      chatLeituras: { ...(prev.chatLeituras ?? {}), [leituraKey]: agora },
      notificacoes: prev.notificacoes.map((n) =>
        n.carga_id === cargaId &&
        !n.lida &&
        n.titulo.toLowerCase().includes('mensagem')
          ? { ...n, lida: true }
          : n,
      ),
    }
    stateRef.current = next
    setState(next)
  }, [])

  const transportadorById = useCallback(
    (id: string) => state.transportadores.find((t) => t.id === id),
    [state.transportadores],
  )

  const cargasVisiveisTransportador = useCallback(
    (transportadorId: string) => {
      if (!transportadorId) return []
      const transportador = state.transportadores.find((t) => t.id === transportadorId)
      // situacao ausente = ativo (dados antigos); só bloqueia inativo
      if (!transportador || transportador.situacao === 'inativo') {
        return []
      }

      return state.cargas.filter((c) => {
        // Frete fechado / alocada / recusada do próprio vencedor
        if (c.transportador_vencedor_id === transportadorId) {
          return ['propostas', 'alocadas', 'recusadas', 'negociando', 'suspensas'].includes(
            c.status,
          )
        }

        // Já participou na rodada atual — continua vendo enquanto a negociação existir
        const temLanceProprio = state.lances.some(
          (l) =>
            l.carga_id === c.id &&
            l.transportador_id === transportadorId &&
            l.status !== 'cancelado' &&
            lanceNaRodadaAtual(l, c),
        )
        if (
          temLanceProprio &&
          ['negociando', 'propostas', 'suspensas'].includes(c.status) &&
          !c.transportador_vencedor_id
        ) {
          return true
        }

        if (!['negociando', 'propostas', 'suspensas'].includes(c.status)) return false
        if (c.transportador_vencedor_id) return false
        if (!c.publicado_em) return false

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
          return (g.transportador_ids ?? []).includes(transportadorId)
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
      registrarVisualizacao,
      notificarTodosGrupos,
      salvarGrupo,
      salvarTransportador,
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
      registrarCadastroTransportador,
      aprovarTransportador,
      recusarTransportador,
    }),
    [
      state,
      tick,
      config,
      salvarConfig,
      user,
      login,
      logout,
      refreshPermissoes,
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
      registrarVisualizacao,
      notificarTodosGrupos,
      salvarGrupo,
      salvarTransportador,
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
      registrarCadastroTransportador,
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
