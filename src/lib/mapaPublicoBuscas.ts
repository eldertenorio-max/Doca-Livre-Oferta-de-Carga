import { ritmoPublicoOk } from './publicoProtecao'
import {
  consultarCreditosRotaPublico,
  consumirCreditoRotaPublicoConta,
  contaJaComprouCreditos,
  marcarContaComprouCreditos,
} from './rotaPublicoCreditos'

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

export type ProdutoBuscaPublica = 'frota' | 'logistica'

export type EstadoBuscasPublicas = {
  usadas: number
  restamGratis: number
  creditos: number
  restam: number
  esgotado: boolean
}

export const MAPA_PUBLICO_LIMITE_BUSCAS = LIMITE

function storageKey(produto: ProdutoBuscaPublica) {
  return produto === 'logistica' ? 'doca-mapa-log-buscas-v1' : 'doca-mapa-frota-buscas-v1'
}

function lerLocal(produto: ProdutoBuscaPublica = 'frota'): Registro {
  const hoje = diaBrasil()
  try {
    const raw = localStorage.getItem(storageKey(produto))
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

function gravarLocal(produto: ProdutoBuscaPublica, reg: Registro) {
  try {
    localStorage.setItem(storageKey(produto), JSON.stringify(reg))
  } catch {
    /* ignore */
  }
}

function estadoComCreditos(reg: Registro, creditos: number, comprou = false): EstadoBuscasPublicas {
  const usadas = Math.min(LIMITE, Math.max(0, reg.n))
  const pago = comprou || creditos > 0 || contaJaComprouCreditos()
  if (pago) marcarContaComprouCreditos()
  const restamGratis = pago ? 0 : Math.max(0, LIMITE - usadas)
  const restam = pago ? creditos : restamGratis + creditos
  return {
    usadas,
    restamGratis,
    creditos,
    restam,
    esgotado: restam <= 0,
  }
}

function estadoDeRegistro(reg: Registro): EstadoBuscasPublicas {
  return estadoComCreditos(reg, 0)
}

async function tentarConsumirCredito(): Promise<boolean> {
  if (await consumirCreditoRotaPublicoConta()) return true
  await new Promise((r) => window.setTimeout(r, 450))
  return consumirCreditoRotaPublicoConta()
}

async function estadoAtual(produto: ProdutoBuscaPublica): Promise<EstadoBuscasPublicas> {
  const saldo = await consultarCreditosRotaPublico()
  return estadoComCreditos(lerLocal(produto), saldo.creditos, saldo.comprou)
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

export function estadoBuscasPublicas(produto: ProdutoBuscaPublica = 'frota'): EstadoBuscasPublicas {
  return estadoDeRegistro(lerLocal(produto))
}

export async function consultarEstadoBuscasPublicas(
  produto: ProdutoBuscaPublica = 'frota',
): Promise<EstadoBuscasPublicas> {
  return estadoAtual(produto)
}

/** Consome 1 busca: 2 grátis do mapa, depois 1 crédito da mesma conta da calculadora. */
export async function registrarBuscaPublica(
  produto: ProdutoBuscaPublica = 'frota',
): Promise<EstadoBuscasPublicas & { ok: boolean; motivo?: 'ritmo' | 'saldo' }> {
  if (!ritmoPublicoOk()) {
    return { ok: false, motivo: 'ritmo', ...(await estadoAtual(produto)) }
  }
  const saldo = await consultarCreditosRotaPublico()
  if (saldo.comprou || saldo.creditos > 0) {
    marcarContaComprouCreditos()
    if (await tentarConsumirCredito()) {
      return { ok: true, ...(await estadoAtual(produto)) }
    }
    const estado = await estadoAtual(produto)
    return { ok: false, motivo: estado.creditos > 0 ? 'ritmo' : 'saldo', ...estado }
  }
  const local = lerLocal(produto)
  if (local.n < LIMITE) {
    const n = local.n + 1
    gravarLocal(produto, { n, dia: diaBrasil() })
    return { ok: true, ...(await estadoAtual(produto)) }
  }
  if (await tentarConsumirCredito()) {
    return { ok: true, ...(await estadoAtual(produto)) }
  }
  const estado = await estadoAtual(produto)
  return { ok: false, motivo: estado.creditos > 0 ? 'ritmo' : 'saldo', ...estado }
}
