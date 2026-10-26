import { describe, expect, it } from 'vitest'
import { LINHA_KANBAN, parecerVirada, type ContagemVirada } from './viradaSombra'

function contagem(parcial: Partial<ContagemVirada> = {}): ContagemVirada {
  return {
    transportadores: 12,
    cargas: 40,
    lances: 7,
    kanban_sync: 1,
    ...parcial,
  }
}

describe('fase 5 — virada do banco', () => {
  it('libera a virada quando transportadoras, cargas, lances e o Kanban batem', () => {
    const parecer = parecerVirada(contagem(), contagem(), {
      origemId: LINHA_KANBAN,
      destinoId: LINHA_KANBAN,
    })
    expect(parecer.podeVirar).toBe(true)
    expect(parecer.divergencias).toEqual([])
  })

  it('recusa se a contagem de cargas ou de lances divergir', () => {
    const cargas = parecerVirada(contagem(), contagem({ cargas: 39 }))
    expect(cargas.podeVirar).toBe(false)
    expect(cargas.divergencias.join(' ')).toMatch(/cargas: origem 40, destino 39/)

    const lances = parecerVirada(contagem(), contagem({ lances: 8 }))
    expect(lances.podeVirar).toBe(false)
    expect(lances.divergencias.join(' ')).toMatch(/lances: origem 7, destino 8/)

    const transportadoras = parecerVirada(contagem(), contagem({ transportadores: 11 }))
    expect(transportadoras.podeVirar).toBe(false)
    expect(transportadoras.divergencias.join(' ')).toMatch(/transportadores: origem 12, destino 11/)
  })

  it('recusa o Kanban sem a linha main ou com outro id', () => {
    const vazia = parecerVirada(contagem({ kanban_sync: 0 }), contagem({ kanban_sync: 0 }))
    expect(vazia.podeVirar).toBe(false)
    expect(vazia.divergencias.join(' ')).toMatch(/uma linha main/)

    const outroId = parecerVirada(contagem(), contagem(), {
      origemId: 'main',
      destinoId: 'backup',
    })
    expect(outroId.podeVirar).toBe(false)
    expect(outroId.divergencias.join(' ')).toMatch(/destino backup/)
  })
})
