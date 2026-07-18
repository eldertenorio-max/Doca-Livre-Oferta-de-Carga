import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { DataProvider } from './context/DataContext'
import App from './App'
import './index.css'

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
