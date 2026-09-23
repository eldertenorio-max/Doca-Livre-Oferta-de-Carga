import { ritmoPublicoOk } from './publicoProtecao'
import { isLocalDev } from './siteOfertaDeCarga'
import {
  creditosRotaPublico,
  consultarCreditosRotaPublico,
  consumirCreditoRotaPublicoConta,
  migrarCreditosLocaisParaConta,
  contaJaComprouCreditos,
  marcarContaComprouCreditos,
} from './rotaPublicoCreditos'
import { sessaoRotaPublico } from './rotaPublicoAuth'
import { supabase } from './supabase'
import { deviceHashPublico, visitorIdPublico } from './mapaPublicoBuscas'

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

type CotaMaquina = {
  usadas: number
  restam: number
  esgotado: boolean
  ok: boolean
}

function lerCotaMaquina(data: unknown): CotaMaquina | null {
  let row: { ok?: boolean; usadas?: number; restam?: number; esgotado?: boolean } | null = null
  if (typeof data === 'string') {
    try {
      row = JSON.parse(data) as typeof row
    } catch {
      row = null
    }
  } else if (data && typeof data === 'object') {
    row = data as typeof row
  }
  if (!row) return null
  const usadas = Number(row.usadas)
  const restam = Number(row.restam)
  if (!Number.isFinite(usadas) && !Number.isFinite(restam)) return null
  const u = Number.isFinite(usadas) ? Math.max(0, Math.floor(usadas)) : 0
  const r = Number.isFinite(restam) ? Math.max(0, Math.floor(restam)) : Math.max(0, LIMITE - u)
  return {
    usadas: Math.min(LIMITE, u),
    restam: r,
    esgotado: Boolean(row.esgotado) || r <= 0,
    ok: row.ok !== false,
  }
}

/** 2 grátis do computador (IP + aparelho). Aba anônima entra na mesma conta. */
async function cotaNoComputador(consumir: boolean): Promise<CotaMaquina | null> {
  if (!supabase) return null
  const visitor = visitorIdPublico()
  const device = await deviceHashPublico()
  const pelaFuncao = await invocarCotaRota(visitor, device, false)
  if (pelaFuncao) {
    if (!consumir) return pelaFuncao
    const gasto = (await invocarCotaRota(visitor, device, true)) || (await invocarCotaRota(visitor, device, true))
    if (gasto) return gasto
    return { ...pelaFuncao, ok: false }
  }
  try {
    const { data, error } = await supabase.rpc('rota_publico_cota_cliente', {
      p_visitor: visitor,
      p_device: device,
      p_consumir: consumir,
    })
    if (error) return null
    return lerCotaMaquina(data)
  } catch {
    return null
  }
}

async function invocarCotaRota(
  visitor: string,
  device: string,
  consumir: boolean,
): Promise<CotaMaquina | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.functions.invoke('mapa-publico-busca', {
      body: {
        action: consumir ? 'consume' : 'status',
        visitor_id: visitor,
        device_hash: device,
        produto: 'rota',
      },
    })
    if (error || !data || typeof data !== 'object') return null
    if ((data as { produto?: string }).produto !== 'rota') return null
    return lerCotaMaquina(data)
  } catch {
    return null
  }
}

function aplicarMaquina(local: Registro, maquina: CotaMaquina | null): Registro {
  if (!maquina) return local
  const n = Math.min(LIMITE, Math.max(local.n, maquina.usadas))
  const reg = { n, dia: diaBrasil() }
  if (n !== local.n) gravarLocal(reg)
  return reg
}

export type EstadoCalculosPublicos = {
  usadas: number
  restamGratis: number
  creditos: number
  restam: number
  esgotado: boolean
  presente?: number
  presenteIds?: string[]
}

async function tentarConsumirCredito(): Promise<boolean> {
  if (await consumirCreditoRotaPublicoConta()) return true
  await new Promise((r) => window.setTimeout(r, 450))
  return consumirCreditoRotaPublicoConta()
}

function estadoComCreditos(
  reg: Registro,
  creditos: number,
  extra?: { presente?: number; presenteIds?: string[]; comprou?: boolean },
): EstadoCalculosPublicos {
  const usadas = Math.min(LIMITE, Math.max(0, reg.n))
  const pago = Boolean(extra?.comprou) || creditos > 0 || contaJaComprouCreditos()
  if (pago) marcarContaComprouCreditos()
  const restamGratis = pago ? 0 : Math.max(0, LIMITE - usadas)
  const restam = pago ? creditos : restamGratis + creditos
  return {
    usadas,
    restamGratis,
    creditos,
    restam,
    esgotado: restam <= 0,
    presente: extra?.presente || 0,
    presenteIds: extra?.presenteIds || [],
  }
}

function estadoDeRegistro(reg: Registro): EstadoCalculosPublicos {
  return estadoComCreditos(reg, creditosRotaPublico())
}

async function estadoAtual(): Promise<EstadoCalculosPublicos> {
  if (await sessaoRotaPublico()) {
    await migrarCreditosLocaisParaConta()
  }
  const saldo = await consultarCreditosRotaPublico()
  if (isRotaPublicoIlimitado()) {
    return { ...ILIMITADO, presente: saldo.presente, presenteIds: saldo.presenteIds }
  }
  const maquina = await cotaNoComputador(false)
  return estadoComCreditos(aplicarMaquina(lerLocal(), maquina), saldo.creditos, {
    presente: saldo.presente,
    presenteIds: saldo.presenteIds,
    comprou: saldo.comprou,
  })
}

export function estadoCalculosPublicos(): EstadoCalculosPublicos {
  if (isRotaPublicoIlimitado()) return { ...ILIMITADO }
  return estadoDeRegistro(lerLocal())
}

export async function consultarEstadoCalculosPublicos(): Promise<EstadoCalculosPublicos> {
  return estadoAtual()
}

/** Consome 1 cálculo. Quem já comprou crédito não usa mais os 2 grátis do dia. */
export async function registrarCalculoPublico(): Promise<
  EstadoCalculosPublicos & { ok: boolean; motivo?: 'ritmo' | 'saldo' }
> {
  if (isRotaPublicoIlimitado()) return { ok: true, ...ILIMITADO }
  if (!ritmoPublicoOk()) {
    return { ok: false, motivo: 'ritmo', ...(await estadoAtual()) }
  }
  const saldo = await consultarCreditosRotaPublico()
  if (saldo.comprou || saldo.creditos > 0) {
    marcarContaComprouCreditos()
    if (await tentarConsumirCredito()) {
      return { ok: true, ...(await estadoAtual()) }
    }
    const estado = await estadoAtual()
    return { ok: false, motivo: estado.creditos > 0 ? 'ritmo' : 'saldo', ...estado }
  }
  const maquina = await cotaNoComputador(true)
  if (maquina) {
    aplicarMaquina(lerLocal(), maquina.ok ? maquina : { ...maquina, usadas: LIMITE, restam: 0, esgotado: true })
    if (!maquina.ok) {
      const estado = await estadoAtual()
      return { ok: false, motivo: 'saldo', ...estado }
    }
    return { ok: true, ...(await estadoAtual()) }
  }
  const local = lerLocal()
  if (local.n < LIMITE) {
    const n = local.n + 1
    gravarLocal({ n, dia: diaBrasil() })
    return { ok: true, ...(await estadoAtual()) }
  }
  if (await tentarConsumirCredito()) {
    return { ok: true, ...(await estadoAtual()) }
  }
  const estado = await estadoAtual()
  return { ok: false, motivo: estado.creditos > 0 ? 'ritmo' : 'saldo', ...estado }
}
