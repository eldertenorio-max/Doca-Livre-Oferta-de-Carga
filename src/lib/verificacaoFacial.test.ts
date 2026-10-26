import { describe, expect, it } from 'vitest'
import {
  deveCobrarVerificacaoFacial,
  facialExigeNovoCadastro,
  facialParaTransportadora,
  mesmoRosto,
  preservarVerificacaoFacial,
  unirHistoricoFacial,
} from './verificacaoFacial'

const rosto = [0, 0, 0.1, 0, 0, 0.2, 0.1, 0.2]
const outro = [9, 9, 9, 9, 9, 9, 9, 9]

describe('fase 0 — verificação facial não pode mudar de regra', () => {
  it('aceita o mesmo rosto e recusa um rosto diferente', () => {
    expect(mesmoRosto(rosto, [...rosto])).toBe(true)
    expect(mesmoRosto(rosto, outro)).toBe(false)
  })

  it('cobra de novo quando o super apaga a última verificação', () => {
    const apagado = {
      facial_descriptor: null,
      facial_foto_url: null,
      facial_verificado_em: null,
      facial_proxima_em: null,
      facial_reset_em: '2026-10-26T12:00:00.000Z',
    }
    expect(facialExigeNovoCadastro(apagado)).toBe(true)
    expect(deveCobrarVerificacaoFacial(apagado)).toBe(true)
  })

  it('não deixa o celular devolver o rosto depois da exclusão', () => {
    const remoto = {
      id: 't1',
      facial_descriptor: null,
      facial_foto_url: null,
      facial_verificado_em: null,
      facial_proxima_em: null,
      facial_reset_em: '2026-10-26T12:00:00.000Z',
      facial_historico: [{ foto_url: 'https://foto/antiga.jpg', verificado_em: '2026-10-20T12:00:00.000Z', distancia: null }],
    }
    const local = {
      facial_descriptor: rosto,
      facial_foto_url: 'https://foto/antiga.jpg',
      facial_verificado_em: '2026-10-20T12:00:00.000Z',
      facial_proxima_em: '2026-11-20T12:00:00.000Z',
    }
    const ficou = preservarVerificacaoFacial(remoto, local)
    expect(ficou.facial_descriptor).toBeNull()
    expect(ficou.facial_foto_url).toBeNull()
    expect(ficou.facial_historico).toHaveLength(1)
  })

  it('mantém um cadastro feito depois da exclusão', () => {
    const remoto = {
      facial_descriptor: rosto,
      facial_foto_url: 'https://foto/nova.jpg',
      facial_verificado_em: '2026-10-26T18:00:00.000Z',
      facial_proxima_em: '2026-11-10T18:00:00.000Z',
      facial_reset_em: '2026-10-26T12:00:00.000Z',
    }
    const ficou = preservarVerificacaoFacial(remoto, {
      facial_descriptor: null,
      facial_foto_url: null,
      facial_reset_em: '2026-10-26T12:00:00.000Z',
    })
    expect(ficou.facial_descriptor).toEqual(rosto)
    expect(ficou.facial_foto_url).toBe('https://foto/nova.jpg')
  })

  it('não cobra enquanto a próxima data está no futuro', () => {
    const futuro = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    expect(
      deveCobrarVerificacaoFacial({
        facial_descriptor: rosto,
        facial_foto_url: 'https://foto/ok.jpg',
        facial_verificado_em: new Date().toISOString(),
        facial_proxima_em: futuro,
      }),
    ).toBe(false)
  })

  it('só pede facial da transportadora', () => {
    expect(facialParaTransportadora('transportadora')).toBe(true)
    expect(facialParaTransportadora('')).toBe(true)
    expect(facialParaTransportadora('motorista')).toBe(false)
  })

  it('não duplica o histórico da mesma foto', () => {
    const item = { foto_url: 'https://foto/a.jpg?v=1', verificado_em: '2026-10-20T12:00:00.000Z', distancia: null }
    const lista = unirHistoricoFacial([item], [{ ...item, foto_url: 'https://foto/a.jpg?v=2' }])
    expect(lista).toHaveLength(1)
  })
})
