import { describe, expect, it } from 'vitest'
import type { CadastroTransportadorInput } from './cadastroTransportador'
import { codigoEmailAceito, deduplicarAvisosCarga, parecerCadastro, parecerLance, parecerPix, placasNoMapaPadrao } from './modulosSombra'
import { TIPOS_DOC_OBRIGATORIOS } from './transportadorDocs'
import type { Carga, Motorista, NotificacaoInApp, Transportador, Veiculo } from '../types'

const rosto = [0, 0, 0.1, 0, 0, 0.2, 0.1, 0.2]

function cadastroBase(): CadastroTransportadorInput {
  return {
    ramificacao: 'transportadora',
    empresa: {
      razao_social: 'Santos Transportes',
      nome_fantasia: 'Santos',
      cnpj: '12.345.678/0001-90',
      cidade: 'Curitiba',
      uf: 'PR',
      telefone: '41999999999',
      contato_nome: 'Santos',
    },
    origem: {
      cidade: 'Curitiba',
      uf: 'PR',
      endereco: 'Rua A',
      lat: -25.4,
      lng: -49.2,
      raio_km: 50,
    },
    acesso: {
      usuario: 'fase2-unico-santos',
      email: 'fase2-unico-santos@teste.local',
      senha: 'senha123',
      confirmarSenha: 'senha123',
      nome: 'Santos',
    },
    documentos: TIPOS_DOC_OBRIGATORIOS.map((tipo) => ({
      tipo,
      nome_arquivo: `${tipo}.pdf`,
      data_url: 'data:application/pdf;base64,AA==',
    })),
    facial: { imagemDataUrl: 'data:image/jpeg;base64,AA==', descriptor: rosto },
  }
}

function veiculo(parcial: Partial<Veiculo>): Veiculo {
  return {
    id: 'v1',
    placa: 'ABC1D23',
    transportador_id: 't-santos',
    tipo: 'truck',
    frete_minimo: 0,
    usa_manobrista: false,
    padiado: false,
    situacao: 'ativo',
    ...parcial,
  }
}

describe('fase 2 — cadastro e lance', () => {
  it('recusa cadastro sem razão social', () => {
    const input = cadastroBase()
    input.empresa.razao_social = ' '
    expect(parecerCadastro(input)).toMatch(/Razão Social/)
  })

  it('recusa transportadora sem verificação facial', () => {
    const input = cadastroBase()
    input.facial = null
    expect(parecerCadastro(input)).toMatch(/verificação facial/)
  })

  it('aceita o cadastro completo', () => {
    expect(parecerCadastro(cadastroBase())).toBeNull()
  })

  it('mostra a carga de rastreador e bloqueia o lance sem o equipamento', () => {
    const carga = { gerenciamento_risco: 'rastreador' } as Carga
    const parecer = parecerLance(carga, [veiculo({ gerenciamento_risco: 'nenhum' })], 't-santos')
    expect(parecer.mostraOferta).toBe(true)
    expect(parecer.podeEnviar).toBe(false)
    expect(parecer.motivo).toMatch(/rastreador/)
  })

  it('libera o lance quando a frota tem rastreador', () => {
    const carga = { gerenciamento_risco: 'rastreador' } as Carga
    const parecer = parecerLance(
      carga,
      [veiculo({ gerenciamento_risco: 'rastreador' })],
      't-santos',
    )
    expect(parecer.mostraOferta).toBe(true)
    expect(parecer.podeEnviar).toBe(true)
    expect(parecer.motivo).toBeNull()
  })

  it('tira do mapa padrão a placa marcada indisponível', () => {
    const t = {
      id: 't-santos',
      nome_fantasia: 'Santos',
      situacao: 'ativo',
      origem_lat: -25.4,
      origem_lng: -49.2,
    } as Transportador
    const placas = placasNoMapaPadrao(
      [] as Motorista[],
      [
        veiculo({ id: 'v1', placa: 'AAA1A11', disponivel_mapa: true, origem_lat: -25.4, origem_lng: -49.2 }),
        veiculo({ id: 'v2', placa: 'BBB2B22', disponivel_mapa: false, origem_lat: -25.4, origem_lng: -49.2 }),
      ],
      [t],
    )
    expect(placas).toContain('AAA1A11')
    expect(placas).not.toContain('BBB2B22')
  })

  it('deixa um aviso só quando a publicação gera duas notificações iguais', () => {
    const base = {
      carga_id: 'c1',
      mensagem: 'Curitiba → São Paulo',
      lida: false,
      created_at: '2026-10-26T20:00:00.000Z',
    }
    const lista = deduplicarAvisosCarga([
      { ...base, id: 'n1', titulo: 'Nova carga publicada', chave: 'carga-aviso:c1' },
      { ...base, id: 'n2', titulo: 'Nova oferta de carga', chave: 'carga-aviso:c1:t-santos' },
      { ...base, id: 'n3', titulo: 'Nova mensagem', mensagem: 'outro texto', chave: 'chat:1' },
    ] as NotificacaoInApp[])
    expect(lista.map((n) => n.id)).toEqual(['n1', 'n3'])
  })

  it('gera o PIX estável e só aceita código de seis dígitos', () => {
    const pix = parecerPix({
      chave: 'teste@docalivre.com',
      nome: 'DOCA LIVRE',
      cidade: 'POUSO ALEGRE',
      valor: 10.5,
      txid: 'CARGA1',
    })
    expect(pix.startsWith('000201')).toBe(true)
    expect(pix).toContain('10.50')
    expect(pix).toBe(
      parecerPix({
        chave: 'teste@docalivre.com',
        nome: 'DOCA LIVRE',
        cidade: 'POUSO ALEGRE',
        valor: 10.5,
        txid: 'CARGA1',
      }),
    )
    expect(codigoEmailAceito('123-456')).toBe(true)
    expect(codigoEmailAceito('12345')).toBe(false)
  })
})
