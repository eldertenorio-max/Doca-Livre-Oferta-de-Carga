import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useData } from './context/DataContext'
import { AppLayout } from './components/layout/AppLayout'
import { CompanySplash } from './components/CompanySplash'
import { LoginPage } from './pages/Login'
import { CadastroTransportadorPage } from './pages/CadastroTransportador'
import { KanbanMinerva } from './pages/minerva/KanbanMinerva'
import { ViagensEmbarcadorPage } from './pages/minerva/Viagens'
import { RotasPage } from './pages/minerva/Rotas'
import { TabelasFretePage } from './pages/minerva/TabelasFrete'
import { PontuacaoTransportadoresPage } from './pages/minerva/PontuacaoTransportadores'
import { TransportadoresPage } from './pages/minerva/Transportadores'
import { GruposPage } from './pages/minerva/Grupos'
import { IndicadoresPage } from './pages/minerva/Indicadores'
import { ConfiguracoesPage } from './pages/minerva/Configuracoes'
import { HistoricoPage } from './pages/minerva/Historico'
import { FinanceiroPage } from './pages/minerva/Financeiro'
import { VeiculosPage } from './pages/minerva/Veiculos'
import { MotoristasPage } from './pages/minerva/Motoristas'
import { PortalConfigPage } from './pages/minerva/PortalConfig'
import { KanbanTransportador } from './pages/transportador/KanbanTransportador'
import { KanbanTarefasPage } from './pages/transportador/KanbanTarefas'
import { ViagensTransportadorPage } from './pages/transportador/Viagens'
import { PainelTransportadorPage } from './pages/transportador/Painel'
import { ConfiguracoesTransportadorPage } from './pages/transportador/Configuracoes'
import { MapaFrotaPage } from './pages/minerva/MapaFrota'
import { MapaLogisticaPage } from './pages/minerva/MapaLogistica'
import { MapaFrotaPublicoPage } from './pages/publico/MapaFrotaPublico'
import { CalcularRotaPublicoPage } from './pages/publico/CalcularRotaPublico'
import {
  devePularSplash,
  isSiteMapaFrota,
  isSiteOfertaDeCarga,
  urlSistemaComHash,
} from './lib/siteOfertaDeCarga'
import { PerfilPage } from './pages/Perfil'
import { PwaInstallBanner } from './components/PwaInstallBanner'
import { PushEnableBanner } from './components/PushEnableBanner'
import { isSuperSession } from './lib/superUsers'
import type { UserRole } from './types'

function MinervaToEmbarcadorRedirect() {
  const location = useLocation()
  const next = location.pathname.replace(/^\/minerva/, '/embarcador') + location.search + location.hash
  return <Navigate to={next} replace />
}

function RedirectToSistema() {
  const loc = useLocation()
  const url = urlSistemaComHash(loc.pathname + loc.search)
  useEffect(() => {
    window.location.replace(url)
  }, [url])
  return (
    <p style={{ padding: 24, fontWeight: 700 }}>
      Abrindo o sistema em ofertadecargas.docalivre.com.br…
    </p>
  )
}

function AppBanners() {
  const location = useLocation()
  if (location.pathname === '/mapa' || location.pathname === '/rota' || location.pathname === '/calcular-rota') {
    return null
  }
  return (
    <>
      <PwaInstallBanner />
      <PushEnableBanner />
    </>
  )
}

function Protected({ role, children }: { role?: UserRole | UserRole[]; children: React.ReactNode }) {
  const { user } = useData()
  if (!user) return <Navigate to="/login" replace />
  // Perfil da Configuração do Portal manda: transportador nunca passa como Super
  const isSuper = isSuperSession(user)
  if (isSuper) return children
  if (role) {
    const roles = Array.isArray(role) ? role : [role]
    if (!roles.includes(user.role)) {
      return <Navigate to={user.role === 'transportador' ? '/transportador' : '/embarcador'} replace />
    }
  }
  return children
}

export default function App() {
  const [splashDone, setSplashDone] = useState(() => devePularSplash())

  const handleSplashComplete = useCallback(() => {
    setSplashDone(true)
  }, [])

  if (!splashDone) {
    return <CompanySplash onComplete={handleSplashComplete} />
  }

  if (isSiteOfertaDeCarga()) {
    return (
      <Routes>
        <Route path="/" element={<CalcularRotaPublicoPage />} />
        <Route path="/rota" element={<Navigate to="/" replace />} />
        <Route path="/calcular-rota" element={<Navigate to="/" replace />} />
        <Route path="*" element={<RedirectToSistema />} />
      </Routes>
    )
  }

  if (isSiteMapaFrota()) {
    return (
      <Routes>
        <Route path="/" element={<MapaFrotaPublicoPage />} />
        <Route path="/mapa" element={<MapaFrotaPublicoPage />} />
        <Route path="*" element={<RedirectToSistema />} />
      </Routes>
    )
  }

  return (
    <>
      <AppBanners />
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/cadastro-transportador" element={<CadastroTransportadorPage />} />
      <Route path="/mapa" element={<MapaFrotaPublicoPage />} />
      <Route path="/rota" element={<CalcularRotaPublicoPage />} />
      <Route path="/calcular-rota" element={<CalcularRotaPublicoPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route
          path="/perfil"
          element={
            <Protected>
              <PerfilPage />
            </Protected>
          }
        />
        <Route
          path="/embarcador"
          element={
            <Protected role={['super']}>
              <KanbanMinerva />
            </Protected>
          }
        />
        <Route
          path="/embarcador/tarefas"
          element={
            <Protected role={['super']}>
              <KanbanTarefasPage />
            </Protected>
          }
        />
        <Route
          path="/embarcador/viagens"
          element={
            <Protected role={['super']}>
              <ViagensEmbarcadorPage />
            </Protected>
          }
        />
        <Route
          path="/embarcador/rotas"
          element={
            <Protected role={['super']}>
              <RotasPage />
            </Protected>
          }
        />
        <Route
          path="/embarcador/tabelas-frete"
          element={
            <Protected role={['super']}>
              <TabelasFretePage />
            </Protected>
          }
        />
        <Route
          path="/embarcador/pontuacao"
          element={
            <Protected role={['super']}>
              <PontuacaoTransportadoresPage />
            </Protected>
          }
        />
        <Route
          path="/embarcador/transportadores"
          element={
            <Protected role={['super']}>
              <TransportadoresPage />
            </Protected>
          }
        />
        <Route
          path="/embarcador/veiculos"
          element={
            <Protected role={['super', 'transportador']}>
              <VeiculosPage />
            </Protected>
          }
        />
        <Route
          path="/embarcador/motoristas"
          element={
            <Protected role={['super', 'transportador']}>
              <MotoristasPage />
            </Protected>
          }
        />
        <Route
          path="/embarcador/mapa-frota"
          element={
            <Protected role={['super']}>
              <MapaFrotaPage />
            </Protected>
          }
        />
        <Route
          path="/embarcador/mapa-logistica"
          element={
            <Protected role={['super']}>
              <MapaLogisticaPage />
            </Protected>
          }
        />
        <Route
          path="/embarcador/grupos"
          element={
            <Protected role={['super']}>
              <GruposPage />
            </Protected>
          }
        />
        <Route
          path="/embarcador/indicadores"
          element={
            <Protected role={['super']}>
              <IndicadoresPage />
            </Protected>
          }
        />
        <Route
          path="/embarcador/configuracoes"
          element={
            <Protected role={['super']}>
              <ConfiguracoesPage />
            </Protected>
          }
        />
        <Route
          path="/embarcador/historico"
          element={
            <Protected role={['super']}>
              <HistoricoPage />
            </Protected>
          }
        />
        <Route
          path="/embarcador/financeiro"
          element={
            <Protected role={['super']}>
              <FinanceiroPage />
            </Protected>
          }
        />
        <Route
          path="/embarcador/config"
          element={
            <Protected>
              <PortalConfigPage />
            </Protected>
          }
        />
        {/* Links antigos /minerva/* → /embarcador/* */}
        <Route path="/minerva/*" element={<MinervaToEmbarcadorRedirect />} />
        <Route path="/minerva" element={<Navigate to="/embarcador" replace />} />
        <Route
          path="/transportador"
          element={
            <Protected role={['transportador', 'super']}>
              <KanbanTransportador />
            </Protected>
          }
        />
        <Route
          path="/transportador/tarefas"
          element={
            <Protected role={['super']}>
              <Navigate to="/embarcador/tarefas" replace />
            </Protected>
          }
        />
        <Route
          path="/transportador/viagens"
          element={
            <Protected role={['transportador', 'super']}>
              <ViagensTransportadorPage />
            </Protected>
          }
        />
        <Route
          path="/transportador/painel"
          element={
            <Protected role={['transportador', 'super']}>
              <PainelTransportadorPage />
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
        <Route
          path="/transportador/configuracoes"
          element={
            <Protected role={['transportador', 'super']}>
              <ConfiguracoesTransportadorPage />
            </Protected>
          }
        />
      </Route>
      <Route
        path="*"
        element={<Navigate to="/login" replace />}
      />
    </Routes>
    </>
  )
}
