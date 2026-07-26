/**
 * Web Push no cliente — permissão, subscribe e envio via Edge Function.
 */

import { isSupabaseConfigured, supabase } from './supabase'

/** Chave pública VAPID (pode sobrescrever com VITE_VAPID_PUBLIC_KEY). */
export const VAPID_PUBLIC_KEY =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() ||
  'BFKZYtfv2pBOtsLnRcg0u2bcmNAxY9f86jsnU_XEKNEv11GlShJNPaR8ysWrsjw8Z8svjn2TsWTwEhmbjCY9qvA'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSuportado(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export async function garantirPermissaoNotificacao(): Promise<NotificationPermission> {
  if (!pushSuportado()) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.requestPermission()
}

export async function registrarPushSubscription(input: {
  transportadorId?: string | null
  userId?: string | null
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!pushSuportado()) return { ok: false, erro: 'Push não suportado neste dispositivo.' }
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, erro: 'Supabase não configurado.' }
  }

  const perm = await garantirPermissaoNotificacao()
  if (perm !== 'granted') {
    return { ok: false, erro: 'Permissão de notificação negada.' }
  }

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })
  }

  const json = sub.toJSON()
  const endpoint = json.endpoint
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return { ok: false, erro: 'Assinatura push incompleta.' }
  }

  const row = {
    endpoint,
    p256dh,
    auth,
    transportador_id: input.transportadorId || null,
    user_id: input.userId || null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 240) : null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('push_subscriptions').upsert(row, {
    onConflict: 'endpoint',
  })
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

/**
 * Envia push aos aparelhos dos transportadores.
 * Retorna quantos dispositivos receberam (útil para feedback na publicação).
 */
export async function enviarPushCarga(input: {
  transportadorIds: string[]
  titulo: string
  mensagem: string
  cargaId?: string
  url?: string
}): Promise<{ ok: boolean; enviados?: number; total?: number; erro?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, erro: 'Supabase não configurado.' }
  }
  const ids = [...new Set(input.transportadorIds.filter(Boolean))]
  if (ids.length === 0) return { ok: true, enviados: 0 }

  try {
    const { data, error } = await supabase.functions.invoke('web-push', {
      body: {
        action: 'notify_carga',
        transportador_ids: ids,
        titulo: input.titulo,
        mensagem: input.mensagem,
        carga_id: input.cargaId,
        url: input.url || '/#/transportador',
        tag: input.cargaId ? `carga-${input.cargaId}` : 'nova-carga',
      },
    })
    if (error) {
      console.warn('[web-push] invoke falhou:', error.message)
      return { ok: false, erro: error.message }
    }
    const payload = (data ?? {}) as {
      ok?: boolean
      enviados?: number
      erro?: string
      mensagem?: string
    }
    if (payload.ok === false) {
      console.warn('[web-push] edge erro:', payload.erro)
      return { ok: false, erro: payload.erro || 'Falha no push.' }
    }
    const enviados = payload.enviados ?? 0
    if (enviados === 0) {
      console.warn(
        '[web-push] 0 enviados — transportadores precisam ativar alertas no celular (PWA).',
        payload.mensagem || '',
      )
    }
    return {
      ok: true,
      enviados,
      total: typeof (payload as { total?: number }).total === 'number'
        ? (payload as { total: number }).total
        : undefined,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao chamar web-push.'
    console.warn('[web-push]', msg)
    return { ok: false, erro: msg }
  }
}

/** Texto curto para a barra de notificações do celular. */
export function textoPushNovaCarga(carga: {
  numero?: string | null
  origem?: string | null
  destino?: string | null
  frete_oferta?: number | null
  frete_tabela?: number | null
}): string {
  const num = (carga.numero || '').trim() || '—'
  const origem = (carga.origem || '').trim()
  const destino = (carga.destino || '').trim()
  const rota =
    origem && destino
      ? `${origem} → ${destino}`
      : origem || destino || ''
  const frete = carga.frete_oferta ?? carga.frete_tabela
  const freteTxt =
    frete != null && Number.isFinite(frete)
      ? ` · R$ ${frete.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : ''
  return `Carga ${num}${rota ? ` · ${rota}` : ''}${freteTxt}`
}

/** Notificação local imediata (app aberto / mesmo aparelho) — complementa o push remoto. */
export async function notificarLocalNativa(input: {
  titulo: string
  mensagem: string
  url?: string
  tag?: string
}): Promise<void> {
  if (!pushSuportado()) return
  if (Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(input.titulo, {
      body: input.mensagem,
      icon: '/icon-192.png?v=oferta6',
      badge: '/badge-96.png?v=oferta6',
      tag: input.tag || 'doca-livre-local',
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: [300, 120, 300, 120, 500],
      data: { url: input.url || '/#/transportador' },
    })
  } catch {
    /* ignore */
  }
}
