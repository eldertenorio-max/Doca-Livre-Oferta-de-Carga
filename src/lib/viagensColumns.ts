import type { Carga, StatusViagem } from '../types'
import { ordenarCargasKanban } from './kanbanColumns'

export type ColunaViagem = StatusViagem

/**
 * Fluxo da aba Viagens (após alocação de placa/motorista):
 *   aguardando_inicio → rota_iniciada → rota_finalizada
 *                     ↘ cancelada (no meio do percurso)
 */
export function isCargaNaAbaViagens(c: Carga): boolean {
  if (c.status !== 'alocadas') return false
  if (!c.placa?.trim() || !c.motorista?.trim()) return false
  return true
}

export function statusViagemEfetivo(c: Carga): StatusViagem {
  if (c.status_viagem === 'rota_iniciada') return 'rota_iniciada'
  if (c.status_viagem === 'rota_finalizada') return 'rota_finalizada'
  if (c.status_viagem === 'cancelada') return 'cancelada'
  return 'aguardando_inicio'
}

export function colunaViagem(c: Carga): ColunaViagem | null {
  if (!isCargaNaAbaViagens(c)) return null
  return statusViagemEfetivo(c)
}

export function ordenarCargasViagem(a: Carga, b: Carga): number {
  return ordenarCargasKanban(a, b)
}

export const COLUNAS_VIAGEM: {
  key: ColunaViagem
  title: string
  color: string
  description: string
}[] = [
  {
    key: 'aguardando_inicio',
    title: 'Aguardando início',
    color: '#f59e0b',
    description: 'Alocada — transportador deve iniciar a viagem',
  },
  {
    key: 'rota_iniciada',
    title: 'Rota iniciada',
    color: '#3b82f6',
    description: 'Em trânsito',
  },
  {
    key: 'rota_finalizada',
    title: 'Rota finalizada',
    color: '#2f9e6a',
    description: 'Entrega concluída — avaliar motorista e veículo',
  },
  {
    key: 'cancelada',
    title: 'Cancelada',
    color: '#64748b',
    description: 'Cancelada no meio do percurso',
  },
]
