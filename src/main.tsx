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
const BUILD_ID = 'hierarquia-sem-super-v63'

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
  // autoUpdate: garante que o deploy com setas chegue nas abas
  // onNeedRefresh só recarrega se a aba estiver oculta ou recém aberta (não no meio do form)
  let quietUntil = Date.now() + 15_000
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      const abaOculta = document.visibilityState === 'hidden'
      const recemAberto = Date.now() < quietUntil
      if (abaOculta || recemAberto) {
        void updateSW(true)
      }
      // senão: próximo F5 — onRegisteredSW aplica waiting
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
