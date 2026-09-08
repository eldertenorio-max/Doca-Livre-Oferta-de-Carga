import { isSupabaseConfigured, supabase } from './supabase'

const STORAGE_KEY = 'doca-mapa-publico-buscas-v2'
const VISITOR_KEY = 'doca-mapa-publico-vid'
/** Duas buscas grátis por dia civil (Brasília). */
const LIMITE = 2

type Registro = {
  n: number
  dia: string
}

function diaBrasil(ms = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

export type EstadoBuscasPublicas = {
  usadas: number
  restam: number
  esgotado: boolean
}

export const MAPA_PUBLICO_LIMITE_BUSCAS = LIMITE

function lerLocal(): Registro {
  const hoje = diaBrasil()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { n: 0, dia: hoje }
    const parsed = JSON.parse(raw) as Partial<Registro> & { inicio?: number }
    if (!parsed || typeof parsed.n !== 'number') return { n: 0, dia: hoje }
    const dia = typeof parsed.dia === 'string' ? parsed.dia : hoje
    if (dia !== hoje) return { n: 0, dia: hoje }
    return { n: parsed.n, dia }
  } catch {
    return { n: 0, dia: hoje }
  }
}

function gravarLocal(reg: Registro) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reg))
  } catch {
    /* ignore */
  }
}

function estadoDeRegistro(reg: Registro): EstadoBuscasPublicas {
  const usadas = Math.min(LIMITE, Math.max(0, reg.n))
  const restam = Math.max(0, LIMITE - usadas)
  return { usadas, restam, esgotado: restam <= 0 }
}

function cookieGet(nome: string): string {
  if (typeof document === 'undefined') return ''
  const m = document.cookie.match(new RegExp(`(?:^|; )${nome}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : ''
}

function cookieSet(nome: string, valor: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${nome}=${encodeURIComponent(valor)}; max-age=${60 * 60 * 24 * 30}; path=/; SameSite=Lax`
}

export function visitorIdPublico(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY) || cookieGet(VISITOR_KEY)
    if (!id) id = crypto.randomUUID().replace(/-/g, '')
    localStorage.setItem(VISITOR_KEY, id)
    cookieSet(VISITOR_KEY, id)
    return id
  } catch {
    return cookieGet(VISITOR_KEY) || 'anon'
  }
}

export async function deviceHashPublico(): Promise<string> {
  const nav = typeof navigator === 'undefined' ? null : navigator
  const scr = typeof screen === 'undefined' ? null : screen
  const tz =
    typeof Intl === 'undefined'
      ? ''
      : Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  const raw = [
    nav?.language || '',
    tz,
    scr ? `${scr.width}x${scr.height}x${scr.colorDepth}` : '',
    String(nav?.hardwareConcurrency || ''),
    nav?.platform || '',
    (nav?.userAgent || '').slice(0, 140),
  ].join('|')
  try {
    const data = new TextEncoder().encode(`doca-dev:${raw}`)
    const hash = await crypto.subtle.digest('SHA-256', data)
    return [...new Uint8Array(hash)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 40)
  } catch {
    return `dev${raw.length}`
  }
}

export function estadoBuscasPublicas(): EstadoBuscasPublicas {
  return estadoDeRegistro(lerLocal())
}

function aplicarResposta(res: EstadoBuscasPublicas & { ok?: boolean }): EstadoBuscasPublicas {
  const usadas = Math.min(LIMITE, Math.max(0, Number(res.usadas) || 0))
  const restamNum = Number(res.restam)
  const restam = Number.isFinite(restamNum)
    ? Math.max(0, Math.min(LIMITE, restamNum))
    : Math.max(0, LIMITE - usadas)
  const esgotado = restam <= 0 || Boolean(res.esgotado)
  const local = lerLocal()
  const hoje = diaBrasil()
  gravarLocal({
    n: local.dia === hoje ? Math.max(local.n, usadas, esgotado ? LIMITE : usadas) : usadas,
    dia: hoje,
  })
  return { usadas: esgotado ? LIMITE : usadas, restam: esgotado ? 0 : restam, esgotado }
}

async function chamarServidor(
  action: 'status' | 'consume',
): Promise<(EstadoBuscasPublicas & { ok: boolean }) | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const payload = {
    p_visitor: visitorIdPublico(),
    p_device: await deviceHashPublico(),
    p_consumir: action === 'consume',
  }
  try {
    const { data, error } = await supabase.rpc('mapa_publico_cota_cliente', payload)
    const parsed = lerRespostaCota(data)
    if (!error && parsed) return parsed
  } catch {
    /* tenta a Edge Function */
  }
  try {
    const { data, error } = await supabase.functions.invoke('mapa-publico-busca', {
      body: {
        action,
        visitor_id: payload.p_visitor,
        device_hash: payload.p_device,
      },
    })
    if (error) return null
    return lerRespostaCota(data)
  } catch {
    return null
  }
}

function lerRespostaCota(data: unknown): (EstadoBuscasPublicas & { ok: boolean }) | null {
  if (!data || typeof data !== 'object') return null
  const row = data as {
    ok?: boolean
    usadas?: number
    restam?: number
    esgotado?: boolean
  }
  if (typeof row.restam !== 'number' && typeof row.usadas !== 'number') return null
  const restam = Number(row.restam)
  const usadas = Number(row.usadas) || 0
  return {
    ok: row.ok !== false,
    usadas,
    restam: Number.isFinite(restam) ? restam : Math.max(0, LIMITE - usadas),
    esgotado: Boolean(row.esgotado) || (Number.isFinite(restam) && restam <= 0),
  }
}

export async function consultarEstadoBuscasPublicas(): Promise<EstadoBuscasPublicas> {
  const remoto = await chamarServidor('status')
  if (remoto) return aplicarResposta(remoto)
  return estadoBuscasPublicas()
}

/** Consome 1 busca no servidor (IP + aparelho). localStorage só reforça no mesmo perfil. */
export async function registrarBuscaPublica(): Promise<EstadoBuscasPublicas & { ok: boolean }> {
  const remoto = await chamarServidor('consume')
  if (remoto) {
    const estado = aplicarResposta(remoto)
    return { ...estado, ok: Boolean(remoto.ok) }
  }

  const local = lerLocal()
  if (local.n >= LIMITE) return { ok: false, usadas: LIMITE, restam: 0, esgotado: true }
  const n = local.n + 1
  gravarLocal({ n, dia: diaBrasil() })
  return { ok: true, usadas: n, restam: Math.max(0, LIMITE - n), esgotado: n >= LIMITE }
}
