import { describe, expect, it } from 'vitest'
import {
  destinoDoFront,
  frontChamaSupabase,
  supabaseSomenteLeitura,
  type FrenteDesligamento,
} from './desligamentoSombra'

const hoje: FrenteDesligamento = {
  apiNoAr: false,
  contagensBatem: false,
  loginNaApi: false,
  arquivosEspelhados: false,
}

const pronto: FrenteDesligamento = {
  apiNoAr: true,
  contagensBatem: true,
  loginNaApi: true,
  arquivosEspelhados: true,
}

describe('fase 7 — desligamento', () => {
  it('mantém o front no Supabase enquanto a API não segura o sistema', () => {
    expect(frontChamaSupabase(hoje)).toBe(true)
    expect(destinoDoFront(hoje)).toBe('supabase')

    const faltaApi = destinoDoFront({ ...pronto, apiNoAr: false })
    const faltaContagem = destinoDoFront({ ...pronto, contagensBatem: false })
    const faltaLogin = destinoDoFront({ ...pronto, loginNaApi: false })
    const faltaArquivo = destinoDoFront({ ...pronto, arquivosEspelhados: false })

    expect(faltaApi).toBe('supabase')
    expect(faltaContagem).toBe('supabase')
    expect(faltaLogin).toBe('supabase')
    expect(faltaArquivo).toBe('supabase')
  })

  it('tira o front do Supabase só quando API, contagem, login e arquivos estão prontos', () => {
    expect(frontChamaSupabase(pronto)).toBe(false)
    expect(destinoDoFront(pronto)).toBe('api')
  })

  it('deixa o Supabase só leitura por 30 dias depois do corte', () => {
    const corte = '2026-11-01T00:00:00.000Z'
    expect(supabaseSomenteLeitura(corte, '2026-11-01T00:00:00.000Z')).toBe(true)
    expect(supabaseSomenteLeitura(corte, '2026-11-30T00:00:00.000Z')).toBe(true)
    expect(supabaseSomenteLeitura(corte, '2026-12-01T00:00:00.000Z')).toBe(false)
    expect(supabaseSomenteLeitura(corte, '2026-10-31T00:00:00.000Z')).toBe(false)
  })
})
