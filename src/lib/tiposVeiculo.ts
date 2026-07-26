/** Catálogo de veículos (cadastro e publicação de carga). */

export type GrupoVeiculo = 'Pesados' | 'Médios' | 'Leves'

export const VEICULOS_POR_GRUPO: Record<GrupoVeiculo, readonly string[]> = {
  Pesados: [
    'Carreta',
    'Carreta LS',
    'Vanderléia',
    'Carreta 4º eixo',
    'Bitrem 7 eixos',
    'Bitrem 9 eixos',
    'Rodotrem',
  ],
  Médios: ['Truck', 'Bitruck'],
  Leves: ['Fiorino', 'VLC', '3/4', 'Toco'],
} as const

export const GRUPOS_VEICULO = Object.keys(VEICULOS_POR_GRUPO) as GrupoVeiculo[]

/** Lista plana (cards, selects legados, contagens). */
export const TIPOS_VEICULO: readonly string[] = GRUPOS_VEICULO.flatMap(
  (g) => VEICULOS_POR_GRUPO[g],
)
