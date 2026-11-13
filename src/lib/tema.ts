import { useCallback, useEffect, useState } from 'react'

/**
 * Tema claro/escuro, igual ao WMS Doca Livre: atributo data-tema no <html>,
 * escolha salva no aparelho. O index.html aplica o tema salvo antes de a página
 * aparecer (sem piscar claro ao abrir).
 */
export type Tema = 'claro' | 'escuro'

const CHAVE = 'oferta.tema'
const EVENTO = 'oferta:tema'

export function temaSalvo(): Tema {
  try {
    return localStorage.getItem(CHAVE) === 'escuro' ? 'escuro' : 'claro'
  } catch {
    return 'claro'
  }
}

export function aplicarTema(tema: Tema) {
  document.documentElement.setAttribute('data-tema', tema)
  try {
    localStorage.setItem(CHAVE, tema)
  } catch {
    /* sem localStorage: vale só nesta aba */
  }
  window.dispatchEvent(new CustomEvent<Tema>(EVENTO, { detail: tema }))
}

/** Tema atual + função para alternar. Acompanha mudanças feitas em outras abas. */
export function useTema(): { tema: Tema; alternar: () => void } {
  const [tema, setTema] = useState<Tema>(() =>
    document.documentElement.getAttribute('data-tema') === 'escuro' ? 'escuro' : temaSalvo(),
  )

  useEffect(() => {
    const aoMudar = (e: Event) => setTema((e as CustomEvent<Tema>).detail)
    const outraAba = (e: StorageEvent) => {
      if (e.key !== CHAVE) return
      const novo: Tema = e.newValue === 'escuro' ? 'escuro' : 'claro'
      document.documentElement.setAttribute('data-tema', novo)
      setTema(novo)
    }
    window.addEventListener(EVENTO, aoMudar)
    window.addEventListener('storage', outraAba)
    return () => {
      window.removeEventListener(EVENTO, aoMudar)
      window.removeEventListener('storage', outraAba)
    }
  }, [])

  const alternar = useCallback(() => {
    aplicarTema(temaSalvo() === 'escuro' ? 'claro' : 'escuro')
  }, [])

  return { tema, alternar }
}
