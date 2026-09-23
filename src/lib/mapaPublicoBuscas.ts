import { ritmoPublicoOk } from './publicoProtecao'

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

function sinalCanvas(): string {
  try {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    if (!ctx) return ''
    ctx.textBaseline = 'alphabetic'
    ctx.font = '14px Arial'
    ctx.fillStyle = '#f60'
    ctx.fillRect(0, 0, 80, 20)
    ctx.fillStyle = '#069'
    ctx.fillText('doca-maquina', 2, 14)
    return c.toDataURL().slice(-48)
  } catch {
    return ''
  }
}

function sinalGpu(): string {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl')
    if (!gl || !('getParameter' in gl)) return ''
    const ext = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info')
    const renderer = ext
      ? String((gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL) || '')
      : ''
    return renderer.slice(0, 80)
  } catch {
    return ''
  }
}

export async function deviceHashPublico(): Promise<string> {
  const nav = typeof navigator === 'undefined' ? null : navigator
  const scr = typeof screen === 'undefined' ? null : screen
  const tz =
    typeof Intl === 'undefined'
      ? ''
      : Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  const navMem = nav as (Navigator & { deviceMemory?: number }) | null
  const raw = [
    nav?.language || '',
    tz,
    scr ? `${scr.width}x${scr.height}x${scr.colorDepth}x${scr.availWidth}` : '',
    String(nav?.hardwareConcurrency || ''),
    String(navMem?.deviceMemory || ''),
    String(nav?.maxTouchPoints || ''),
    String(typeof window === 'undefined' ? '' : window.devicePixelRatio || ''),
    nav?.platform || '',
    (nav?.userAgent || '').slice(0, 140),
    sinalGpu(),
    sinalCanvas(),
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

export async function consultarEstadoBuscasPublicas(): Promise<EstadoBuscasPublicas> {
  return estadoBuscasPublicas()
}

/** Consome 1 busca (cota no aparelho). */
export async function registrarBuscaPublica(): Promise<EstadoBuscasPublicas & { ok: boolean }> {
  if (!ritmoPublicoOk()) {
    return { ok: false, usadas: LIMITE, restam: 0, esgotado: true }
  }
  const local = lerLocal()
  if (local.n >= LIMITE) return { ok: false, usadas: LIMITE, restam: 0, esgotado: true }
  const n = local.n + 1
  gravarLocal({ n, dia: diaBrasil() })
  return { ok: true, usadas: n, restam: Math.max(0, LIMITE - n), esgotado: n >= LIMITE }
}
