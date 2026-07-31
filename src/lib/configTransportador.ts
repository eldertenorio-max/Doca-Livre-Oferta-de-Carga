import type { Veiculo } from '../types'
import { appStoreGet, appStoreGetCached, appStoreSet } from './appStore'

/** Preferências operacionais do transportador (por empresa). */
export interface ConfigTransportador {
  // 3 · Negociação e lances
  frete_minimo_empresa: number | null
  frete_maximo_empresa: number | null
  tipos_veiculo_preferidos: string[]
  aceita_carga_retorno: boolean
  aceita_retorna_origem: boolean
  alertar_frete_abaixo_minimo_placa: boolean

  // 4 · Notificações
  notif_nova_oferta: boolean
  notif_contra_proposta: boolean
  notif_frete_fechado: boolean
  notif_viagem: boolean
  notif_som_navegador: boolean

  // 6 · Operação
  gerenciamento_risco_padrao: Veiculo['gerenciamento_risco']
  consumo_km_l: number | null
  preco_diesel: number | null
  /** Ao finalizar viagem, move a localização da placa para o destino da carga. */
  atualizar_localizacao_ao_finalizar: boolean
}

export const DEFAULT_CONFIG_TRANSPORTADOR: ConfigTransportador = {
  frete_minimo_empresa: null,
  frete_maximo_empresa: null,
  tipos_veiculo_preferidos: [],
  aceita_carga_retorno: true,
  aceita_retorna_origem: true,
  alertar_frete_abaixo_minimo_placa: true,
  notif_nova_oferta: true,
  notif_contra_proposta: true,
  notif_frete_fechado: true,
  notif_viagem: true,
  notif_som_navegador: true,
  gerenciamento_risco_padrao: 'nenhum',
  consumo_km_l: null,
  preco_diesel: null,
  atualizar_localizacao_ao_finalizar: true,
}

function storeKey(transportadorId: string) {
  return `config_transportador:${transportadorId}`
}

function asRisco(raw: unknown): Veiculo['gerenciamento_risco'] {
  if (raw === 'rastreador' || raw === 'localizador' || raw === 'nenhum') return raw
  return 'nenhum'
}

export function normalizeConfigTransportador(
  parsed: Partial<ConfigTransportador> | null | undefined,
): ConfigTransportador {
  const p = parsed ?? {}
  return {
    ...DEFAULT_CONFIG_TRANSPORTADOR,
    ...p,
    frete_minimo_empresa:
      p.frete_minimo_empresa != null && Number.isFinite(Number(p.frete_minimo_empresa))
        ? Number(p.frete_minimo_empresa)
        : null,
    frete_maximo_empresa:
      p.frete_maximo_empresa != null && Number.isFinite(Number(p.frete_maximo_empresa))
        ? Number(p.frete_maximo_empresa)
        : null,
    tipos_veiculo_preferidos: Array.isArray(p.tipos_veiculo_preferidos)
      ? p.tipos_veiculo_preferidos.map(String).filter(Boolean)
      : [],
    aceita_carga_retorno: p.aceita_carga_retorno !== false,
    aceita_retorna_origem: p.aceita_retorna_origem !== false,
    alertar_frete_abaixo_minimo_placa: p.alertar_frete_abaixo_minimo_placa !== false,
    notif_nova_oferta: p.notif_nova_oferta !== false,
    notif_contra_proposta: p.notif_contra_proposta !== false,
    notif_frete_fechado: p.notif_frete_fechado !== false,
    notif_viagem: p.notif_viagem !== false,
    notif_som_navegador: p.notif_som_navegador !== false,
    gerenciamento_risco_padrao: asRisco(p.gerenciamento_risco_padrao),
    consumo_km_l:
      p.consumo_km_l != null && Number.isFinite(Number(p.consumo_km_l))
        ? Number(p.consumo_km_l)
        : null,
    preco_diesel:
      p.preco_diesel != null && Number.isFinite(Number(p.preco_diesel))
        ? Number(p.preco_diesel)
        : null,
    atualizar_localizacao_ao_finalizar: p.atualizar_localizacao_ao_finalizar !== false,
  }
}

export function loadConfigTransportador(transportadorId: string | null | undefined): ConfigTransportador {
  if (!transportadorId) return { ...DEFAULT_CONFIG_TRANSPORTADOR }
  return normalizeConfigTransportador(
    appStoreGetCached<Partial<ConfigTransportador> | null>(storeKey(transportadorId), null),
  )
}

export function saveConfigTransportador(
  transportadorId: string,
  cfg: ConfigTransportador,
) {
  const next = normalizeConfigTransportador(cfg)
  void appStoreSet(storeKey(transportadorId), next)
  return next
}

export async function hydrateConfigTransportador(
  transportadorId: string,
): Promise<ConfigTransportador> {
  const remote = await appStoreGet<Partial<ConfigTransportador> | null>(
    storeKey(transportadorId),
    null,
  )
  const next = normalizeConfigTransportador(remote)
  void appStoreSet(storeKey(transportadorId), next)
  return next
}
