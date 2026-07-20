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
import { isSupabaseConfigured, supabase } from './supabase'

const SYNC_ROW_ID = 'main'
const CLIENT_KEY = 'doca-livre-sync-client-id'

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
  return {
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
}

export async function pullKanbanSync(): Promise<KanbanSyncPayload | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('kanban_sync')
    .select('payload, updated_at, client_id')
    .eq('id', SYNC_ROW_ID)
    .maybeSingle()
  if (error || !data) return null
  const payload = data.payload as Partial<KanbanSyncPayload> | null
  if (!payload?.slice) return null
  return {
    client_id: payload.client_id ?? data.client_id ?? '',
    updated_at: payload.updated_at ?? data.updated_at ?? new Date().toISOString(),
    slice: payload.slice,
  }
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
  return !error
}

export function subscribeKanbanSync(
  onRemote: (payload: KanbanSyncPayload) => void,
): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {}

  const myId = getClientId()
  const channel = supabase
    .channel('kanban-sync-live')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'kanban_sync', filter: `id=eq.${SYNC_ROW_ID}` },
      (row) => {
        const rec = row.new as {
          payload?: Partial<KanbanSyncPayload>
          client_id?: string
          updated_at?: string
        } | null
        if (!rec?.payload?.slice) return
        const payload: KanbanSyncPayload = {
          client_id: rec.payload.client_id ?? rec.client_id ?? '',
          updated_at: rec.payload.updated_at ?? rec.updated_at ?? new Date().toISOString(),
          slice: rec.payload.slice,
        }
        if (payload.client_id && payload.client_id === myId) return
        onRemote(payload)
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
