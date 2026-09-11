import { type EstadoBuscasPublicas } from './mapaPublicoBuscas'
import { ritmoPublicoOk } from './publicoProtecao'

const STORAGE_KEY = 'doca-rota-publico-calculos-v1'
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
  return estadoDeRegistro(lerLocal())
}

export async function consultarEstadoCalculosPublicos(): Promise<EstadoBuscasPublicas> {
  return estadoCalculosPublicos()
}

/** Consome 1 cálculo (cota no aparelho). */
export async function registrarCalculoPublico(): Promise<EstadoBuscasPublicas & { ok: boolean }> {
  if (!ritmoPublicoOk()) {
    return { ok: false, usadas: LIMITE, restam: 0, esgotado: true }
  }
  const local = lerLocal()
  if (local.n >= LIMITE) return { ok: false, usadas: LIMITE, restam: 0, esgotado: true }
  const n = local.n + 1
  gravarLocal({ n, dia: diaBrasil() })
  return { ok: true, usadas: n, restam: Math.max(0, LIMITE - n), esgotado: n >= LIMITE }
}
