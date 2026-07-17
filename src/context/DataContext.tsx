import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  DEMO_USERS,
  SEED_CARGAS,
  SEED_GRUPOS,
  SEED_LANCES,
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
import type {
  AppUser,
  Carga,
  GrupoTransportador,
  Lance,
  ModoPublicacao,
  Profile,
  Rota,
  Transportador,
  TransportadorDocumento,
  Veiculo,
} from '../types'
import {
  portalLoginLocal,
  getPermissaoUsuario,
  loadPortalAccounts,
  setPortalAccountAtivoPorTransportador,
} from '../lib/portalAuth'
import {
  submeterCadastroTransportador,
  type CadastroTransportadorInput,
} from '../lib/cadastroTransportador'
import { isLocalSuperUser } from '../lib/superUsers'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const STORAGE_KEY = 'doca-livre-data-v3'
const AUTH_KEY = 'doca-livre-auth-v1'

interface PublishPayload {
  cargaId: string
  margemPercentual: number
  grupoIds: string[]
  prazoLeilaoMinutos: number
  prazoAlocacaoMinutos: number
  justificativaMotivo?: string
  justificativaObs?: string
}

interface DataState {
  cargas: Carga[]
  lances: Lance[]
  transportadores: Transportador[]
  veiculos: Veiculo[]
  documentos: TransportadorDocumento[]
  grupos: GrupoTransportador[]
  rotas: Rota[]
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
  publicarCarga: (payload: PublishPayload) => { ok: boolean; error?: string }
  enviarLance: (cargaId: string, valor: number) => { ok: boolean; error?: string }
  aceitarLance: (lanceId: string) => { ok: boolean; error?: string }
  recusarCargaMinerva: (cargaId: string) => void
  recusarCargaTransportador: (cargaId: string) => void
  alocarComposicao: (cargaId: string, placa: string, motorista: string) => { ok: boolean; error?: string }
  registrarVisualizacao: (cargaId: string) => void
  salvarGrupo: (grupo: GrupoTransportador) => void
  salvarTransportador: (t: Transportador) => void
  salvarVeiculo: (v: Veiculo) => void
  excluirVeiculo: (id: string) => void
  salvarRota: (r: Rota) => void
  criarCarga: (partial?: Partial<Carga>) => Carga
  lancesDaCarga: (cargaId: string) => Lance[]
  transportadorById: (id: string) => Transportador | undefined
  cargasVisiveisTransportador: (transportadorId: string) => Carga[]
  documentosDoTransportador: (transportadorId: string) => TransportadorDocumento[]
  registrarCadastroTransportador: (
    input: CadastroTransportadorInput,
  ) => Promise<{ ok: boolean; error?: string; mensagem?: string }>
  aprovarTransportador: (id: string) => Promise<{ ok: boolean; error?: string }>
  recusarTransportador: (id: string, motivo?: string) => Promise<{ ok: boolean; error?: string }>
}

const DataContext = createContext<DataContextValue | null>(null)

function defaultState(): DataState {
  return {
    cargas: structuredClone(SEED_CARGAS),
    lances: structuredClone(SEED_LANCES),
    transportadores: structuredClone(SEED_TRANSPORTADORES),
    veiculos: structuredClone(SEED_VEICULOS),
    documentos: [],
    grupos: structuredClone(SEED_GRUPOS),
    rotas: structuredClone(SEED_ROTAS),
  }
}

function loadState(): DataState {
  const defaults = defaultState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<DataState>
    return {
      cargas: Array.isArray(parsed.cargas) ? parsed.cargas : defaults.cargas,
      lances: Array.isArray(parsed.lances) ? parsed.lances : defaults.lances,
      transportadores: Array.isArray(parsed.transportadores)
        ? parsed.transportadores
        : defaults.transportadores,
      veiculos: Array.isArray(parsed.veiculos) ? parsed.veiculos : defaults.veiculos,
      documentos: Array.isArray(parsed.documentos) ? parsed.documentos : defaults.documentos,
      grupos: Array.isArray(parsed.grupos) ? parsed.grupos : defaults.grupos,
      rotas: Array.isArray(parsed.rotas) ? parsed.rotas : defaults.rotas,
    }
  } catch {
    return defaults
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

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>(loadState)
  const [user, setUser] = useState<Profile | null>(loadAuth)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    if (user) localStorage.setItem(AUTH_KEY, JSON.stringify(user))
    else localStorage.removeItem(AUTH_KEY)
  }, [user])

  // Timer: metade do prazo → notifica demais grupos; fim do prazo → fecha leilão
  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => t + 1)
      setState((prev) => {
        let changed = false
        const now = Date.now()
        const cargas = prev.cargas.map((c) => {
          if (!c.publicado_em || !c.expira_em) return c
          if (!['negociando', 'propostas'].includes(c.status)) return c

          const pub = new Date(c.publicado_em).getTime()
          const exp = new Date(c.expira_em).getTime()
          const mid = pub + (exp - pub) / 2

          // Notificar demais grupos na metade do tempo
          if (now >= mid && c.grupo_ids.length > c.grupos_notificados.length) {
            changed = true
            return { ...c, grupos_notificados: [...c.grupo_ids] }
          }

          return c
        })

        // Marcar melhor lance como destaque ao expirar leilão
        let lances = prev.lances
        let transportadores = prev.transportadores

        const expiredAuctions = prev.cargas.filter(
          (c) =>
            c.modo_publicacao === 'leilao' &&
            c.expira_em &&
            new Date(c.expira_em).getTime() <= now &&
            ['negociando', 'propostas'].includes(c.status) &&
            !c.transportador_vencedor_id,
        )

        for (const c of expiredAuctions) {
          const ativos = lances
            .filter((l) => l.carga_id === c.id && l.status === 'ativo')
            .sort((a, b) => a.valor - b.valor)
          const idx = cargas.findIndex((x) => x.id === c.id)
          if (idx < 0) continue

          if (ativos.length === 0) {
            changed = true
            cargas[idx] = { ...cargas[idx], status: 'recusadas' }
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
        }

        if (!changed) return prev
        return { ...prev, cargas, lances, transportadores }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

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
      permissoes_modulos: permissoes.modulos,
    })
    return { ok: true }
  }, [])

  const logout = useCallback(() => setUser(null), [])

  const refreshPermissoes = useCallback(() => {
    setUser((prev) => {
      if (!prev) return prev
      const accounts = loadPortalAccounts()
      const account = accounts.find((a) => a.id === prev.id || a.usuario === prev.usuario)
      if (!account) return prev
      const isSuperuser =
        Boolean(prev.is_superuser) ||
        isLocalSuperUser(account.usuario) ||
        isLocalSuperUser(account.email)
      const perms = getPermissaoUsuario(account)
      return {
        ...prev,
        is_superuser: isSuperuser,
        permissoes_modulos: isSuperuser ? null : perms.modulos,
        empresa_org_id: account.empresa_org_id ?? prev.empresa_org_id,
        transportador_id: account.transportador_id ?? prev.transportador_id,
      }
    })
  }, [])

  const publicarCarga = useCallback((payload: PublishPayload) => {
    const { prioridade, modo, exigeJustificativa } = calcularPrioridadeEModo(
      payload.prazoLeilaoMinutos,
    )
    if (exigeJustificativa && !payload.justificativaMotivo) {
      return { ok: false, error: 'Justificativa obrigatória para prazo ≤ 30 minutos' }
    }
    if (payload.grupoIds.length === 0) {
      return { ok: false, error: 'Selecione ao menos um grupo de transportadores' }
    }

    setState((prev) => {
      const cargas = prev.cargas.map((c) => {
        if (c.id !== payload.cargaId) return c
        const { freteOferta } = calcularFreteOferta(c.frete_tabela, payload.margemPercentual)
        const now = Date.now()
        return {
          ...c,
          margem_percentual: payload.margemPercentual,
          frete_oferta: freteOferta,
          grupo_ids: payload.grupoIds,
          grupos_notificados: [payload.grupoIds[0]],
          prazo_leilao_minutos: payload.prazoLeilaoMinutos,
          prazo_alocacao_minutos: payload.prazoAlocacaoMinutos,
          prioridade,
          modo_publicacao: modo as ModoPublicacao,
          justificativa_motivo: payload.justificativaMotivo ?? null,
          justificativa_obs: payload.justificativaObs ?? null,
          status: 'negociando' as const,
          publicado_em: new Date(now).toISOString(),
          expira_em: new Date(now + payload.prazoLeilaoMinutos * 60_000).toISOString(),
        }
      })
      return { ...prev, cargas }
    })
    return { ok: true }
  }, [])

  const enviarLance = useCallback(
    (cargaId: string, valor: number) => {
      if (!user?.transportador_id) return { ok: false, error: 'Usuário sem transportador' }
      const carga = state.cargas.find((c) => c.id === cargaId)
      if (!carga) return { ok: false, error: 'Carga não encontrada' }
      if (!['negociando', 'propostas'].includes(carga.status)) {
        return { ok: false, error: 'Carga não está aberta para lances' }
      }
      if (carga.expira_em && new Date(carga.expira_em).getTime() < Date.now()) {
        return { ok: false, error: 'Prazo de oferta encerrado' }
      }
      if (valor <= 0) return { ok: false, error: 'Valor inválido' }

      const freteRef = carga.frete_oferta ?? carga.frete_tabela

      // Modo Oferta: primeira oferta menor que o proposto fecha
      if (carga.modo_publicacao === 'oferta' && valor < freteRef) {
        setState((prev) => {
          const lance: Lance = {
            id: uid('lance'),
            carga_id: cargaId,
            transportador_id: user.transportador_id!,
            valor,
            status: 'vencedor',
            created_at: new Date().toISOString(),
          }
          const cargas = prev.cargas.map((c) =>
            c.id === cargaId
              ? {
                  ...c,
                  status: 'propostas' as const,
                  transportador_vencedor_id: user.transportador_id!,
                  frete_fechado: valor,
                  alocacao_expira_em: new Date(
                    Date.now() + (c.prazo_alocacao_minutos ?? 10) * 60_000,
                  ).toISOString(),
                }
              : c,
          )
          const transportadores = prev.transportadores.map((t) => {
            if (t.id !== user.transportador_id) return t
            const pontuacao =
              t.pontuacao + PONTOS_ADERENCIA.com_proposta + PONTOS_ADERENCIA.frete_fechado
            return { ...t, pontuacao, classificacao: classificacaoPorPontuacao(pontuacao) }
          })
          return {
            ...prev,
            cargas,
            lances: [...prev.lances.filter((l) => !(l.carga_id === cargaId && l.transportador_id === user.transportador_id && l.status === 'ativo')), lance],
            transportadores,
          }
        })
        return { ok: true }
      }

      setState((prev) => {
        const existing = prev.lances.find(
          (l) =>
            l.carga_id === cargaId &&
            l.transportador_id === user.transportador_id &&
            l.status === 'ativo',
        )
        let lances: Lance[]
        if (existing) {
          lances = prev.lances.map((l) =>
            l.id === existing.id ? { ...l, valor, created_at: new Date().toISOString() } : l,
          )
        } else {
          lances = [
            ...prev.lances,
            {
              id: uid('lance'),
              carga_id: cargaId,
              transportador_id: user.transportador_id!,
              valor,
              status: 'ativo',
              created_at: new Date().toISOString(),
            },
          ]
        }
        const cargas = prev.cargas.map((c) =>
          c.id === cargaId && c.status === 'negociando'
            ? { ...c, status: 'propostas' as const }
            : c,
        )
        const isNew = !existing
        const transportadores = isNew
          ? prev.transportadores.map((t) => {
              if (t.id !== user.transportador_id) return t
              const pontuacao = t.pontuacao + PONTOS_ADERENCIA.com_proposta
              return { ...t, pontuacao, classificacao: classificacaoPorPontuacao(pontuacao) }
            })
          : prev.transportadores
        return { ...prev, cargas, lances, transportadores }
      })
      return { ok: true }
    },
    [state.cargas, user],
  )

  const aceitarLance = useCallback((lanceId: string) => {
    setState((prev) => {
      const lance = prev.lances.find((l) => l.id === lanceId)
      if (!lance) return prev
      const carga = prev.cargas.find((c) => c.id === lance.carga_id)
      if (!carga) return prev
      const lances = prev.lances.map((l) => {
        if (l.carga_id !== lance.carga_id) return l
        if (l.id === lanceId) return { ...l, status: 'vencedor' as const }
        if (l.status === 'ativo') return { ...l, status: 'perdido' as const }
        return l
      })
      const cargas = prev.cargas.map((c) =>
        c.id === lance.carga_id
          ? {
              ...c,
              status: 'propostas' as const,
              transportador_vencedor_id: lance.transportador_id,
              frete_fechado: lance.valor,
              alocacao_expira_em: new Date(
                Date.now() + (c.prazo_alocacao_minutos ?? 10) * 60_000,
              ).toISOString(),
            }
          : c,
      )
      const transportadores = prev.transportadores.map((t) => {
        if (t.id !== lance.transportador_id) return t
        const pontuacao = t.pontuacao + PONTOS_ADERENCIA.frete_fechado
        return { ...t, pontuacao, classificacao: classificacaoPorPontuacao(pontuacao) }
      })
      return { ...prev, cargas, lances, transportadores }
    })
    return { ok: true }
  }, [])

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

  const recusarCargaTransportador = useCallback(
    (cargaId: string) => {
      if (!user?.transportador_id) return
      setState((prev) => {
        const transportadores = prev.transportadores.map((t) => {
          if (t.id !== user.transportador_id) return t
          const pontuacao = t.pontuacao + PONTOS_ADERENCIA.recusada
          return { ...t, pontuacao, classificacao: classificacaoPorPontuacao(pontuacao) }
        })
        const cargas = prev.cargas.map((c) =>
          c.id === cargaId ? { ...c, recusas: c.recusas + 1 } : c,
        )
        return { ...prev, transportadores, cargas }
      })
    },
    [user],
  )

  const alocarComposicao = useCallback((cargaId: string, placa: string, motorista: string) => {
    if (!placa.trim() || !motorista.trim()) {
      return { ok: false, error: 'Informe placa e motorista' }
    }
    setState((prev) => ({
      ...prev,
      cargas: prev.cargas.map((c) =>
        c.id === cargaId
          ? {
              ...c,
              status: 'alocadas' as const,
              placa: placa.toUpperCase().trim(),
              motorista: motorista.trim(),
            }
          : c,
      ),
    }))
    return { ok: true }
  }, [])

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
  }, [])

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
    setState((prev) => ({
      ...prev,
      transportadores: prev.transportadores.map((t) =>
        t.id === id ? { ...t, situacao: 'ativo', motivo_recusa: undefined } : t,
      ),
    }))
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

  const criarCarga = useCallback((partial?: Partial<Carga>) => {
    const numero = String(128688 + Math.floor(Math.random() * 9000))
    const rota = SEED_ROTAS[0]
    const nova: Carga = {
      id: uid('c'),
      numero,
      pedido: String(11167000 + Math.floor(Math.random() * 900)),
      ordem: `O/${69000 + Math.floor(Math.random() * 900)}-1`,
      tipo_carga: 'COMERCIAL - SECO',
      veiculo: 'CARRETA BAU',
      remetente: 'DOCA LIVRE OFERTA DE CARGA',
      remetente_cnpj: '67.620.377/0001-00',
      origem: rota.origem,
      destino: rota.destino,
      destinatario: 'DESTINATÁRIO DEMO',
      destinatario_cnpj: '99.999.999/0001-99',
      peso: 15000,
      volumes: 400,
      num_entregas: 1,
      pallets: 0,
      valor_mercadorias: 200000,
      frete_tabela: rota.frete_tabela,
      frete_oferta: null,
      margem_percentual: null,
      data_carregamento: new Date(Date.now() + 86400000).toISOString(),
      previsao_entrega: new Date(Date.now() + 172800000).toISOString(),
      rota_id: rota.id,
      classificacao_rota: rota.classificacao,
      status: 'nova_carga',
      prioridade: null,
      modo_publicacao: null,
      prazo_leilao_minutos: null,
      prazo_alocacao_minutos: null,
      publicado_em: null,
      expira_em: null,
      alocacao_expira_em: null,
      justificativa_motivo: null,
      justificativa_obs: null,
      grupo_ids: [],
      grupos_notificados: [],
      transportador_vencedor_id: null,
      frete_fechado: null,
      placa: null,
      motorista: null,
      visualizacoes: 0,
      recusas: 0,
      created_at: new Date().toISOString(),
      ...partial,
    }
    setState((prev) => ({ ...prev, cargas: [...prev.cargas, nova] }))
    return nova
  }, [])

  const lancesDaCarga = useCallback(
    (cargaId: string) =>
      state.lances
        .filter((l) => l.carga_id === cargaId)
        .sort((a, b) => a.valor - b.valor),
    [state.lances],
  )

  const transportadorById = useCallback(
    (id: string) => state.transportadores.find((t) => t.id === id),
    [state.transportadores],
  )

  const cargasVisiveisTransportador = useCallback(
    (transportadorId: string) => {
      return state.cargas.filter((c) => {
        if (!['negociando', 'propostas', 'alocadas'].includes(c.status) && !(c.status === 'propostas' || c.transportador_vencedor_id)) {
          // include confirmadas logically via vencedor
        }
        if (c.status === 'nova_carga') return false
        if (c.status === 'recusadas' && c.transportador_vencedor_id !== transportadorId) return false

        // Alocadas / confirmadas só do vencedor
        if (c.transportador_vencedor_id === transportadorId) return true

        if (!['negociando', 'propostas'].includes(c.status)) return false

        // Visível se está em grupo notificado
        const gruposOk = c.grupos_notificados.length
          ? c.grupos_notificados
          : c.grupo_ids
        return state.grupos.some(
          (g) =>
            gruposOk.includes(g.id) && g.transportador_ids.includes(transportadorId),
        )
      })
    },
    [state.cargas, state.grupos],
  )

  const value = useMemo<DataContextValue>(
    () => ({
      ...state,
      tick,
      user,
      login,
      logout,
      refreshPermissoes,
      demoUsers: DEMO_USERS,
      publicarCarga,
      enviarLance,
      aceitarLance,
      recusarCargaMinerva,
      recusarCargaTransportador,
      alocarComposicao,
      registrarVisualizacao,
      salvarGrupo,
      salvarTransportador,
      salvarVeiculo,
      excluirVeiculo,
      salvarRota,
      criarCarga,
      lancesDaCarga,
      transportadorById,
      cargasVisiveisTransportador,
      documentosDoTransportador,
      registrarCadastroTransportador,
      aprovarTransportador,
      recusarTransportador,
    }),
    [
      state,
      tick,
      user,
      login,
      logout,
      refreshPermissoes,
      publicarCarga,
      enviarLance,
      aceitarLance,
      recusarCargaMinerva,
      recusarCargaTransportador,
      alocarComposicao,
      registrarVisualizacao,
      salvarGrupo,
      salvarTransportador,
      salvarVeiculo,
      excluirVeiculo,
      salvarRota,
      criarCarga,
      lancesDaCarga,
      transportadorById,
      cargasVisiveisTransportador,
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
