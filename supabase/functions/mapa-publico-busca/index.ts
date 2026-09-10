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

const ORIGENS_OK = new Set([
  'https://ofertadecarga.com.br',
  'https://www.ofertadecarga.com.br',
  'https://mapadafrota.com.br',
  'https://www.mapadafrota.com.br',
  'https://ofertadecargas.docalivre.com.br',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

const SCANNER_UA = [
  'sqlmap',
  'nikto',
  'nuclei',
  'wpscan',
  'masscan',
  'nmap',
  'zgrab',
  'dirbuster',
  'gobuster',
  'httpx',
  'acunetix',
  'nessus',
  'openvas',
]

const rajada = new Map<string, { n: number; t: number }>()

function corsDe(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  if (origin && ORIGENS_OK.has(origin)) {
    return { ...corsHeaders, 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
  }
  return { ...corsHeaders, 'Access-Control-Allow-Origin': 'https://ofertadecarga.com.br', Vary: 'Origin' }
}

function origemOk(req: Request): boolean {
  const origin = (req.headers.get('origin') || '').trim()
  if (origin) return ORIGENS_OK.has(origin)
  const ref = (req.headers.get('referer') || '').trim()
  if (!ref) return false
  try {
    return ORIGENS_OK.has(new URL(ref).origin)
  } catch {
    return false
  }
}

function uaScanner(req: Request): boolean {
  const ua = (req.headers.get('user-agent') || '').toLowerCase()
  return SCANNER_UA.some((s) => ua.includes(s))
}

function estouroIp(ip: string): boolean {
  const chave = ip || 'sem-ip'
  const agora = Date.now()
  const cur = rajada.get(chave)
  if (!cur || agora - cur.t > 60_000) {
    rajada.set(chave, { n: 1, t: agora })
    return false
  }
  cur.n += 1
  return cur.n > 40
}

const LIMITE = 2

function json(req: Request, obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsDe(req), 'content-type': 'application/json' },
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsDe(req) })
  if (req.method !== 'POST') return json(req, { ok: false, erro: 'Método não permitido.' }, 405)
  if (uaScanner(req) || !origemOk(req)) {
    return json(req, { ok: false, erro: 'Acesso bloqueado.' }, 403)
  }
  const ip = ipDoPedido(req)
  if (estouroIp(ip)) {
    return json(req, { ok: false, erro: 'Muitas tentativas. Aguarde um minuto.' }, 429)
  }

  let body: { action?: string; visitor_id?: string; device_hash?: string; produto?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }

  const action = body.action === 'consume' ? 'consume' : 'status'
  const visitor = limparToken(body.visitor_id)
  const device = limparToken(body.device_hash)
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
    return json(req, { ok: true, usadas: 0, restam: LIMITE, esgotado: false, limite: LIMITE })
  }

  const db = admin()
  const { data, error } = await db.rpc('mapa_publico_cota_aplicar', {
    p_chaves: chaves,
    p_consumir: action === 'consume',
    p_limite: LIMITE,
  })

  if (error) {
    return json(req, { ok: false, erro: error.message, restam: LIMITE, usadas: 0, esgotado: false }, 500)
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

  return json(req, {
    ok: allowed,
    usadas,
    restam: Number.isFinite(restam) ? restam : Math.max(0, LIMITE - usadas),
    esgotado,
    limite: LIMITE,
  })
})
