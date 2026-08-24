import type { RealtimeChannel } from '@supabase/supabase-js'
import type {
  Carga,
  ChatMensagem,
  GrupoTransportador,
  HistoricoEvento,
  HistoricoProposta,
  Lance,
  Motorista,
  NotificacaoInApp,
  Rota,
  Transportador,
  Veiculo,
} from '../types'
import { alinharStatusComLances } from './kanbanColumns'
import { flagSim } from './cargaDefaults'
import { dedupeRotas, limparPontosPassagemRota } from './rotasSync'
import { isSupabaseConfigured, supabase } from './supabase'
import { veiculoParaSync } from './veiculosSync'

const SYNC_ROW_ID = 'main'
const CLIENT_KEY = 'doca-livre-sync-client-id'
const CHANNEL_NAME = 'kanban-sync-live'
const BROADCAST_EVENT = 'kanban-update'

export type KanbanSyncSlice = {
  cargas: Carga[]
  lances: Lance[]
  grupos: GrupoTransportador[]
  transportadores: Transportador[]
  /** Frota replicada para todos (supers e transportadora vinculada) */
  veiculos: Veiculo[]
  motoristas: Motorista[]
  /** Rotas de frete — precisam sobreviver a F5 / outro aparelho */
  rotas: Rota[]
  notificacoes: NotificacaoInApp[]
  mensagens: ChatMensagem[]
  historico: HistoricoEvento[]
  historicoPropostas: HistoricoProposta[]
  chatLeituras: Record<string, string>
  /** IDs removidos (rascunhos excluídos) — impede o merge de “ressuscitar” a carga */
  cargas_excluidas?: string[]
  /** IDs de transportadoras excluídas — impede o merge de “ressuscitar” o cadastro */
  transportadores_excluidos?: string[]
  /** Placas/motoristas removidos — impede o merge de “ressuscitar” o cadastro */
  veiculos_excluidos?: string[]
  motoristas_excluidos?: string[]
  /** Rotas removidas — impede o merge de “ressuscitar” o cadastro */
  rotas_excluidos?: string[]
}

export type KanbanSyncPayload = {
  client_id: string
  updated_at: string
  slice: KanbanSyncSlice
}

export type PullResult =
  | { ok: true; payload: KanbanSyncPayload }
  | { ok: true; empty: true }
  | { ok: false; error: string }

let liveChannel: RealtimeChannel | null = null
/** Único por aba/JS — evita duas abas com o mesmo id ignorarem o sync uma da outra. */
let memoryClientId: string | null = null

export function getClientId(): string {
  if (memoryClientId) return memoryClientId
  memoryClientId = `cli-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
  try {
    sessionStorage.setItem(CLIENT_KEY, memoryClientId)
  } catch {
    /* ignore */
  }
  return memoryClientId
}

export function pickSyncSlice(state: KanbanSyncSlice): KanbanSyncSlice {
  return {
    cargas: state.cargas,
    lances: state.lances,
    grupos: state.grupos,
    transportadores: state.transportadores,
    veiculos: (state.veiculos ?? []).map(veiculoParaSync),
    motoristas: state.motoristas ?? [],
    rotas: dedupeRotas(state.rotas ?? []),
    notificacoes: state.notificacoes,
    mensagens: state.mensagens,
    historico: state.historico,
    historicoPropostas: state.historicoPropostas,
    chatLeituras: state.chatLeituras ?? {},
    cargas_excluidas: state.cargas_excluidas ?? [],
    transportadores_excluidos: state.transportadores_excluidos ?? [],
    veiculos_excluidos: state.veiculos_excluidos ?? [],
    motoristas_excluidos: state.motoristas_excluidos ?? [],
    rotas_excluidos: state.rotas_excluidos ?? [],
  }
}

const KANBAN_BACKUP_KEY = 'doca-livre-kanban-backup-v1'

/** Backup da aba — sobrevive a F5 enquanto o sync remoto alcança. */
export function saveKanbanBackup(slice: KanbanSyncSlice) {
  try {
    sessionStorage.setItem(
      KANBAN_BACKUP_KEY,
      JSON.stringify({ at: Date.now(), slice: pickSyncSlice(slice) }),
    )
  } catch {
    /* quota / private mode */
  }
}

export function loadKanbanBackup(): KanbanSyncSlice | null {
  try {
    const raw = sessionStorage.getItem(KANBAN_BACKUP_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; slice?: KanbanSyncSlice }
    if (!parsed?.slice || !Array.isArray(parsed.slice.cargas)) return null
    // Descarta backup muito antigo (12h)
    if (parsed.at && Date.now() - parsed.at > 12 * 60 * 60_000) return null
    return parsed.slice
  } catch {
    return null
  }
}

export function sliceFingerprint(slice: KanbanSyncSlice): string {
  return JSON.stringify(slice)
}

function ts(iso?: string | null): number {
  if (!iso) return 0
  const n = new Date(iso).getTime()
  return Number.isFinite(n) ? n : 0
}

function mergeById<T extends { id: string; updated_at?: string; created_at?: string }>(
  local: T[],
  remote: T[],
): T[] {
  const map = new Map<string, T>()
  for (const item of local) map.set(item.id, item)
  for (const item of remote) {
    const prev = map.get(item.id)
    if (!prev) {
      map.set(item.id, item)
      continue
    }
    const remoteT = ts(item.updated_at) || ts(item.created_at)
    const localT = ts(prev.updated_at) || ts(prev.created_at)
    if (remoteT >= localT) map.set(item.id, item)
  }
  return Array.from(map.values())
}

/** Merge de cargas: não apaga flags de retorno se o remoto veio sem o campo. */
function mergeCargas(local: Carga[], remote: Carga[]): Carga[] {
  const map = new Map<string, Carga>()
  for (const item of local) map.set(item.id, item)
  for (const item of remote) {
    const prev = map.get(item.id)
    if (!prev) {
      map.set(item.id, item)
      continue
    }
    const remoteT = ts(item.updated_at) || ts(item.created_at)
    const localT = ts(prev.updated_at) || ts(prev.created_at)
    if (remoteT < localT) continue
    const remotoTemRetorno = Object.prototype.hasOwnProperty.call(item, 'carga_retorno')
    const remotoTemOrigem = Object.prototype.hasOwnProperty.call(item, 'retorna_origem')
    const pontosRem = limparPontosPassagemRota(item.pontos_passagem)
    const pontosPrev = limparPontosPassagemRota(prev.pontos_passagem)
    map.set(item.id, {
      ...prev,
      ...item,
      carga_retorno: remotoTemRetorno ? flagSim(item.carga_retorno) : flagSim(prev.carga_retorno),
      retorna_origem: remotoTemOrigem
        ? flagSim(item.retorna_origem)
        : flagSim(prev.retorna_origem),
      pontos_passagem: pontosRem.length > 0 ? pontosRem : pontosPrev,
      tipo_oferta: item.tipo_oferta ?? prev.tipo_oferta,
      nome_rota: item.nome_rota ?? prev.nome_rota,
      clientes_distribuicao: Array.isArray(item.clientes_distribuicao)
        ? item.clientes_distribuicao
        : prev.clientes_distribuicao,
    })
  }
  return Array.from(map.values())
}

/**
 * Grupos: o remoto só substitui se for claramente mais novo.
 * Em empate (sem updated_at), preserva a lista local de membros — evita
 * outro aparelho com cópia antiga apagar Ultrafrio/OURO etc.
 */
function mergeGrupos(
  local: GrupoTransportador[],
  remote: GrupoTransportador[],
): GrupoTransportador[] {
  const map = new Map<string, GrupoTransportador>()
  for (const g of local) map.set(g.id, g)
  for (const g of remote) {
    const prev = map.get(g.id)
    if (!prev) {
      map.set(g.id, g)
      continue
    }
    const remoteT = ts(g.updated_at)
    const localT = ts(prev.updated_at)
    if (remoteT > localT) {
      map.set(g.id, g)
      continue
    }
    if (localT > remoteT) {
      continue
    }
    // Empate / sem timestamp: preserva a lista local de membros
    // (não unir com o remoto — evita demos/cópia antiga voltarem sozinhas).
    map.set(g.id, {
      ...g,
      ...prev,
      descricao: prev.descricao || g.descricao,
      observacao: prev.observacao ?? g.observacao,
      situacao: prev.situacao || g.situacao,
      transportador_ids: prev.transportador_ids ?? [],
      updated_at: prev.updated_at || g.updated_at,
    })
  }
  // Remoto trouxe grupos novos já cobertos; inclui locais que remoto não tem
  return Array.from(map.values())
}

/**
 * O slice não carrega base64; se o remoto vier sem uma foto que já existe aqui,
 * mantém a local para não “apagar” o cadastro na tela de quem tirou as fotos.
 */
function preservarFotosLocais(locais: Veiculo[], remoto: Veiculo): Veiculo {
  const local = locais.find((v) => v.id === remoto.id)
  if (!local) return remoto
  const fotos = { ...(local.fotos ?? {}), ...(remoto.fotos ?? {}) }
  return { ...remoto, fotos, foto_url: remoto.foto_url || local.foto_url }
}

/** Não deixa sync remoto sem coords apagar localização salva na placa. */
function preservarLocalizacaoVeiculo(locais: Veiculo[], remoto: Veiculo): Veiculo {
  const local = locais.find((v) => v.id === remoto.id)
  if (!local) return remoto
  const remotoTem =
    remoto.origem_lat != null &&
    remoto.origem_lng != null &&
    Number.isFinite(Number(remoto.origem_lat)) &&
    Number.isFinite(Number(remoto.origem_lng))
  const localTem =
    local.origem_lat != null &&
    local.origem_lng != null &&
    Number.isFinite(Number(local.origem_lat)) &&
    Number.isFinite(Number(local.origem_lng))
  if (remotoTem || !localTem) return remoto
  return {
    ...remoto,
    origem_cep: local.origem_cep ?? remoto.origem_cep,
    origem_cidade: local.origem_cidade ?? remoto.origem_cidade,
    origem_uf: local.origem_uf ?? remoto.origem_uf,
    origem_endereco: local.origem_endereco ?? remoto.origem_endereco,
    origem_numero: local.origem_numero ?? remoto.origem_numero,
    origem_bairro: local.origem_bairro ?? remoto.origem_bairro,
    origem_complemento: local.origem_complemento ?? remoto.origem_complemento,
    origem_lat: local.origem_lat,
    origem_lng: local.origem_lng,
    raio_km: local.raio_km ?? remoto.raio_km,
  }
}

/** Mescla remoto sem apagar publicações locais mais novas. */
export function applySyncSlice<T extends KanbanSyncSlice>(prev: T, slice: KanbanSyncSlice): T {
  const remoteCargas = Array.isArray(slice.cargas) ? slice.cargas : []
  const remoteLances = Array.isArray(slice.lances) ? slice.lances : []
  // Tombstone manda: carga excluída localmente não volta só porque o remoto ainda tem ela
  // (corrida pull/push). Só some do tombstone quando o remoto também não traz mais o id
  // E o slice remoto já lista a exclusão — ou após merge filtramos pelo set unido.
  const cargasExcluidas = Array.from(
    new Set([...(prev.cargas_excluidas ?? []), ...(slice.cargas_excluidas ?? [])]),
  ).slice(-500)
  const excluidas = new Set(cargasExcluidas)
  const transportadoresExcluidos = Array.from(
    new Set([
      ...(prev.transportadores_excluidos ?? []),
      ...(slice.transportadores_excluidos ?? []),
    ]),
  ).slice(-500)
  const tExcluidos = new Set(transportadoresExcluidos)
  const veiculosExcluidos = Array.from(
    new Set([...(prev.veiculos_excluidos ?? []), ...(slice.veiculos_excluidos ?? [])]),
  ).slice(-500)
  const vExcluidos = new Set(veiculosExcluidos)
  const motoristasExcluidos = Array.from(
    new Set([...(prev.motoristas_excluidos ?? []), ...(slice.motoristas_excluidos ?? [])]),
  ).slice(-500)
  const mExcluidos = new Set(motoristasExcluidos)
  const rotasExcluidos = Array.from(
    new Set([...(prev.rotas_excluidos ?? []), ...(slice.rotas_excluidos ?? [])]),
  ).slice(-500)
  const rExcluidos = new Set(rotasExcluidos)

  // Remoto vazio NÃO apaga cargas locais publicadas/rascunhos
  const cargasMerged =
    remoteCargas.length === 0 && prev.cargas.length > 0
      ? prev.cargas
      : mergeCargas(prev.cargas, remoteCargas)
  const cargas = cargasMerged
    .filter((c) => !excluidas.has(c.id))
    .map((c) =>
      c.rota_id && rExcluidos.has(c.rota_id) ? { ...c, rota_id: null } : c,
    )

  const lancesMerged =
    remoteLances.length === 0 && prev.lances.length > 0
      ? // Remoto sem lances não apaga propostas locais (corrida de push / payload incompleto)
        prev.lances
      : mergeById(prev.lances, remoteLances)
  const lances = lancesMerged.filter((l) => !excluidas.has(l.carga_id))

  const merged = {
    ...prev,
    cargas,
    lances,
    cargas_excluidas: cargasExcluidas,
    transportadores_excluidos: transportadoresExcluidos,
    veiculos_excluidos: veiculosExcluidos,
    motoristas_excluidos: motoristasExcluidos,
    rotas_excluidos: rotasExcluidos,
    veiculos: mergeById(prev.veiculos ?? [], slice.veiculos ?? [])
      .filter((v) => !vExcluidos.has(v.id))
      .map((v) => preservarFotosLocais(prev.veiculos ?? [], v))
      .map((v) => preservarLocalizacaoVeiculo(prev.veiculos ?? [], v))
      .map((v) => {
        // Sync incompleto sem transportador_id não vira “Autônomo”
        if (v.transportador_id) return v
        const local = (prev.veiculos ?? []).find((x) => x.id === v.id)
        if (local?.transportador_id) {
          return { ...v, transportador_id: local.transportador_id }
        }
        return v
      }),
    motoristas: mergeById(prev.motoristas ?? [], slice.motoristas ?? [])
      .filter((m) => !mExcluidos.has(m.id))
      .map((m) => (m.veiculo_id && vExcluidos.has(m.veiculo_id) ? { ...m, veiculo_id: null } : m))
      .map((m) => {
        const local = (prev.motoristas ?? []).find((x) => x.id === m.id)
        if (!local) return m
        return {
          ...m,
          foto_url: m.foto_url || local.foto_url,
          cnh_arquivo_url: m.cnh_arquivo_url || local.cnh_arquivo_url,
          cnh_arquivo_nome: m.cnh_arquivo_nome || local.cnh_arquivo_nome,
        }
      }),
    grupos: (slice.grupos?.length
      ? mergeGrupos(prev.grupos, slice.grupos)
      : prev.grupos
    ).map((g) =>
      (g.transportador_ids ?? []).some((tid) => tExcluidos.has(tid))
        ? { ...g, transportador_ids: g.transportador_ids.filter((tid) => !tExcluidos.has(tid)) }
        : g,
    ),
    transportadores: (slice.transportadores?.length
      ? mergeById(prev.transportadores, slice.transportadores)
      : prev.transportadores
    ).filter((t) => !tExcluidos.has(t.id)),
    rotas: (() => {
      const remote = Array.isArray(slice.rotas) ? slice.rotas : []
      const local = prev.rotas ?? []
      // Remoto sem rotas não apaga cadastros locais (payload antigo / corrida)
      const merged =
        remote.length === 0 && local.length > 0
          ? local
          : mergeById(local, remote)
      return dedupeRotas(merged.filter((r) => !rExcluidos.has(r.id)))
    })(),
    notificacoes: (() => {
      const local = prev.notificacoes ?? []
      const remote = slice.notificacoes ?? []
      const merged = mergeById(local, remote).filter(
        (n) => !n.carga_id || !excluidas.has(n.carga_id),
      )
      // Dedupe por chave estável (ex.: cadastro-pendente:id)
      const seenChave = new Set<string>()
      const deduped: typeof merged = []
      for (const n of merged) {
        if (n.chave) {
          if (seenChave.has(n.chave)) continue
          seenChave.add(n.chave)
        }
        deduped.push(n)
      }
      // Uma vez lida localmente, não “desler” por sync antigo
      const localLidas = new Set(local.filter((n) => n.lida).map((n) => n.id))
      const localLidasChave = new Set(
        local.filter((n) => n.lida && n.chave).map((n) => n.chave as string),
      )
      return deduped.map((n) =>
        localLidas.has(n.id) || (n.chave && localLidasChave.has(n.chave))
          ? { ...n, lida: true }
          : n,
      )
    })(),
    mensagens: mergeById(prev.mensagens ?? [], slice.mensagens ?? []).filter(
      (m) => !excluidas.has(m.carga_id),
    ),
    historico: mergeById(prev.historico ?? [], slice.historico ?? []).slice(0, 2000),
    historicoPropostas: mergeById(
      prev.historicoPropostas ?? [],
      slice.historicoPropostas ?? [],
    )
      .filter((h) => !excluidas.has(h.carga_id))
      .slice(0, 3000),
    chatLeituras: { ...(prev.chatLeituras ?? {}), ...(slice.chatLeituras ?? {}) },
  }

  return {
    ...merged,
    cargas: alinharStatusComLances(merged.cargas, merged.lances),
  }
}

function parsePayload(raw: unknown, fallbackClient?: string, fallbackAt?: string): KanbanSyncPayload | null {
  const payload = raw as Partial<KanbanSyncPayload> | null
  if (!payload?.slice || !Array.isArray(payload.slice.cargas)) return null
  return {
    client_id: payload.client_id ?? fallbackClient ?? '',
    updated_at: payload.updated_at ?? fallbackAt ?? new Date().toISOString(),
    slice: payload.slice,
  }
}

export async function pullKanbanSync(): Promise<PullResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, error: 'Supabase não configurado' }
  }
  const { data, error } = await supabase
    .from('kanban_sync')
    .select('payload, updated_at, client_id')
    .eq('id', SYNC_ROW_ID)
    .maybeSingle()
  if (error) {
    console.warn('[kanbanSync] pull falhou:', error.message)
    return { ok: false, error: error.message }
  }
  if (!data) return { ok: true, empty: true }
  const payload = parsePayload(data.payload, data.client_id ?? undefined, data.updated_at)
  if (!payload) return { ok: true, empty: true }
  return { ok: true, payload }
}

export async function pushKanbanSync(slice: KanbanSyncSlice): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const body: KanbanSyncPayload = {
    client_id: getClientId(),
    updated_at: new Date().toISOString(),
    slice,
  }
  const { error } = await supabase.from('kanban_sync').upsert(
    {
      id: SYNC_ROW_ID,
      payload: body,
      client_id: body.client_id,
      updated_at: body.updated_at,
    },
    { onConflict: 'id' },
  )
  if (error) {
    console.warn('[kanbanSync] push falhou:', error.message)
    return false
  }

  if (liveChannel) {
    try {
      await liveChannel.send({
        type: 'broadcast',
        event: BROADCAST_EVENT,
        payload: body,
      })
    } catch {
      /* broadcast opcional */
    }
  }
  return true
}

export function subscribeKanbanSync(
  onRemote: (payload: KanbanSyncPayload) => void,
  onRemoteEmpty?: () => void,
): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {}

  const myId = getClientId()
  const client = supabase

  /** Realtime/broadcast: ignora eco do próprio push. */
  const deliverLive = (payload: KanbanSyncPayload | null) => {
    if (!payload) return
    if (payload.client_id && payload.client_id === myId) return
    onRemote(payload)
  }

  liveChannel = client
    .channel(CHANNEL_NAME, {
      config: { broadcast: { self: false } },
    })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'kanban_sync', filter: `id=eq.${SYNC_ROW_ID}` },
      (row) => {
        const rec = row.new as {
          payload?: unknown
          client_id?: string
          updated_at?: string
        } | null
        deliverLive(parsePayload(rec?.payload, rec?.client_id, rec?.updated_at))
      },
    )
    .on('broadcast', { event: BROADCAST_EVENT }, ({ payload }) => {
      deliverLive(parsePayload(payload))
    })
    .subscribe()

  // Poll: sempre aplica (fingerprint no DataContext evita loop). Assim outra aba
  // com o mesmo client_id antigo ainda sincroniza o embarcador.
  const pollId = window.setInterval(() => {
    void pullKanbanSync().then((res) => {
      if (!res.ok) return
      if ('empty' in res && res.empty) {
        onRemoteEmpty?.()
        return
      }
      if ('payload' in res && res.payload) onRemote(res.payload)
    })
  }, 2500)

  return () => {
    window.clearInterval(pollId)
    if (liveChannel) {
      void client.removeChannel(liveChannel)
      liveChannel = null
    }
  }
}

export function isKanbanSyncReady(): boolean {
  return isSupabaseConfigured && Boolean(supabase)
}
