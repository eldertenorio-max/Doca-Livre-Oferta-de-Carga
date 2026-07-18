import type { Motorista, Veiculo } from '../types'

export function normalizeMotorista(m: Motorista): Motorista {
  const autonomo = Boolean(m.autonomo) || !m.transportador_id
  return {
    ...m,
    transportador_id: autonomo ? null : m.transportador_id || null,
    veiculo_id: m.veiculo_id ?? null,
    autonomo,
  }
}

export function normalizeVeiculo(v: Veiculo): Veiculo {
  return {
    ...v,
    transportador_id: v.transportador_id || null,
  }
}
