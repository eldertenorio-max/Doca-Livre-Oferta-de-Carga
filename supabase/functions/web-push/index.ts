/**
 * Web Push — envia notificação nativa (barra do celular + som do sistema).
 *
 * Deploy:
 *   supabase functions deploy web-push --project-ref <ref>
 *
 * Secrets (Dashboard → Edge Functions → Secrets):
 *   VAPID_PUBLIC_KEY=...
 *   VAPID_PRIVATE_KEY=...
 *   VAPID_SUBJECT=mailto:diego@docalivre.com
 *
 * Automáticos: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

function admin() {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(url, key)
}

function setupVapid() {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')?.trim()
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')?.trim()
  const subject = Deno.env.get('VAPID_SUBJECT')?.trim() || 'mailto:diego@docalivre.com'
  if (!publicKey || !privateKey) {
    return { ok: false as const, erro: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY não configurados.' }
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return { ok: true as const }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, erro: 'Método não permitido.' }, 405)

  try {
    const body = (await req.json()) as {
      action?: string
      transportador_ids?: string[]
      titulo?: string
      mensagem?: string
      url?: string
      carga_id?: string
      tag?: string
    }

    const action = (body.action || 'notify').trim()
    if (action !== 'notify' && action !== 'notify_carga') {
      return json({ ok: false, erro: 'Ação inválida.' }, 400)
    }

    const vapid = setupVapid()
    if (!vapid.ok) return json({ ok: false, erro: vapid.erro }, 500)

    const titulo = (body.titulo || 'Doca Livre').trim()
    const mensagem = (body.mensagem || 'Nova notificação').trim()
    const url = (body.url || '/#/transportador').trim()
    const tag = (body.tag || body.carga_id || 'doca-livre').trim()
    const tids = Array.isArray(body.transportador_ids)
      ? body.transportador_ids.map((x) => String(x)).filter(Boolean)
      : []

    if (tids.length === 0) {
      return json({ ok: false, erro: 'Informe transportador_ids.' }, 400)
    }

    const sb = admin()
    const { data: rows, error } = await sb
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, transportador_id')
      .in('transportador_id', tids)

    if (error) return json({ ok: false, erro: error.message }, 500)
    const list = rows ?? []
    if (list.length === 0) {
      return json({ ok: true, enviados: 0, mensagem: 'Nenhuma assinatura push para esses transportadores.' })
    }

    const payload = JSON.stringify({
      title: titulo,
      body: mensagem,
      icon: 'https://ofertadecargas.docalivre.com.br/icon-192.png?v=oferta6',
      badge: 'https://ofertadecargas.docalivre.com.br/badge-96.png?v=oferta6',
      tag,
      renotify: true,
      requireInteraction: true,
      vibrate: [300, 120, 300, 120, 500],
      data: { url, carga_id: body.carga_id ?? null },
    })

    let enviados = 0
    const falhas: string[] = []
    const removerIds: string[] = []

    await Promise.all(
      list.map(async (row) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: row.endpoint,
              keys: { p256dh: row.p256dh, auth: row.auth },
            },
            payload,
            { TTL: 60 * 60, urgency: 'high' },
          )
          enviados += 1
        } catch (e) {
          const statusCode = (e as { statusCode?: number })?.statusCode
          const msg = e instanceof Error ? e.message : String(e)
          falhas.push(`${row.transportador_id}: ${msg}`)
          // 404/410 = assinatura expirada
          if (statusCode === 404 || statusCode === 410) removerIds.push(row.id)
        }
      }),
    )

    if (removerIds.length > 0) {
      await sb.from('push_subscriptions').delete().in('id', removerIds)
    }

    return json({
      ok: true,
      enviados,
      total: list.length,
      removidos: removerIds.length,
      falhas: falhas.slice(0, 10),
    })
  } catch (e) {
    return json(
      { ok: false, erro: e instanceof Error ? e.message : 'Falha no web-push.' },
      500,
    )
  }
})
