import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

/**
 * Envia broadcast só pelo WebSocket se o canal estiver joined.
 * Evita o fallback REST deprecado de send() (aviso + 422 no bfcache).
 * Payload grande: não tenta REST — postgres_changes/poll cobrem o sync.
 */
export async function broadcastNoCanal(
  channel: RealtimeChannel | null | undefined,
  event: string,
  payload: unknown,
  opts?: { maxBytes?: number },
): Promise<boolean> {
  if (!channel) return false
  const maxBytes = opts?.maxBytes ?? 12_000
  let bytes = 0
  try {
    bytes = JSON.stringify(payload).length
  } catch {
    return false
  }
  if (bytes > maxBytes) return false

  if (channel.state === 'joined') {
    try {
      const res = await channel.send({
        type: 'broadcast',
        event,
        payload,
      })
      return res === 'ok'
    } catch {
      return false
    }
  }

  // Canal fora do ar (bfcache / desconectado): HTTP explícito, payload pequeno
  const httpSend = (
    channel as RealtimeChannel & {
      httpSend?: (
        event: string,
        payload: unknown,
      ) => Promise<{ success: true } | { success: false; status: number; error: string }>
    }
  ).httpSend
  if (typeof httpSend !== 'function') return false
  try {
    const res = await httpSend.call(channel, event, payload)
    return Boolean(res && 'success' in res && res.success)
  } catch {
    return false
  }
}

/** Reconecta o socket após restauração do Back-Forward Cache. */
export function instalarRealtimeBfcache(client: SupabaseClient | null | undefined) {
  if (typeof window === 'undefined' || !client) return () => {}

  const onPageShow = (ev: PageTransitionEvent) => {
    if (!ev.persisted) return
    try {
      const rt = client.realtime
      if (!rt.isConnected()) rt.connect()
      for (const ch of client.getChannels()) {
        if (ch.state !== 'joined' && ch.state !== 'joining') {
          try {
            ch.subscribe()
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  const onPageHide = () => {
    try {
      if (client.realtime.isConnected()) {
        void client.realtime.disconnect(1000, 'pagehide')
      }
    } catch {
      /* ignore */
    }
  }

  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('pagehide', onPageHide)
  return () => {
    window.removeEventListener('pageshow', onPageShow)
    window.removeEventListener('pagehide', onPageHide)
  }
}
