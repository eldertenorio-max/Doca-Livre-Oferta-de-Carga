import { lazy, Suspense, type ReactNode, useEffect, useMemo } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { motivoBloqueioPublico } from './lib/publicoProtecao'
import { PublicoBloqueio } from './components/publico/PublicoBloqueio'
import { urlSistemaComHash } from './lib/siteOfertaDeCarga'

const CalcularRotaPublicoPage = lazy(() =>
  import('./pages/publico/CalcularRotaPublico').then((m) => ({
    default: m.CalcularRotaPublicoPage,
  })),
)

const FreteMinimoPublicoPage = lazy(() =>
  import('./pages/publico/FreteMinimoPublico').then((m) => ({
    default: m.FreteMinimoPublicoPage,
  })),
)

const MapaFrotaPublicoPage = lazy(() =>
  import('./pages/publico/MapaFrotaPublico').then((m) => ({
    default: m.MapaFrotaPublicoPage,
  })),
)

const LogisticaMapaPage = lazy(() =>
  import('./logistica/pages/Mapa').then((m) => ({ default: m.MapaPage })),
)

const LogisticaAuthProvider = lazy(() =>
  import('./logistica/lib/AuthContext').then((m) => ({ default: m.AuthProvider })),
)

function RedirectKeepSearch({ to }: { to: string }) {
  const loc = useLocation()
  return <Navigate to={{ pathname: to, search: loc.search }} replace />
}

function RedirectToSistema({ to }: { to?: string }) {
  const loc = useLocation()
  const url = urlSistemaComHash((to ?? loc.pathname) + loc.search)
  useEffect(() => {
    window.location.replace(url)
  }, [url])
  return (
    <p style={{ padding: 24, fontWeight: 700 }}>
      Abrindo o sistema em ofertadecargas.docalivre.com.br…
    </p>
  )
}

function PublicoGuard({ children }: { children: ReactNode }) {
  const loc = useLocation()
  const motivo = useMemo(
    () => motivoBloqueioPublico(),
    [loc.pathname, loc.search, loc.hash],
  )
  if (motivo) return <PublicoBloqueio motivo={motivo} />
  return children
}

function Carregando() {
  return (
    <p
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        margin: 0,
        fontWeight: 800,
        background: '#efe8dc',
        color: '#0f172a',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      Carregando…
    </p>
  )
}

export default function PublicApp() {
  const host = typeof window === 'undefined' ? '' : window.location.hostname.toLowerCase().replace(/^www\./, '')

  if (host === 'mapadafrota.com.br') {
    return (
      <PublicoGuard>
        <Suspense fallback={<Carregando />}>
          <Routes>
            <Route path="/" element={<MapaFrotaPublicoPage />} />
            <Route path="/mapa" element={<Navigate to="/" replace />} />
            <Route path="*" element={<RedirectToSistema />} />
          </Routes>
        </Suspense>
      </PublicoGuard>
    )
  }

  if (host === 'mapadalogistica.com.br') {
    return (
      <PublicoGuard>
        <Suspense fallback={<Carregando />}>
          <LogisticaAuthProvider>
            <Routes>
              <Route path="/" element={<LogisticaMapaPage publico />} />
              <Route path="/mapa" element={<Navigate to="/" replace />} />
              <Route path="/app" element={<Navigate to="/" replace />} />
              <Route path="/app/mapa" element={<Navigate to="/" replace />} />
              <Route path="/app/*" element={<Navigate to="/" replace />} />
              <Route path="/cadastro" element={<RedirectToSistema to="/cadastro-logistica" />} />
              <Route path="/cadastro-logistica" element={<RedirectToSistema to="/cadastro-logistica" />} />
              <Route path="*" element={<RedirectToSistema />} />
            </Routes>
          </LogisticaAuthProvider>
        </Suspense>
      </PublicoGuard>
    )
  }

  return (
    <PublicoGuard>
      <Suspense fallback={<Carregando />}>
        <Routes>
          <Route path="/" element={<CalcularRotaPublicoPage />} />
          <Route path="/diego-lab" element={<CalcularRotaPublicoPage />} />
          <Route path="/rota" element={<RedirectKeepSearch to="/" />} />
          <Route path="/calcular-rota" element={<RedirectKeepSearch to="/" />} />
          <Route path="/frete-minimo" element={<FreteMinimoPublicoPage />} />
          <Route path="*" element={<RedirectToSistema />} />
        </Routes>
      </Suspense>
    </PublicoGuard>
  )
}
