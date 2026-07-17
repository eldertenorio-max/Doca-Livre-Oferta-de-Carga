import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { BRAND_EMBARCADOR_LABEL, LOGO_DOCA_LIVRE_SRC } from '../../lib/brandAssets'
import { ProductMark } from '../ProductMark'
import { canOpenModulo, moduloFromPath } from '../../lib/portalModules'
import { isLocalSuperUser } from '../../lib/superUsers'
import '../../styles/shell.css'

type NavItem = {
  to: string
  label: string
  end?: boolean
  icon: React.ReactNode
}

function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function IconMap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 19c0-3 2.5-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M16 14.5c2.5.3 5 1.8 5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function IconGroups() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="8" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="16" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 19c0-2.5 2-4 5-4M16 15c3 0 5 1.5 5 4M12 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M8 15v-4M12 15V8M16 15v-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function IconTruck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M1 16V7h11v9M12 10h4l3 3v3h-7" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <circle cx="5.5" cy="16.5" r="1.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="16.5" cy="16.5" r="1.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3 5 6v6c0 5 3.5 8 7 9 3.5-1 7-4 7-9V6l-7-3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  )
}

const minervaLinks: NavItem[] = [
  { to: '/minerva', label: 'Kanban Cargas', icon: <IconGrid />, end: true },
  { to: '/minerva/rotas', label: 'Rotas', icon: <IconMap /> },
  { to: '/minerva/transportadores', label: 'Transportadoras', icon: <IconUsers /> },
  { to: '/minerva/veiculos', label: 'Veículos', icon: <IconTruck /> },
  { to: '/minerva/grupos', label: 'Grupos', icon: <IconGroups /> },
  { to: '/minerva/indicadores', label: 'Indicadores', icon: <IconChart /> },
  { to: '/minerva/config', label: 'Portal / Permissões', icon: <IconShield /> },
]

const transportadorLinks: NavItem[] = [
  { to: '/transportador', label: 'Kanban Ofertas', icon: <IconTruck />, end: true },
  { to: '/transportador/veiculos', label: 'Meus Veículos', icon: <IconTruck /> },
]

function formatClock(now: Date) {
  return {
    time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    date: now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  }
}

function iniciais(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'DL'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function AppLayout() {
  const { user, logout } = useData()
  const navigate = useNavigate()
  const [sidebarWide, setSidebarWide] = useState(true)
  const [clock, setClock] = useState(() => formatClock(new Date()))

  const isSuper =
    Boolean(user?.is_superuser) ||
    user?.role === 'super' ||
    isLocalSuperUser(user?.usuario ?? '') ||
    isLocalSuperUser(user?.email ?? '')

  const links = useMemo(() => {
    const base =
      user?.role === 'transportador' && !isSuper ? transportadorLinks : minervaLinks
    return base.filter((item) => {
      if (item.to === '/minerva/config') return isSuper
      if (isSuper) return true
      const mod = moduloFromPath(item.to)
      if (!mod) return true
      return canOpenModulo(user?.permissoes_modulos, mod)
    })
  }, [user, isSuper])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    const id = window.setInterval(() => setClock(formatClock(new Date())), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const roleLabel = isSuper
    ? 'Super Usuário'
    : user?.role === 'minerva'
      ? BRAND_EMBARCADOR_LABEL
      : 'Transportador'

  return (
    <div className="app-shell">
      <header className="app-topbar" aria-label="Barra principal">
        <div className="app-topbar-left">
          <button
            type="button"
            className="app-topbar-menu"
            onClick={() => setSidebarWide((v) => !v)}
            aria-label={sidebarWide ? 'Recolher menu lateral' : 'Abrir menu lateral'}
            aria-pressed={sidebarWide}
            title={sidebarWide ? 'Recolher menu' : 'Abrir menu'}
          >
            <span className="app-topbar-menu-icon" aria-hidden />
          </button>

          <div className="app-topbar-brand">
            <img src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" className="app-topbar-logo" />
            <ProductMark size="md" className="app-topbar-wms" />
          </div>
        </div>

        <div className="app-topbar-right">
          <button
            type="button"
            className="app-topbar-refresh"
            onClick={() => window.location.reload()}
            title="Atualizar página"
            aria-label="Atualizar página"
          >
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden>
              <path d="M20 6v5h-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M19 11a7 7 0 1 0-2.05 4.95" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="app-topbar-meta" aria-label="Data e hora">
            <span className="app-topbar-meta-time">{clock.time}</span>
            <span className="app-topbar-meta-date">{clock.date}</span>
            <span className="app-topbar-meta-version">v1.0</span>
          </div>

          <div className="app-topbar-user" role="group" aria-label="Usuário">
            <div className="app-topbar-user-text">
              <strong>{user?.nome ?? 'Doca Livre'}</strong>
              <span>{roleLabel}</span>
            </div>
            <span className="app-topbar-avatar" aria-hidden>
              <span className="app-topbar-avatar-iniciais">{iniciais(user?.nome ?? 'DL')}</span>
            </span>
          </div>

          <button
            type="button"
            className="app-topbar-logout"
            onClick={() => {
              logout()
              navigate('/login')
            }}
          >
            Sair
          </button>
        </div>
      </header>

      <div className="app-workspace">
        <aside
          className={['sidebar', sidebarWide ? 'sidebar--wide' : ''].filter(Boolean).join(' ')}
          onMouseEnter={() => {
            if (!sidebarWide) setSidebarWide(true)
          }}
          title={!sidebarWide ? 'Passe o mouse para abrir o menu' : undefined}
        >
          <nav className="sidebar-body" aria-label="Menu principal">
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    'sidebar-section',
                    isActive ? 'sidebar-section--open' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                }
              >
                {({ isActive }) => (
                  <span className={`sidebar-section-trigger${isActive ? ' active' : ''}`}>
                    <span className="sidebar-section-icon">{item.icon}</span>
                    <span className="sidebar-section-title">{item.label}</span>
                    <span
                      className={[
                        'sidebar-section-chevron',
                        isActive ? 'sidebar-section-chevron--open' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      ›
                    </span>
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="main-panel">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
