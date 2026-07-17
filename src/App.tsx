import { useCallback, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useData } from './context/DataContext'
import { AppLayout } from './components/layout/AppLayout'
import { CompanySplash } from './components/CompanySplash'
import { LoginPage } from './pages/Login'
import { CadastroTransportadorPage } from './pages/CadastroTransportador'
import { KanbanMinerva } from './pages/minerva/KanbanMinerva'
import { RotasPage } from './pages/minerva/Rotas'
import { TransportadoresPage } from './pages/minerva/Transportadores'
import { GruposPage } from './pages/minerva/Grupos'
import { IndicadoresPage } from './pages/minerva/Indicadores'
import { ConfiguracoesPage } from './pages/minerva/Configuracoes'
import { HistoricoPage } from './pages/minerva/Historico'
import { VeiculosPage } from './pages/minerva/Veiculos'
import { MotoristasPage } from './pages/minerva/Motoristas'
import { PortalConfigPage } from './pages/minerva/PortalConfig'
import { KanbanTransportador } from './pages/transportador/KanbanTransportador'
import type { UserRole } from './types'

function Protected({ role, children }: { role?: UserRole | UserRole[]; children: React.ReactNode }) {
  const { user } = useData()
  if (!user) return <Navigate to="/login" replace />
  if (user.is_superuser || user.role === 'super') return children
  if (role) {
    const roles = Array.isArray(role) ? role : [role]
    if (!roles.includes(user.role)) {
      return <Navigate to={user.role === 'transportador' ? '/transportador' : '/minerva'} replace />
    }
  }
  return children
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false)

  const handleSplashComplete = useCallback(() => {
    setSplashDone(true)
  }, [])

  if (!splashDone) {
    return <CompanySplash onComplete={handleSplashComplete} />
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/cadastro-transportador" element={<CadastroTransportadorPage />} />
      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route
          path="/minerva"
          element={
            <Protected role={['minerva', 'super']}>
              <KanbanMinerva />
            </Protected>
          }
        />
        <Route
          path="/minerva/rotas"
          element={
            <Protected role={['minerva', 'super']}>
              <RotasPage />
            </Protected>
          }
        />
        <Route
          path="/minerva/transportadores"
          element={
            <Protected role={['minerva', 'super']}>
              <TransportadoresPage />
            </Protected>
          }
        />
        <Route
          path="/minerva/veiculos"
          element={
            <Protected role={['minerva', 'super', 'transportador']}>
              <VeiculosPage />
            </Protected>
          }
        />
        <Route
          path="/minerva/motoristas"
          element={
            <Protected role={['minerva', 'super', 'transportador']}>
              <MotoristasPage />
            </Protected>
          }
        />
        <Route
          path="/minerva/grupos"
          element={
            <Protected role={['minerva', 'super']}>
              <GruposPage />
            </Protected>
          }
        />
        <Route
          path="/minerva/indicadores"
          element={
            <Protected role={['minerva', 'super']}>
              <IndicadoresPage />
            </Protected>
          }
        />
        <Route
          path="/minerva/configuracoes"
          element={
            <Protected role={['minerva', 'super']}>
              <ConfiguracoesPage />
            </Protected>
          }
        />
        <Route
          path="/minerva/historico"
          element={
            <Protected role={['minerva', 'super']}>
              <HistoricoPage />
            </Protected>
          }
        />
        <Route
          path="/minerva/config"
          element={
            <Protected>
              <PortalConfigPage />
            </Protected>
          }
        />
        <Route
          path="/transportador"
          element={
            <Protected role={['transportador', 'super']}>
              <KanbanTransportador />
            </Protected>
          }
        />
        <Route
          path="/transportador/veiculos"
          element={
            <Protected role={['transportador', 'super']}>
              <VeiculosPage />
            </Protected>
          }
        />
        <Route
          path="/transportador/motoristas"
          element={
            <Protected role={['transportador', 'super']}>
              <MotoristasPage />
            </Protected>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
