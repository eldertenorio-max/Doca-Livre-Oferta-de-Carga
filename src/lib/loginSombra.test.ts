import { describe, expect, it } from 'vitest'
import { parecerLogin, senhaParaImportar, type ContaImportada } from './loginSombra'

const gravada = 'Fase6-Senha'

function conta(parcial: Partial<ContaImportada> = {}): ContaImportada {
  return {
    usuario: 'joao',
    email: 'joao@transporte.test',
    senha_hash: gravada,
    ativo: true,
    ...parcial,
  }
}

describe('fase 6 — login próprio', () => {
  it('entra com a mesma senha e não troca o valor gravado', () => {
    expect(senhaParaImportar(gravada)).toBe(gravada)
    expect(senhaParaImportar('  Fase6  ')).toBe('  Fase6  ')

    const porLogin = parecerLogin([conta()], 'João', 'fase6-senha')
    const porEmail = parecerLogin([conta()], 'JOAO@transporte.test', gravada)

    expect(porLogin.ok).toBe(true)
    expect(porEmail.ok).toBe(true)
    if (porLogin.ok) expect(porLogin.senha_hash).toBe(gravada)
    if (porEmail.ok) expect(porEmail.senha_hash).toBe(gravada)
  })

  it('recusa senha errada, conta inativa, senha curta e conta de site público', () => {
    expect(parecerLogin([conta()], 'joao', 'outra-senha').ok).toBe(false)

    const inativa = parecerLogin([conta({ ativo: false })], 'joao', gravada)
    expect(inativa.ok).toBe(false)
    if (!inativa.ok) expect(inativa.erro).toMatch(/aprovação/)

    const curta = parecerLogin([conta({ senha_hash: 'abc' })], 'joao', 'abc')
    expect(curta.ok).toBe(false)
    if (!curta.ok) expect(curta.erro).toMatch(/sem senha/)

    const publica = parecerLogin([conta({ origem: 'rota_publico' })], 'joao', gravada)
    expect(publica.ok).toBe(false)
    if (!publica.ok) expect(publica.erro).toMatch(/sites públicos/)
  })
})
