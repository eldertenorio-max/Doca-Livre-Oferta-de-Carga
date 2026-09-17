import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { isSiteOfertaDeCarga, isSitePublicoLimpo } from './lib/siteOfertaDeCarga'
import './index.css'

const BUILD_ID = 'rota-publico-cache-v299'

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

function mostrarFalha(erro: unknown) {
  const root = document.getElementById('root')
  if (!root) return
  const msg = erro instanceof Error ? erro.message : String(erro || 'erro')
  root.innerHTML = `<div style="min-height:100dvh;display:grid;place-items:center;padding:24px;background:#efe8dc;color:#0f172a;font-family:system-ui;text-align:center"><div><p style="margin:0 0 8px;font-weight:800">A calculadora não abriu.</p><p style="margin:0 0 16px;font-size:13px;color:#475569">${msg.replace(/[<>]/g, '')}</p><button type="button" id="doca-fail-retry" style="border:0;border-radius:10px;padding:10px 14px;background:#0f172a;color:#fff;font-weight:800;cursor:pointer">Tentar de novo</button></div></div>`
  document.getElementById('doca-fail-retry')?.addEventListener('click', () => location.reload())
}

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
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
    } catch {
      /* ignore */
    }
  })()
}

async function boot() {
  limparCacheMorto()
  const publico = isSitePublicoLimpo()
  const Router = publico ? BrowserRouter : HashRouter

  try {
    const appMod = await (publico ? import('./PublicApp') : import('./App'))
    if (!publico) {
      const { registerSW } = await import('virtual:pwa-register')
      registerSW({
        immediate: true,
        onRegisteredSW(_url, reg) {
          if (!reg) return
          void reg.update()
          window.setInterval(() => void reg.update(), 60_000)
        },
      })
    } else if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }

    const App = appMod.default
    const el = document.getElementById('root')
    if (!el) throw new Error('root')
    // Calculadora pública não carrega o Kanban (DataContext ~1 MB).
    const soCalculadora = publico && isSiteOfertaDeCarga()
    if (soCalculadora) {
      createRoot(el).render(
        <StrictMode>
          <AppErrorBoundary>
            <Router>
              <App />
            </Router>
          </AppErrorBoundary>
        </StrictMode>,
      )
    } else {
      const { DataProvider } = await import('./context/DataContext')
      createRoot(el).render(
        <StrictMode>
          <AppErrorBoundary>
            <Router>
              <DataProvider>
                <App />
              </DataProvider>
            </Router>
          </AppErrorBoundary>
        </StrictMode>,
      )
    }
    marcarBoot()
  } catch (e) {
    console.error('[boot]', e)
    mostrarFalha(e)
  }
}

void boot()
