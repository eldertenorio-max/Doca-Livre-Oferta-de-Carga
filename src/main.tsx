import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { DataProvider } from './context/DataContext'
import App from './App'
import './index.css'

/**
 * Service worker para PWA / push — sem recarregar a página sozinho.
 * Novo deploy: o SW baixado fica em espera; só entra no próximo F5
 * (reload manual) do usuário, para não interromper formulários abertos.
 */
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Não chama updateSW(true) nem location.reload() —
    // a versão nova ativa só no próximo carregamento completo (F5).
  },
  onOfflineReady() {
    /* ok */
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return
    // Se já havia um SW em espera (usuário acabou de dar F5 após um deploy),
    // ativa sem forçar um segundo reload no meio da sessão.
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
    // Descobre updates em segundo plano (baixa o SW, fica waiting). Raro o suficiente.
    window.setInterval(() => {
      void registration.update()
    }, 5 * 60_000)
  },
})

// Mantém referência se a API do plugin exigir (evita tree-shake do updateSW).
void updateSW

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
