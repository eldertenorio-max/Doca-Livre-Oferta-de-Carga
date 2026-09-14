import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { DataProvider } from './context/DataContext'
import App from './App'
import { isSitePublicoLimpo } from './lib/siteOfertaDeCarga'
import './index.css'

const BUILD_ID = 'rota-publico-cache-v193'

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (e) => {
    const m = e.reason instanceof Error ? e.reason.message : String(e.reason || '')
    if (m.includes('message channel closed') || m.includes('non-precached-url')) {
      e.preventDefault()
    }
  })
}

function marcarBoot() {
  try {
    document.getElementById('root')?.setAttribute('data-booted', '1')
  } catch {
    /* ignore */
  }
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

async function desligarSwPublico() {
  if (!('serviceWorker' in navigator)) return
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((r) => r.unregister()))
  } catch {
    /* ignore */
  }
}

function boot() {
  limparCacheMorto()
  marcarBoot()

  const publico = isSitePublicoLimpo()
  if (publico) {
    void desligarSwPublico()
  } else {
    registerSW({
      immediate: true,
      onRegisteredSW(_url, reg) {
        if (!reg) return
        void reg.update()
        window.setInterval(() => void reg.update(), 60_000)
      },
    })
  }

  const Router = publico ? BrowserRouter : HashRouter

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
