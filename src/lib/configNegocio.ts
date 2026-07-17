import type { ClassificacaoRota } from '../types'

/** Configurações operacionais (PPT §5 / §20) — persistidas em localStorage. */
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

export function limitesLance(
  freteOferta: number,
  cfg: ConfigNegocio,
): { min: number | null; max: number | null } {
  const min =
    cfg.lance_min_percentual != null
      ? freteOferta * (1 + cfg.lance_min_percentual / 100)
      : null
  const max =
    cfg.lance_max_percentual != null
      ? freteOferta * (1 + cfg.lance_max_percentual / 100)
      : null
  return { min, max }
}

const KEY = 'doca-livre-config-negocio-v1'

export function loadConfigNegocio(): ConfigNegocio {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(DEFAULT_CONFIG_NEGOCIO)
    const parsed = JSON.parse(raw) as Partial<ConfigNegocio>
    return {
      ...DEFAULT_CONFIG_NEGOCIO,
      ...parsed,
      margens: {
        ...DEFAULT_CONFIG_NEGOCIO.margens,
        ...(parsed.margens ?? {}),
      },
    }
  } catch {
    return structuredClone(DEFAULT_CONFIG_NEGOCIO)
  }
}

export function saveConfigNegocio(cfg: ConfigNegocio) {
  localStorage.setItem(KEY, JSON.stringify(cfg))
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
