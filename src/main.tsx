import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { DataProvider } from './context/DataContext'
import App from './App'
import './index.css'

// Service worker cedo — necessário para o Chrome oferecer “Instalar app”.
// onNeedRefresh: força atualização assim que houver build novo (evita tela travada em versão antiga).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateSW(true)
  },
  onRegisteredSW(_url, registration) {
    // Revisa atualização com frequência (PWA costuma ficar presa em build antigo).
    if (!registration) return
    void registration.update()
    window.setInterval(() => {
      void registration.update()
    }, 60_000)
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
