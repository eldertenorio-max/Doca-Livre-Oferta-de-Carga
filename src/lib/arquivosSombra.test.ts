import { describe, expect, it } from 'vitest'
import {
  caminhoDocumento,
  caminhoFacial,
  caminhoFotoVeiculo,
  caminhosLogo,
  espelhoArquivo,
  espelhoDaUrlAntiga,
} from './arquivosSombra'

const ORIGEM = 'https://imnlbbfgaztfhwndfxwb.supabase.co'

describe('fase 4 — arquivos', () => {
  it('abre a foto nova no Blob e mantém a URL antiga', () => {
    const path = caminhoFotoVeiculo('v1', 'dianteira', 'jpg')
    const espelho = espelhoArquivo(ORIGEM, 'veiculos-fotos', path)
    expect(path).toBe('v1/dianteira.jpg')
    expect(espelho).not.toBeNull()
    expect(espelho?.urlAntiga).toBe(
      `${ORIGEM}/storage/v1/object/public/veiculos-fotos/v1/dianteira.jpg`,
    )
    expect(espelho?.urlBlob).toBe(
      'https://stofertacargaprod.blob.core.windows.net/veiculos-fotos/v1/dianteira.jpg',
    )

    const lido = espelhoDaUrlAntiga(espelho!.urlAntiga)
    expect(lido?.urlAntiga).toBe(espelho?.urlAntiga)
    expect(lido?.urlBlob).toBe(espelho?.urlBlob)
    expect(lido?.path).toBe(path)
  })

  it('não troca a URL que já está na linha, inclusive com o cache da foto', () => {
    const gravada =
      `${ORIGEM}/storage/v1/object/public/veiculos-fotos/avatars/u1/avatar.jpg?v=123`
    const espelho = espelhoDaUrlAntiga(gravada)
    expect(espelho?.urlAntiga).toBe(gravada)
    expect(espelho?.path).toBe('avatars/u1/avatar.jpg')
    expect(espelho?.urlBlob).toBe(
      'https://stofertacargaprod.blob.core.windows.net/veiculos-fotos/avatars/u1/avatar.jpg',
    )
  })

  it('espelha documento e facial no mesmo caminho e deixa base64 e o feed de fora', () => {
    expect(caminhoDocumento('t1', 'cnh', 10, 'CNH 1.pdf')).toBe('t1/cnh-10-CNH_1.pdf')
    expect(caminhoFacial('t1', 10)).toBe('t1/facial/10.jpg')
    const doc = espelhoArquivo(ORIGEM, 'documentos-transportadores', 't1/facial/10.jpg')
    expect(doc?.urlAntiga.endsWith('/documentos-transportadores/t1/facial/10.jpg')).toBe(true)
    expect(doc?.urlBlob.endsWith('/documentos-transportadores/t1/facial/10.jpg')).toBe(true)

    const logo = caminhosLogo('t1', 'png')
    expect(logo.map((t) => t.bucket)).toEqual([
      'documentos-transportadores',
      'veiculos-fotos',
    ])
    expect(logo[1]?.path).toBe('logos/t1/logo.png')

    expect(espelhoDaUrlAntiga('data:image/jpeg;base64,AA==')).toBeNull()
    expect(espelhoArquivo(ORIGEM, 'feed-midias', 'post/1.jpg')).toBeNull()
  })
})
