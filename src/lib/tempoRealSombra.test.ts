import { describe, expect, it } from 'vitest'
import { applySyncSlice, aplicarAvisoCarga, type KanbanSyncSlice } from './kanbanSync'
import {
  ignorarEcoProprio,
  sinoDoTransportador,
  tagPushCarga,
  versaoKanbanMudou,
} from './tempoRealSombra'
import { textoPushNovaCarga } from './webPush'
import type { Carga, NotificacaoInApp } from '../types'

function quadro(parcial: Partial<KanbanSyncSlice> = {}): KanbanSyncSlice {
  return {
    cargas: [],
    lances: [],
    grupos: [],
    transportadores: [],
    veiculos: [],
    motoristas: [],
    rotas: [],
    notificacoes: [],
    mensagens: [],
    historico: [],
    historicoPropostas: [],
    chatLeituras: {},
    ...parcial,
  }
}

function cargaPublicada(): Carga {
  return {
    id: 'c1',
    numero: '1042',
    origem: 'Curitiba',
    destino: 'São Paulo',
    frete_oferta: 1500,
    status: 'negociando',
    updated_at: '2026-10-26T20:00:00.000Z',
  } as Carga
}

describe('fase 3 — tempo real', () => {
  it('mostra um aviso no celular mesmo com broadcast e Kanban', () => {
    const carga = cargaPublicada()
    const mensagem = textoPushNovaCarga(carga)
    const aviso = {
      client_id: 'outro-aparelho',
      carga,
      tids: ['t-santos'],
      titulo: 'Nova oferta de carga',
      mensagem,
    }

    const naHora = aplicarAvisoCarga(quadro(), aviso)
    const deNovo = aplicarAvisoCarga(naHora, aviso)
    expect(sinoDoTransportador(deNovo.notificacoes, 't-santos')).toHaveLength(1)
    expect(deNovo.cargas.map((c) => c.id)).toEqual(['c1'])

    const remoto = quadro({
      cargas: [{ ...carga, updated_at: '2026-10-26T20:00:02.000Z' }],
      notificacoes: [
        {
          id: 'srv-todos',
          role: 'todos',
          titulo: 'Nova carga publicada',
          mensagem,
          carga_id: 'c1',
          chave: 'carga-aviso:c1',
          lida: false,
          created_at: '2026-10-26T20:00:02.000Z',
          updated_at: '2026-10-26T20:00:02.000Z',
        },
        {
          id: 'srv-santos',
          transportador_id: 't-santos',
          titulo: 'Nova oferta de carga',
          mensagem,
          carga_id: 'c1',
          chave: 'carga-aviso:c1:t-santos',
          lida: false,
          created_at: '2026-10-26T20:00:02.000Z',
          updated_at: '2026-10-26T20:00:02.000Z',
        },
      ] as NotificacaoInApp[],
    })
    const completo = applySyncSlice(deNovo, remoto)
    const sino = sinoDoTransportador(completo.notificacoes, 't-santos')
    expect(sino).toHaveLength(1)
    expect(sino[0]?.carga_id).toBe('c1')
    expect(sino[0]?.mensagem).toBe(mensagem)
    expect(tagPushCarga(carga.id)).toBe('carga-c1')
  })

  it('ignora o eco do próprio aparelho e não baixa o Kanban se a versão é a mesma', () => {
    expect(ignorarEcoProprio('cli-a', 'cli-a')).toBe(true)
    expect(ignorarEcoProprio('cli-b', 'cli-a')).toBe(false)
    expect(ignorarEcoProprio('', 'cli-a')).toBe(false)
    const visto = new Date('2026-10-26T20:00:00.000Z').getTime()
    expect(versaoKanbanMudou(visto, '2026-10-26T20:00:00.000Z')).toBe(false)
    expect(versaoKanbanMudou(visto, '2026-10-26T20:00:03.000Z')).toBe(true)
    expect(versaoKanbanMudou(visto, null)).toBe(true)
  })

  it('não devolve carga excluída nem apaga o quadro local quando o remoto vem vazio', () => {
    const carga = cargaPublicada()
    const local = quadro({
      cargas: [carga],
      cargas_excluidas: ['c1'],
    })
    const remotoComCarga = applySyncSlice(
      local,
      quadro({ cargas: [{ ...carga, updated_at: '2026-10-26T20:05:00.000Z' }] }),
    )
    expect(remotoComCarga.cargas).toHaveLength(0)

    const publicado = quadro({
      cargas: [{ ...carga, id: 'c2', status: 'negociando', updated_at: '2026-10-26T20:02:00.000Z' } as Carga],
    })
    const remotoVazio = applySyncSlice(publicado, quadro())
    expect(remotoVazio.cargas.map((c) => c.id)).toEqual(['c2'])

    const antigo = applySyncSlice(
      publicado,
      quadro({
        cargas: [{ ...carga, id: 'c2', status: 'nova_carga', updated_at: '2026-10-26T19:00:00.000Z' } as Carga],
      }),
    )
    expect(antigo.cargas[0]?.status).toBe('negociando')
  })

  it('mantém o aviso lido quando o Kanban antigo chega sem a leitura', () => {
    const mensagem = 'Carga 1042 · Curitiba → São Paulo'
    const local = quadro({
      notificacoes: [
        {
          id: 'n1',
          transportador_id: 't-santos',
          titulo: 'Nova oferta de carga',
          mensagem,
          carga_id: 'c1',
          chave: 'carga-aviso:c1:t-santos',
          lida: true,
          created_at: '2026-10-26T20:00:00.000Z',
          updated_at: '2026-10-26T20:00:00.000Z',
        },
      ],
    })
    const remoto = applySyncSlice(
      local,
      quadro({
        notificacoes: [
          {
            id: 'n1',
            transportador_id: 't-santos',
            titulo: 'Nova oferta de carga',
            mensagem,
            carga_id: 'c1',
            chave: 'carga-aviso:c1:t-santos',
            lida: false,
            created_at: '2026-10-26T20:00:00.000Z',
            updated_at: '2026-10-26T20:00:05.000Z',
          },
        ],
      }),
    )
    expect(remoto.notificacoes).toHaveLength(1)
    expect(remoto.notificacoes[0]?.lida).toBe(true)
  })
})
