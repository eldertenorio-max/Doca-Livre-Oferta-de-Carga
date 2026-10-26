import { describe, expect, it } from 'vitest'
import type { CadastroTransportadorInput } from './cadastroTransportador'
import { parecerCadastro, parecerLance } from './modulosSombra'
import { TIPOS_DOC_OBRIGATORIOS } from './transportadorDocs'
import type { Carga, Veiculo } from '../types'

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
})
