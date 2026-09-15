import { ritmoPublicoOk } from './publicoProtecao'
import { isLocalDev } from './siteOfertaDeCarga'
import { creditosRotaPublico, consumirCreditoRotaPublico } from './rotaPublicoCreditos'

const STORAGE_KEY = 'doca-rota-publico-calculos-v1'
const LIMITE = 2
const ILIMITADO = {
  usadas: 0,
  restamGratis: LIMITE,
  creditos: 0,
  restam: LIMITE,
  esgotado: false,
} as const

/** Caminho do laboratório (não aparece no site público). */
export const ROTA_LAB_PATH = '/diego-lab'
/** Query do laboratório: ?lab=diego */
export const ROTA_LAB_QUERY = 'diego'

function urlLabAtiva(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const { pathname, search, hash } = window.location
    const hashPath = (hash.replace(/^#/, '').split('?')[0] || '').toLowerCase()
    const path = `${pathname}${hashPath}`.toLowerCase()
    if (path.includes(ROTA_LAB_PATH)) return true
    const hashQ = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
    const q = new URLSearchParams(`${search.replace(/^\?/, '')}&${hashQ}`)
    return q.get('lab') === ROTA_LAB_QUERY
  } catch {
    return false
  }
}

/** Só no link de laboratório (ou localhost). O site normal continua com cota. */
export function isRotaPublicoIlimitado(): boolean {
  if (isLocalDev()) return true
  return urlLabAtiva()
}

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

export const ROTA_PUBLICO_LIMITE_CALCULOS = LIMITE

function lerLocal(): Registro {
  const hoje = diaBrasil()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { n: 0, dia: hoje }
    const parsed = JSON.parse(raw) as Partial<Registro>
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

export type EstadoCalculosPublicos = {
  usadas: number
  restamGratis: number
  creditos: number
  restam: number
  esgotado: boolean
}

function estadoDeRegistro(reg: Registro): EstadoCalculosPublicos {
  const usadas = Math.min(LIMITE, Math.max(0, reg.n))
  const restamGratis = Math.max(0, LIMITE - usadas)
  const creditos = creditosRotaPublico()
  const restam = restamGratis + creditos
  return { usadas, restamGratis, creditos, restam, esgotado: restam <= 0 }
}

export function estadoCalculosPublicos(): EstadoCalculosPublicos {
  if (isRotaPublicoIlimitado()) return { ...ILIMITADO }
  return estadoDeRegistro(lerLocal())
}

export async function consultarEstadoCalculosPublicos(): Promise<EstadoCalculosPublicos> {
  return estadoCalculosPublicos()
}

/** Consome 1 cálculo: primeiro as 2 grátis do dia, depois créditos PIX. */
export async function registrarCalculoPublico(): Promise<EstadoCalculosPublicos & { ok: boolean }> {
  if (isRotaPublicoIlimitado()) return { ok: true, ...ILIMITADO }
  if (!ritmoPublicoOk()) {
    return { ok: false, ...estadoDeRegistro(lerLocal()) }
  }
  const local = lerLocal()
  if (local.n < LIMITE) {
    const n = local.n + 1
    gravarLocal({ n, dia: diaBrasil() })
    return { ok: true, ...estadoDeRegistro({ n, dia: diaBrasil() }) }
  }
  if (consumirCreditoRotaPublico()) {
    return { ok: true, ...estadoDeRegistro(local) }
  }
  return { ok: false, ...estadoDeRegistro(local) }
}
