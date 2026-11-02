import { describe as describe2, expect as expect2, it as it2 } from 'vitest'
import {
  chaveFacial,
  excluirItemFacial,
  historicoFacialVisivel,
  motoristaDeveFacial,
  motoristaTemFacial,
  refazerFacialMotorista,
  unirHistoricoFacial,
} from './verificacaoFacial'

describe2('ações por item da facial', () => {
  const item = {
    foto_url: 'https://foto/m1.jpg',
    verificado_em: '2026-11-01T12:00:00.000Z',
    distancia: null,
    motorista_id: 'm1',
    motorista_nome: 'Carlos',
    descriptor: Array.from({ length: 32 }, (_, i) => i / 10),
    proxima_em: '2099-01-01T00:00:00.000Z',
  }

  it2('exclusão vence o sync e o motorista volta a Pendente', () => {
    const excluido = excluirItemFacial([item], chaveFacial(item))
    const unido = unirHistoricoFacial([item], excluido)
    expect2(historicoFacialVisivel(unido)).toHaveLength(0)
    expect2(motoristaTemFacial({ facial_historico: unido }, 'm1')).toBe(false)
  })

  it2('refazer cobra de novo só aquele motorista', () => {
    const t = { facial_historico: refazerFacialMotorista([item], 'm1') }
    expect2(motoristaDeveFacial({ facial_historico: [item] }, 'm1')).toBe(false)
    expect2(motoristaDeveFacial(t, 'm1')).toBe(true)
    expect2(motoristaDeveFacial({ facial_historico: unirHistoricoFacial([item], t.facial_historico) }, 'm1')).toBe(true)
  })
})
