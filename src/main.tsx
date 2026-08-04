import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { DataProvider } from './context/DataContext'
import App from './App'
import './index.css'

/**
 * Cache/SW antigos travavam o app na versão sem setas da galeria.
 * Roda UMA vez por navegador: limpa SW + caches e recarrega.
 * Depois: novos deploys só entram no F5 (não interrompe o trabalho a cada push).
 */
const CACHE_BUST = 'oferta-galeria-setas-v2-20260804'

async function limparCacheTravadoUmaVez(): Promise<'reload' | 'ok'> {
  if (typeof window === 'undefined') return 'ok'
  const key = `doca-cache-bust:${CACHE_BUST}`
  try {
    if (localStorage.getItem(key)) return 'ok'
    localStorage.setItem(key, '1')
  } catch {
    /* private mode */
  }

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
  } catch {
    /* ignore */
  }
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* ignore */
  }

  // Evita loop se o storage falhar
  try {
    if (sessionStorage.getItem(`${key}:done`)) return 'ok'
    sessionStorage.setItem(`${key}:done`, '1')
  } catch {
    /* ignore */
  }

  window.location.reload()
  return 'reload'
}

function bootApp() {
  /**
   * SW para PWA/push.
   * - Em uso (sessão): não recarrega sozinho.
   * - No F5 / abertura: se houver versão waiting, aplica e recarrega uma vez.
   */
  let reloadAposF5 = true
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Deploy no meio da sessão: só fica “pronto”.
      // Se o app acabou de abrir (F5), aplica agora.
      if (reloadAposF5 && performance.now() < 12_000) {
        void updateSW(true)
        return
      }
      try {
        sessionStorage.setItem('doca-sw-pending', '1')
      } catch {
        /* ignore */
      }
    },
    onOfflineReady() {
      /* ok */
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return

      const pending =
        Boolean(registration.waiting) ||
        (() => {
          try {
            return sessionStorage.getItem('doca-sw-pending') === '1'
          } catch {
            return false
          }
        })()

      if (pending && registration.waiting) {
        try {
          sessionStorage.removeItem('doca-sw-pending')
        } catch {
          /* ignore */
        }
        // Ativa SW em espera (usuário fez F5 ou abriu aba)
        void updateSW(true)
      }

      // Baixa versão nova em background (fica waiting até o F5)
      void registration.update()
      window.setInterval(() => {
        void registration.update()
      }, 2 * 60_000)

      // Depois de alguns segundos, não forçar reload se onNeedRefresh vier no meio do uso
      window.setTimeout(() => {
        reloadAposF5 = false
      }, 12_000)
    },
  })

  void updateSW

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HashRouter>
        <DataProvider>
          <App />
        </DataProvider>
      </HashRouter>
    </StrictMode>,
  )
}

void limparCacheTravadoUmaVez().then((result) => {
  if (result === 'reload') return
  bootApp()
})
