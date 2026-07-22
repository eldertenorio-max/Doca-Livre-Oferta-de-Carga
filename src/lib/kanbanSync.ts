import type { RealtimeChannel } from '@supabase/supabase-js'
import type {
  Carga,
  ChatMensagem,
  GrupoTransportador,
  HistoricoEvento,
  HistoricoProposta,
  Lance,
  NotificacaoInApp,
  Transportador,
} from '../types'
import { alinharStatusComLances } from './kanbanColumns'
import { isSupabaseConfigured, supabase } from './supabase'

const SYNC_ROW_ID = 'main'
const CLIENT_KEY = 'doca-livre-sync-client-id'
const CHANNEL_NAME = 'kanban-sync-live'
const BROADCAST_EVENT = 'kanban-update'

export type KanbanSyncSlice = {
  cargas: Carga[]
  lances: Lance[]
  grupos: GrupoTransportador[]
  transportadores: Transportador[]
  notificacoes: NotificacaoInApp[]
  mensagens: ChatMensagem[]
  historico: HistoricoEvento[]
  historicoPropostas: HistoricoProposta[]
  chatLeituras: Record<string, string>
  /** IDs removidos (rascunhos excluídos) — impede o merge de “ressuscitar” a carga */
  cargas_excluidas?: string[]
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

export function getClientId(): string {
  try {
    let id = sessionStorage.getItem(CLIENT_KEY)
    if (!id) {
      id = `cli-${Math.random().toString(36).slice(2, 12)}`
      sessionStorage.setItem(CLIENT_KEY, id)
    }
    return id
  } catch {
    return `cli-${Math.random().toString(36).slice(2, 12)}`
  }
}

export function pickSyncSlice(state: KanbanSyncSlice): KanbanSyncSlice {
  return {
    cargas: state.cargas,
    lances: state.lances,
    grupos: state.grupos,
    transportadores: state.transportadores,
    notificacoes: state.notificacoes,
    mensagens: state.mensagens,
    historico: state.historico,
    historicoPropostas: state.historicoPropostas,
    chatLeituras: state.chatLeituras ?? {},
    cargas_excluidas: state.cargas_excluidas ?? [],
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

/** Mescla remoto sem apagar publicações locais mais novas. */
export function applySyncSlice<T extends KanbanSyncSlice>(prev: T, slice: KanbanSyncSlice): T {
  const remoteCargas = Array.isArray(slice.cargas) ? slice.cargas : []
  const remoteLances = Array.isArray(slice.lances) ? slice.lances : []
  const cargasExcluidas = Array.from(
    new Set([...(prev.cargas_excluidas ?? []), ...(slice.cargas_excluidas ?? [])]),
  ).slice(-500)
  const excluidas = new Set(cargasExcluidas)

  // Remoto vazio NÃO apaga cargas locais publicadas/rascunhos
  const cargasMerged =
    remoteCargas.length === 0 && prev.cargas.length > 0
      ? prev.cargas
      : mergeById(prev.cargas, remoteCargas)
  const cargas = cargasMerged.filter((c) => !excluidas.has(c.id))

  const lancesMerged =
    remoteLances.length === 0 && prev.lances.length > 0 && remoteCargas.length === 0
      ? prev.lances
      : mergeById(prev.lances, remoteLances)
  const lances = lancesMerged.filter((l) => !excluidas.has(l.carga_id))

  const merged = {
    ...prev,
    cargas,
    lances,
    cargas_excluidas: cargasExcluidas,
    grupos: slice.grupos?.length ? mergeById(prev.grupos, slice.grupos) : prev.grupos,
    transportadores: slice.transportadores?.length
      ? mergeById(prev.transportadores, slice.transportadores)
      : prev.transportadores,
    notificacoes: mergeById(prev.notificacoes ?? [], slice.notificacoes ?? []).filter(
      (n) => !n.carga_id || !excluidas.has(n.carga_id),
    ),
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

  // Garante demos t1/t2 nos grupos ativos após sync
  const DEMO_TIDS = ['t1', 't2']
  const grupos = merged.grupos.map((g) => {
    if (g.situacao === 'inativo') return g
    const ids = g.transportador_ids ?? []
    const missing = DEMO_TIDS.filter((id) => !ids.includes(id))
    if (missing.length === 0) return g
    return { ...g, transportador_ids: [...ids, ...missing] }
  })

  return {
    ...merged,
    grupos,
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
): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {}

  const myId = getClientId()
  const client = supabase

  const deliver = (payload: KanbanSyncPayload | null) => {
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
        deliver(parsePayload(rec?.payload, rec?.client_id, rec?.updated_at))
      },
    )
    .on('broadcast', { event: BROADCAST_EVENT }, ({ payload }) => {
      deliver(parsePayload(payload))
    })
    .subscribe()

  const pollId = window.setInterval(() => {
    void pullKanbanSync().then((res) => {
      if (res.ok && 'payload' in res && res.payload) deliver(res.payload)
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
