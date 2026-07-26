/** Catálogo de carrocerias (cadastro de veículo e publicação de carga). */

export type GrupoCarroceria = 'Abertas' | 'Fechadas' | 'Especiais'

export const CARROCERIAS_POR_GRUPO: Record<GrupoCarroceria, readonly string[]> = {
  Abertas: ['Graneleiro', 'Grade Baixa', 'Prancha', 'Caçamba', 'Plataforma'],
  Fechadas: ['Sider', 'Baú', 'Baú Frigorífico', 'Baú Refrigerado'],
  Especiais: [
    'Silo',
    'Cegonheiro',
    'Gaiola',
    'Tanque',
    'Bug Porta Container',
    'Munck',
    'Apenas Cavalo',
    'Cavaqueira',
    'Hopper',
  ],
} as const

export const GRUPOS_CARROCERIA = Object.keys(CARROCERIAS_POR_GRUPO) as GrupoCarroceria[]

export const TIPOS_CARROCERIA: readonly string[] = GRUPOS_CARROCERIA.flatMap(
  (g) => CARROCERIAS_POR_GRUPO[g],
)

/** Converte texto salvo (vírgula / ponto-e-vírgula) em lista. */
export function parseCarrocerias(raw?: string | string[] | null): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((s) => String(s).trim()).filter(Boolean))]
  }
  return [
    ...new Set(
      raw
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ]
}

/** Serializa para coluna texto / campo único. */
export function joinCarrocerias(list: string[]): string {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))].join(', ')
}

export function toggleCarroceria(list: string[], item: string): string[] {
  const set = new Set(list)
  if (set.has(item)) set.delete(item)
  else set.add(item)
  // Mantém ordem do catálogo
  return TIPOS_CARROCERIA.filter((t) => set.has(t))
}
