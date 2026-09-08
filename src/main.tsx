import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { DataProvider } from './context/DataContext'
import App from './App'
import './index.css'

/**
 * Força novo bundle (setas da galeria). Depois do primeiro load limpo,
 * updates de deploy só no F5 (ver onNeedRefresh).
 */
const BUILD_ID = 'rota-publico-cache-v140'

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

  // Evita loop infinito se storage falhar
  try {
    if (sessionStorage.getItem(`reloaded:${BUILD_ID}`)) return false
    sessionStorage.setItem(`reloaded:${BUILD_ID}`, '1')
  } catch {
    /* continue */
  }

  const u = new URL(window.location.href)
  u.searchParams.set('_v', BUILD_ID)
  window.location.replace(u.toString())
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

void forceFreshOnce().then((reloading) => {
  if (!reloading) boot()
})
