/** Conferência da virada. A cópia só segue quando estas contagens batem. */

export const LINHA_KANBAN = 'main'

export const TABELAS_VIRADA = ['transportadores', 'cargas', 'lances', 'kanban_sync'] as const

export type TabelaVirada = (typeof TABELAS_VIRADA)[number]

export type ContagemVirada = Record<TabelaVirada, number>

export type ParecerVirada = {
  podeVirar: boolean
  divergencias: string[]
}

export function parecerVirada(
  origem: ContagemVirada,
  destino: ContagemVirada,
  kanban?: { origemId?: string | null; destinoId?: string | null },
): ParecerVirada {
  const divergencias: string[] = []

  for (const tabela of ['transportadores', 'cargas', 'lances'] as const) {
    if (origem[tabela] !== destino[tabela]) {
      divergencias.push(`${tabela}: origem ${origem[tabela]}, destino ${destino[tabela]}`)
    }
  }

  if (origem.kanban_sync !== destino.kanban_sync) {
    divergencias.push(
      `kanban_sync: origem ${origem.kanban_sync}, destino ${destino.kanban_sync}`,
    )
  }
  if (origem.kanban_sync !== 1 || destino.kanban_sync !== 1) {
    divergencias.push('kanban_sync: a virada exige uma linha main de cada lado')
  }

  const origemId = kanban?.origemId ?? LINHA_KANBAN
  const destinoId = kanban?.destinoId ?? LINHA_KANBAN
  if (origemId !== LINHA_KANBAN || destinoId !== LINHA_KANBAN) {
    divergencias.push(`kanban_sync: id origem ${origemId || 'vazio'}, destino ${destinoId || 'vazio'}`)
  }

  return { podeVirar: divergencias.length === 0, divergencias }
}
