import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { DataProvider } from './context/DataContext'
import App from './App'
import { isSitePublicoLimpo } from './lib/siteOfertaDeCarga'
import './index.css'

/**
 * Força novo bundle. Depois do primeiro load limpo,
 * updates de deploy só no F5 (ver onNeedRefresh).
 */
const BUILD_ID = 'rota-publico-cache-v157'

async function forceFreshOnce(): Promise<boolean> {
  const key = `doca-build:${BUILD_ID}`
  try {
    if (localStorage.getItem(key) === 'ok') return false
  } catch {
    /* ignore */
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

  try {
    localStorage.setItem(key, 'ok')
  } catch {
    /* ignore */
  }

  try {
    if (sessionStorage.getItem(`reloaded:${BUILD_ID}`)) return false
    sessionStorage.setItem(`reloaded:${BUILD_ID}`, '1')
  } catch {
    /* continue */
  }

  if (isSitePublicoLimpo()) {
    window.location.replace(`${window.location.origin}/`)
  } else {
    window.location.replace(window.location.pathname + window.location.hash)
  }
  return true
}

function boot() {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateSW(true)
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return
      if (reg.waiting) void updateSW(true)
      void reg.update()
      window.setInterval(() => void reg.update(), 60_000)
    },
  })
  void updateSW

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

void forceFreshOnce().then((reloading) => {
  if (!reloading) boot()
})
