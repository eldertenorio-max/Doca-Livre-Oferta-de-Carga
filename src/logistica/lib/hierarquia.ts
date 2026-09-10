import type { NivelHierarquia } from '../types'

export const NIVEIS_HIERARQUIA: { id: NivelHierarquia; label: string; resumo: string }[] = [
  {
    id: 'super',
    label: 'Superusuário',
    resumo: 'Acesso total ao mapa, painel, kanban e cadastros.',
  },
  {
    id: 'gestor',
    label: 'Gestor',
    resumo: 'Responsável pela empresa no mapa, ligado a um superusuário.',
  },
  {
    id: 'operador',
    label: 'Operador',
    resumo: 'Opera o cadastro da empresa sob um gestor ou superusuário.',
  },
]

export const SUPERIORES_PADRAO = [
  { id: 'Diego', label: 'Diego (superusuário)' },
  { id: 'Elder', label: 'Elder (superusuário)' },
] as const

export function labelHierarquia(id?: NivelHierarquia | null) {
  return NIVEIS_HIERARQUIA.find((n) => n.id === id)?.label ?? '—'
}
