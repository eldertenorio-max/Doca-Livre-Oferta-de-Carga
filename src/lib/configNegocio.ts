import type { ClassificacaoRota } from '../types'
import { appStoreGet, appStoreGetCached, appStoreSet, migrateLocalKeyToAppStore } from './appStore'

/** Configurações operacionais (PPT §5 / §20) — persistidas no Supabase. */
export interface ConfigNegocio {
  prazo_oferta_padrao_minutos: number
  prazo_oferta_minimo_minutos: number
  prazo_oferta_maximo_minutos: number
  prazo_alocacao_padrao_minutos: number
  /** Limite em minutos para prioridade alta + modo Oferta */
  limite_urgencia_minutos: number
  margens: Record<ClassificacaoRota, number[]>
  /**
   * % sobre frete_oferta para piso/teto de lance.
   * Ex.: min -15 = até 15% abaixo; max 5 = até 5% acima. null = sem limite.
   */
  lance_min_percentual: number | null
  lance_max_percentual: number | null
  /** Se true, empate de valor exige aceite manual (não auto no timer). */
  empate_exige_aceite_manual: boolean
  /** URL do Controle de Fretes (opcional). Vazio = só fila local. */
  controle_fretes_url: string
  controle_fretes_ativo: boolean
}

export const DEFAULT_CONFIG_NEGOCIO: ConfigNegocio = {
  prazo_oferta_padrao_minutos: 60,
  prazo_oferta_minimo_minutos: 10,
  prazo_oferta_maximo_minutos: 4320,
  prazo_alocacao_padrao_minutos: 10,
  limite_urgencia_minutos: 30,
  margens: {
    A: [-7, -8, -9],
    B: [-4, -5, -6],
    C: [-1, -2, -3],
  },
  lance_min_percentual: -20,
  lance_max_percentual: 0,
  empate_exige_aceite_manual: true,
  controle_fretes_url: '',
  controle_fretes_ativo: true,
}

const STORE_KEY = 'config_negocio'
const LEGACY_KEY = 'doca-livre-config-negocio-v1'

function normalize(parsed: Partial<ConfigNegocio> | null | undefined): ConfigNegocio {
  return {
    ...DEFAULT_CONFIG_NEGOCIO,
    ...(parsed ?? {}),
    margens: {
      ...DEFAULT_CONFIG_NEGOCIO.margens,
      ...(parsed?.margens ?? {}),
    },
  }
}

export function limitesLance(
  freteOferta: number,
  cfg: ConfigNegocio,
): { min: number | null; max: number | null } {
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
  const min =
    cfg.lance_min_percentual != null
      ? round2(freteOferta * (1 + cfg.lance_min_percentual / 100))
      : null
  const max =
    cfg.lance_max_percentual != null
      ? round2(freteOferta * (1 + cfg.lance_max_percentual / 100))
      : null
  return { min, max }
}

export function loadConfigNegocio(): ConfigNegocio {
  return normalize(appStoreGetCached<Partial<ConfigNegocio> | null>(STORE_KEY, null))
}

export function saveConfigNegocio(cfg: ConfigNegocio) {
  const next = normalize(cfg)
  void appStoreSet(STORE_KEY, next)
}

export async function hydrateConfigNegocio(): Promise<ConfigNegocio> {
  await migrateLocalKeyToAppStore(LEGACY_KEY, STORE_KEY, (raw) => {
    try {
      return normalize(JSON.parse(raw) as Partial<ConfigNegocio>)
    } catch {
      return null
    }
  })
  const remote = await appStoreGet<Partial<ConfigNegocio> | null>(STORE_KEY, null)
  const next = normalize(remote)
  void appStoreSet(STORE_KEY, next)
  return next
}

export function prazosOfertaPermitidos(cfg: ConfigNegocio): number[] {
  const base = [
    10, 20, 30, 40, 50, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720, 1440, 2880,
    4320,
  ]
  return base.filter(
    (m) => m >= cfg.prazo_oferta_minimo_minutos && m <= cfg.prazo_oferta_maximo_minutos,
  )
}

export function prazosAlocacaoPermitidos(): number[] {
  return [10, 20, 30, 40, 50, 60, 120, 180, 240]
}

export function formatPrazoLabel(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}
