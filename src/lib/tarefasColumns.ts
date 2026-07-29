import type { PrioridadeTarefa, StatusTarefa } from '../types'

export const COLUNAS_TAREFAS: {
  key: StatusTarefa
  title: string
  color: string
}[] = [
  { key: 'pendente', title: 'Pendente', color: '#eab308' },
  { key: 'aprovadas', title: 'Aprovadas', color: '#3b82f6' },
  { key: 'em_desenvolvimento', title: 'Em Desenvolvimento', color: '#8b5cf6' },
  { key: 'em_testes', title: 'Em Testes', color: '#14b8a6' },
  { key: 'finalizadas', title: 'Finalizadas', color: '#475569' },
  { key: 'canceladas', title: 'Canceladas', color: '#ef4444' },
]

export function labelPrioridade(p: PrioridadeTarefa): string {
  if (p === 'baixa') return 'Baixa'
  if (p === 'media') return 'Média'
  if (p === 'alta') return 'Alta'
  return 'Urgente'
}

export function classPrioridade(p: PrioridadeTarefa): string {
  if (p === 'baixa') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (p === 'media') return 'bg-sky-100 text-sky-800 border-sky-200'
  if (p === 'alta') return 'bg-orange-100 text-orange-800 border-orange-200'
  return 'bg-red-100 text-red-800 border-red-200'
}

export function isStatusTarefa(v: string): v is StatusTarefa {
  return COLUNAS_TAREFAS.some((c) => c.key === v)
}
