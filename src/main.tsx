import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { DataProvider } from './context/DataContext'
import App from './App'
import './index.css'

// Service worker cedo — necessário para o Chrome oferecer “Instalar app”.
// onNeedRefresh: força atualização assim que houver build novo (evita tela travada em versão antiga).
const BUILD_STAMP = 'oferta7-20260803-veic-av'

async function hardRefreshApp() {
  const key = `doca-sw-refreshed:${BUILD_STAMP}`
  try {
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
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
  window.location.reload()
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateSW(true).then(() => {
      void hardRefreshApp()
    })
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return
    void registration.update()
    window.setInterval(() => {
      void registration.update()
    }, 30_000)
  },
})

// HashRouter: F5 em /#/login funciona no Render Static Site sem rewrite no painel.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <DataProvider>
        <App />
      </DataProvider>
    </HashRouter>
  </StrictMode>,
)
