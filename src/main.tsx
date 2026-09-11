import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { DataProvider } from './context/DataContext'
import App from './App'
import { isSitePublicoLimpo } from './lib/siteOfertaDeCarga'
import './index.css'

const BUILD_ID = 'rota-publico-cache-v183'

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (e) => {
    const m = e.reason instanceof Error ? e.reason.message : String(e.reason || '')
    if (m.includes('message channel closed') || m.includes('non-precached-url')) {
      e.preventDefault()
    }
  })
}

/** Limpa cache velho sem recarregar — senão a primeira visita fica tela branca. */
function limparCacheMorto() {
  const key = `doca-build:${BUILD_ID}`
  try {
    if (localStorage.getItem(key) === 'ok') return
    localStorage.setItem(key, 'ok')
  } catch {
    /* ignore */
  }
  void (async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
    } catch {
      /* ignore */
    }
  })()
}

function boot() {
  limparCacheMorto()

  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return
      void reg.update()
      window.setInterval(() => void reg.update(), 60_000)
    },
  })

  const Router = isSitePublicoLimpo() ? BrowserRouter : HashRouter

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Router>
        <DataProvider>
          <App />
        </DataProvider>
      </Router>
    </StrictMode>,
  )
}

boot()
