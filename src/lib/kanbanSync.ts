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
}

export type KanbanSyncPayload = {
  client_id: string
  updated_at: string
  slice: KanbanSyncSlice
}

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
  }
}

export function sliceFingerprint(slice: KanbanSyncSlice): string {
  return JSON.stringify(slice)
}

export function applySyncSlice<T extends KanbanSyncSlice>(prev: T, slice: KanbanSyncSlice): T {
  const merged = {
    ...prev,
    cargas: slice.cargas ?? prev.cargas,
    lances: slice.lances ?? prev.lances,
    grupos: slice.grupos ?? prev.grupos,
    transportadores: slice.transportadores ?? prev.transportadores,
    notificacoes: slice.notificacoes ?? prev.notificacoes,
    mensagens: slice.mensagens ?? prev.mensagens,
    historico: slice.historico ?? prev.historico,
    historicoPropostas: slice.historicoPropostas ?? prev.historicoPropostas,
    chatLeituras: slice.chatLeituras ?? prev.chatLeituras,
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

export async function pullKanbanSync(): Promise<KanbanSyncPayload | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('kanban_sync')
    .select('payload, updated_at, client_id')
    .eq('id', SYNC_ROW_ID)
    .maybeSingle()
  if (error) {
    console.warn('[kanbanSync] pull falhou:', error.message)
    return null
  }
  if (!data) return null
  return parsePayload(data.payload, data.client_id ?? undefined, data.updated_at)
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

  // Fallback: polling a cada 2s (cobre Realtime/SQL ainda não configurados)
  const pollId = window.setInterval(() => {
    void pullKanbanSync().then(deliver)
  }, 2000)

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
