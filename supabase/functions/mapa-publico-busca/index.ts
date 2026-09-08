/**
 * Cota das 2 buscas grátis do mapa público.
 * Lê o IP no servidor (cabeçalho) e junta com visitante/aparelho —
 * o mesmo modelo de Qualp / Rotas Brasil: aba nova e anônima continuam na conta.
 *
 * Deploy:
 *   supabase functions deploy mapa-publico-busca --project-ref imnlbbfgaztfhwndfxwb
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const LIMITE = 2

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

function ipDoPedido(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')?.trim()
  if (cf) return cf
  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (fwd) return fwd
  return ''
}

function limparToken(raw: unknown, max = 80): string {
  const s = String(raw || '').trim()
  if (!s || s.length > max) return ''
  if (!/^[a-zA-Z0-9:_-]+$/.test(s)) return ''
  return s
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, erro: 'Método não permitido.' }, 405)

  let body: { action?: string; visitor_id?: string; device_hash?: string; produto?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }

  const action = body.action === 'consume' ? 'consume' : 'status'
  const visitor = limparToken(body.visitor_id)
  const device = limparToken(body.device_hash)
  const ip = ipDoPedido(req)
  const prefixo = body.produto === 'rota' ? 'rota:' : ''
  const salt = body.produto === 'rota' ? 'doca-rota-cota:' : 'doca-mapa-cota:'

  const chaves: string[] = []
  if (ip) {
    const data = new TextEncoder().encode(salt + ip)
    const hash = await crypto.subtle.digest('SHA-256', data)
    const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
    chaves.push(`${prefixo}ip:${hex.slice(0, 40)}`)
  }
  if (visitor) chaves.push(`${prefixo}vid:${visitor.slice(0, 80)}`)
  if (device) chaves.push(`${prefixo}dev:${device.slice(0, 80)}`)

  if (chaves.length === 0) {
    return json({ ok: true, usadas: 0, restam: LIMITE, esgotado: false, limite: LIMITE })
  }

  const db = admin()
  const { data, error } = await db.rpc('mapa_publico_cota_aplicar', {
    p_chaves: chaves,
    p_consumir: action === 'consume',
    p_limite: LIMITE,
  })

  if (error) {
    return json({ ok: false, erro: error.message, restam: LIMITE, usadas: 0, esgotado: false }, 500)
  }

  const row = (data ?? {}) as {
    ok?: boolean
    usadas?: number
    restam?: number
    esgotado?: boolean
  }
  const usadas = Number(row.usadas) || 0
  const restam = Number(row.restam)
  const esgotado = Boolean(row.esgotado) || (Number.isFinite(restam) && restam <= 0)
  const allowed = action !== 'consume' || row.ok !== false

  return json({
    ok: allowed,
    usadas,
    restam: Number.isFinite(restam) ? restam : Math.max(0, LIMITE - usadas),
    esgotado,
    limite: LIMITE,
  })
})
