import {
  deviceHashPublico,
  visitorIdPublico,
  type EstadoBuscasPublicas,
} from './mapaPublicoBuscas'
import { isSupabaseConfigured, supabase } from './supabase'

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
    const { data, error } = await supabase.rpc('rota_publico_cota_cliente', payload)
    const parsed = lerRespostaCota(data)
    if (!error && parsed) return parsed
  } catch {
    /* tenta a Edge Function */
  }
  try {
    const { data, error } = await supabase.functions.invoke('mapa-publico-busca', {
      body: {
        action,
        produto: 'rota',
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

export async function consultarEstadoCalculosPublicos(): Promise<EstadoBuscasPublicas> {
  const remoto = await chamarServidor('status')
  if (remoto) return aplicarResposta(remoto)
  return estadoCalculosPublicos()
}

/** Consome 1 cálculo no servidor (IP + aparelho). localStorage só reforça no mesmo perfil. */
export async function registrarCalculoPublico(): Promise<EstadoBuscasPublicas & { ok: boolean }> {
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
