import { type EstadoBuscasPublicas } from './mapaPublicoBuscas'
import { ritmoPublicoOk } from './publicoProtecao'
import { isLocalDev } from './siteOfertaDeCarga'

const STORAGE_KEY = 'doca-rota-publico-calculos-v1'
const TESTE_KEY = 'doca-publico-teste-ilimitado'
const LIMITE = 2
const ILIMITADO = { usadas: 0, restam: LIMITE, esgotado: false } as const

function ativarTestePelaUrl() {
  if (typeof window === 'undefined') return
  try {
    const hash = window.location.hash || ''
    const hashQ = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
    const q = new URLSearchParams(`${window.location.search.replace(/^\?/, '')}&${hashQ}`)
    if (q.get('teste') !== 'ilimitado') return
    localStorage.setItem(TESTE_KEY, '1')
    const nextSearch = new URLSearchParams(window.location.search)
    nextSearch.delete('teste')
    const search = nextSearch.toString()
    const nextHash = hash.includes('?')
      ? `${hash.slice(0, hash.indexOf('?'))}${(() => {
          const hq = new URLSearchParams(hashQ)
          hq.delete('teste')
          const s = hq.toString()
          return s ? `?${s}` : ''
        })()}`
      : hash
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}${nextHash}`,
    )
  } catch {
    /* ignore */
  }
}

/** Só neste aparelho: ?teste=ilimitado ou localhost. */
export function isRotaPublicoIlimitado(): boolean {
  ativarTestePelaUrl()
  if (isLocalDev()) return true
  try {
    return localStorage.getItem(TESTE_KEY) === '1'
  } catch {
    return false
  }
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

function estadoDeRegistro(reg: Registro): EstadoBuscasPublicas {
  const usadas = Math.min(LIMITE, Math.max(0, reg.n))
  const restam = Math.max(0, LIMITE - usadas)
  return { usadas, restam, esgotado: restam <= 0 }
}

export function estadoCalculosPublicos(): EstadoBuscasPublicas {
  if (isRotaPublicoIlimitado()) return { ...ILIMITADO }
  return estadoDeRegistro(lerLocal())
}

export async function consultarEstadoCalculosPublicos(): Promise<EstadoBuscasPublicas> {
  return estadoCalculosPublicos()
}

/** Consome 1 cálculo (cota no aparelho). */
export async function registrarCalculoPublico(): Promise<EstadoBuscasPublicas & { ok: boolean }> {
  if (isRotaPublicoIlimitado()) return { ok: true, ...ILIMITADO }
  if (!ritmoPublicoOk()) {
    return { ok: false, usadas: LIMITE, restam: 0, esgotado: true }
  }
  const local = lerLocal()
  if (local.n >= LIMITE) return { ok: false, usadas: LIMITE, restam: 0, esgotado: true }
  const n = local.n + 1
  gravarLocal({ n, dia: diaBrasil() })
  return { ok: true, usadas: n, restam: Math.max(0, LIMITE - n), esgotado: n >= LIMITE }
}
