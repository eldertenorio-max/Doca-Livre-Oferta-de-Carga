import { supabase } from './supabase'

const STORAGE_KEY = 'mapa-logistica-publico-buscas-v2'
const DEVICE_KEY = 'mapa-logistica-publico-device-v1'
const COOKIE_NAME = 'mapa_logistica_device'
const LIMITE = 2

type Registro = {
  n: number
  dia: string
}

export type EstadoBuscasPublicas = {
  usadas: number
  restam: number
  esgotado: boolean
}

export type ConsumoBuscaPublica = EstadoBuscasPublicas & {
  ok: boolean
}

export const MAPA_PUBLICO_LIMITE_BUSCAS = LIMITE

function diaSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

function uuidDispositivo(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* ignore */
  }
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

function lerCookie(nome: string): string | null {
  try {
    const partes = document.cookie.split(';')
    for (const parte of partes) {
      const [chave, ...resto] = parte.trim().split('=')
      if (chave === nome) return decodeURIComponent(resto.join('='))
    }
  } catch {
    /* ignore */
  }
  return null
}

function gravarCookie(nome: string, valor: string) {
  try {
    document.cookie = `${nome}=${encodeURIComponent(valor)}; Max-Age=31536000; Path=/; SameSite=Lax`
  } catch {
    /* ignore */
  }
}

function deviceId(): string {
  try {
    const salvo = localStorage.getItem(DEVICE_KEY)
    if (salvo && salvo.length >= 8) {
      gravarCookie(COOKIE_NAME, salvo)
      return salvo
    }
  } catch {
    /* ignore */
  }
  const cookie = lerCookie(COOKIE_NAME)
  if (cookie && cookie.length >= 8) {
    try {
      localStorage.setItem(DEVICE_KEY, cookie)
    } catch {
      /* ignore */
    }
    return cookie
  }
  const id = uuidDispositivo()
  try {
    localStorage.setItem(DEVICE_KEY, id)
  } catch {
    /* ignore */
  }
  gravarCookie(COOKIE_NAME, id)
  return id
}

function lerLocal(): Registro {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { n: 0, dia: diaSaoPaulo() }
    const parsed = JSON.parse(raw) as Registro
    if (!parsed || typeof parsed.n !== 'number' || typeof parsed.dia !== 'string') {
      return { n: 0, dia: diaSaoPaulo() }
    }
    if (parsed.dia !== diaSaoPaulo()) return { n: 0, dia: diaSaoPaulo() }
    return parsed
  } catch {
    return { n: 0, dia: diaSaoPaulo() }
  }
}

function gravarLocal(reg: Registro) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reg))
  } catch {
    /* ignore */
  }
}

function estadoDeNumeros(usadas: number): EstadoBuscasPublicas {
  const n = Math.min(LIMITE, Math.max(0, usadas))
  const restam = Math.max(0, LIMITE - n)
  return { usadas: n, restam, esgotado: restam <= 0 }
}

function rpcFaltando(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  return /PGRST202|PGRST205|schema cache|Could not find the function|Could not find the table/i.test(msg)
}

function lerJsonCota(data: unknown): Partial<EstadoBuscasPublicas & { ok?: boolean }> | null {
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object') return null
  return data as Partial<EstadoBuscasPublicas & { ok?: boolean }>
}

export function estadoBuscasPublicas(): EstadoBuscasPublicas {
  return estadoDeNumeros(lerLocal().n)
}

export async function carregarEstadoBuscasPublicas(): Promise<EstadoBuscasPublicas> {
  const local = estadoBuscasPublicas()
  if (!supabase) return local
  try {
    const { data, error } = await supabase.rpc('mapa_publico_cota_estado', {
      p_device_id: deviceId(),
    })
    if (error) {
      if (!rpcFaltando(error)) console.warn('Cota pública:', error.message)
      return local
    }
    const json = lerJsonCota(data)
    if (typeof json?.usadas !== 'number') return local
    const estado = estadoDeNumeros(json.usadas)
    gravarLocal({ n: estado.usadas, dia: diaSaoPaulo() })
    return estado
  } catch (err) {
    if (!rpcFaltando(err)) console.warn('Cota pública:', err)
    return local
  }
}

export function registrarBuscaPublica(): ConsumoBuscaPublica {
  const reg = lerLocal()
  if (reg.n >= LIMITE) return { ok: false, ...estadoDeNumeros(LIMITE) }
  const n = reg.n + 1
  gravarLocal({ n, dia: diaSaoPaulo() })
  return { ok: true, ...estadoDeNumeros(n) }
}

export async function registrarBuscaPublicaRemota(): Promise<ConsumoBuscaPublica> {
  if (!supabase) return registrarBuscaPublica()
  try {
    const { data, error } = await supabase.rpc('mapa_publico_cota_consumir', {
      p_device_id: deviceId(),
    })
    if (error) {
      if (rpcFaltando(error)) return registrarBuscaPublica()
      console.warn('Cota pública:', error.message)
      return { ok: false, ...estadoDeNumeros(LIMITE) }
    }
    const json = lerJsonCota(data)
    if (typeof json?.usadas !== 'number') return registrarBuscaPublica()
    const estado = estadoDeNumeros(json.usadas)
    gravarLocal({ n: estado.usadas, dia: diaSaoPaulo() })
    return { ok: json.ok === true, ...estado }
  } catch (err) {
    if (!rpcFaltando(err)) console.warn('Cota pública:', err)
    return registrarBuscaPublica()
  }
}
