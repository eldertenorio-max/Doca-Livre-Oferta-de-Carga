import { afterEach, describe, expect, it, vi } from 'vitest'

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile Safari/604.1'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'

/** Simula o aparelho e carrega o módulo do zero (a marca do app é lida ao importar). */
async function carregar({ ua, modo, referrer = '' }: { ua: string; modo: 'browser' | 'standalone'; referrer?: string }) {
  vi.resetModules()
  const sessao = new Map<string, string>()
  vi.stubGlobal('navigator', { userAgent: ua })
  vi.stubGlobal('document', { referrer })
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => sessao.get(k) ?? null,
    setItem: (k: string, v: string) => void sessao.set(k, v),
  })
  vi.stubGlobal('window', {
    matchMedia: (q: string) => ({ matches: q === `(display-mode: ${modo})` }),
  })
  return import('./aplicativo')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('app instalado pelo navegador (desativado)', () => {
  it('bloqueia o app instalado pelo Chrome no Android', async () => {
    const m = await carregar({ ua: ANDROID, modo: 'standalone' })
    expect(m.ehAppDoNavegador()).toBe(true)
  })

  it('não bloqueia o app Android de verdade (abre com o referrer do pacote)', async () => {
    const m = await carregar({
      ua: ANDROID,
      modo: 'standalone',
      referrer: 'android-app://br.com.docalivre.ofertadecarga/',
    })
    expect(m.estaNoApp()).toBe(true)
    expect(m.ehAppDoNavegador()).toBe(false)
  })

  it('não bloqueia o site aberto numa aba do Chrome', async () => {
    const m = await carregar({ ua: ANDROID, modo: 'browser' })
    expect(m.ehAppDoNavegador()).toBe(false)
  })

  it('bloqueia o app instalado pelo Chrome/Edge no computador', async () => {
    const m = await carregar({ ua: WINDOWS, modo: 'standalone' })
    expect(m.ehAppDoNavegador()).toBe(true)
  })

  it('não bloqueia o iPhone (sem APK; a Tela de Início é o único jeito de ter notificação)', async () => {
    const m = await carregar({ ua: IPHONE, modo: 'standalone' })
    expect(m.ehAppDoNavegador()).toBe(false)
  })

  it('o link "abrir o app" vai para o pacote e cai no instalador sem o app', async () => {
    const m = await carregar({ ua: ANDROID, modo: 'browser' })
    const link = m.linkAbrirApp()
    expect(link).toContain('package=br.com.docalivre.ofertadecarga')
    expect(link).toContain(encodeURIComponent('https://ofertadecarga.com.br/app/oferta-de-carga.apk'))
  })
})
