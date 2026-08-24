import type { Motorista, Veiculo } from '../types'

export function normalizeMotorista(m: Motorista): Motorista {
  const autonomo = Boolean(m.autonomo) || !m.transportador_id
  return {
    ...m,
    transportador_id: autonomo ? null : m.transportador_id || null,
    veiculo_id: m.veiculo_id ?? null,
    autonomo,
    whatsapp_no_mapa: m.whatsapp_no_mapa === true,
  }
}

export function normalizeVeiculo(v: Veiculo): Veiculo {
  const frete =
    typeof v.frete_minimo === 'number' && Number.isFinite(v.frete_minimo) ? v.frete_minimo : 0
  return {
    ...v,
    transportador_id: v.transportador_id || null,
    frete_minimo: frete,
    disponivel_mapa: v.disponivel_mapa !== false,
    marca_termico: v.marca_termico?.trim() || undefined,
    marca_rastreador: v.marca_rastreador?.trim() || undefined,
    marca_localizador: v.marca_localizador?.trim() || undefined,
    temp_min:
      v.temp_min != null && Number.isFinite(Number(v.temp_min)) ? Number(v.temp_min) : undefined,
    temp_max:
      v.temp_max != null && Number.isFinite(Number(v.temp_max)) ? Number(v.temp_max) : undefined,
  }
}
