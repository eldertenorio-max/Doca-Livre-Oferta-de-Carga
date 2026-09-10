import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { contarNotificacoesNaoLidas } from '../../lib/feedStore'
import { LOGO_DOCA_LIVRE_SRC } from '../../lib/brandAssets'
import { ProductMark } from './ProductMark'
import '../../styles/shell.css'

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M8 15v-4M12 15V8M16 15v-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function IconKanban() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="5.5" height="16" rx="1.2" stroke="currentColor" strokeWidth="1.75" />
      <rect x="9.25" y="4" width="5.5" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.75" />
      <rect x="15.5" y="4" width="5.5" height="14" rx="1.2" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function IconHierarchy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="6" cy="19" r="2.2" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="18" cy="19" r="2.2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 7.2v4.3M12 11.5H6.2V16.8M12 11.5h5.8V16.8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function IconProfile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5 19.2c1.4-3.2 3.9-4.8 7-4.8s5.6 1.6 7 4.8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function IconFeed() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 4.8h14v3.2H5zM5 10.4h14V20H5z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M8 13.2h8M8 16.4h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
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

function formatClock(d: Date) {
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return { time, date }
}

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { sessao, logout, minhaEmpresa } = useAuth()
  const [sidebarPinned, setSidebarPinned] = useState(true)
  const [sidebarHover, setSidebarHover] = useState(false)
  const [isNarrow, setIsNarrow] = useState(false)
  const [clock, setClock] = useState(() => formatClock(new Date()))
  const [menuAberto, setMenuAberto] = useState(false)
  const [naoLidas, setNaoLidas] = useState(0)

  const iniciais = (sessao?.nome || 'DL')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'DL'

  const papelLabel = sessao?.isSuper
    ? 'Superusuário'
    : sessao?.nivelHierarquia === 'gestor'
      ? 'Gestor'
      : 'Operador'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    const id = window.setInterval(() => setClock(formatClock(new Date())), 30_000)
    const onResize = () => setIsNarrow(window.innerWidth <= 900)
    onResize()
    window.addEventListener('resize', onResize)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    if (!sessao?.usuario) return
    let ativo = true
    async function tick() {
      const n = await contarNotificacoesNaoLidas(sessao!.usuario)
      if (ativo) setNaoLidas(n)
    }
    void tick()
    const id = window.setInterval(() => void tick(), 25_000)
    return () => {
      ativo = false
      window.clearInterval(id)
    }
  }, [sessao?.usuario])

  const sidebarWide = sidebarPinned || (sidebarHover && !isNarrow)

  function toggleSidebarPin() {
    setSidebarPinned((v) => !v)
    setSidebarHover(false)
  }

  return (
    <div className="app-shell">
      <header className="app-topbar" aria-label="Barra principal">
        <div className="app-topbar-left">
          <button
            type="button"
            className="app-topbar-menu"
            onClick={toggleSidebarPin}
            aria-label={sidebarPinned ? 'Recolher menu lateral' : 'Fixar menu expandido'}
            aria-pressed={sidebarPinned}
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
            className={`app-topbar-refresh${location.pathname.endsWith('/notificacoes') ? ' is-on' : ''}`}
            onClick={() => navigate('/embarcador/mapa-logistica/feed/notificacoes')}
            title="Notificações"
            aria-label={naoLidas > 0 ? `Notificações, ${naoLidas} não lidas` : 'Notificações'}
          >
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden>
              <path
                d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M9.5 17a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            {naoLidas > 0 ? (
              <span className="app-topbar-bell-badge">{naoLidas > 9 ? '9+' : naoLidas}</span>
            ) : null}
          </button>
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
          <div className="app-topbar-user-wrap">
            <button
              type="button"
              className="app-topbar-user"
              aria-label="Conta"
              aria-expanded={menuAberto}
              onClick={() => setMenuAberto((v) => !v)}
            >
              <div className="app-topbar-user-text">
                <strong>{sessao?.nome || 'Doca Livre'}</strong>
                <span>
                  {papelLabel}
                  {sessao?.superior ? ` · ${sessao.superior}` : ''}
                </span>
              </div>
              <span className="app-topbar-avatar" aria-hidden>
                <span className="app-topbar-avatar-iniciais">{iniciais}</span>
              </span>
            </button>
            {menuAberto ? (
              <div className="app-topbar-avatar-menu">
                <p className="app-topbar-avatar-menu__hint">
                  {sessao?.isSuper
                    ? 'Acesso total ao sistema'
                    : `Hierarquia: ${papelLabel}${sessao?.superior ? ` · ${sessao.superior}` : ''}`}
                </p>
                {minhaEmpresa ? (
                  <button
                    type="button"
                    className="app-topbar-avatar-menu__btn"
                    onClick={() => {
                      setMenuAberto(false)
                      navigate('/embarcador/mapa-logistica/perfil')
                    }}
                  >
                    Meu perfil
                  </button>
                ) : null}
                <button
                  type="button"
                  className="app-topbar-avatar-menu__btn app-topbar-avatar-menu__btn--danger"
                  onClick={() => {
                    setMenuAberto(false)
                    logout()
                    navigate('/login')
                  }}
                >
                  Sair
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="app-workspace">
        {sidebarHover && !sidebarPinned && !isNarrow && <div className="sidebar-rail" aria-hidden />}
        {sidebarPinned && isNarrow && (
          <button
            type="button"
            className="app-workspace-backdrop"
            aria-label="Fechar menu"
            onClick={() => setSidebarPinned(false)}
          />
        )}
        <aside
          className={[
            'sidebar',
            sidebarWide ? 'sidebar--wide' : '',
            sidebarPinned ? 'sidebar--pinned' : '',
            sidebarHover && !sidebarPinned ? 'sidebar--flyout' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onMouseEnter={() => {
            if (!isNarrow) setSidebarHover(true)
          }}
          onMouseLeave={() => setSidebarHover(false)}
        >
          <nav className="sidebar-body" aria-label="Menu principal">
            {[
              ...(sessao?.isSuper
                ? [
                    { to: '/painel', label: 'Painel', icon: <IconChart />, end: true, badge: 0 },
                    { to: '/hierarquia', label: 'Hierarquia', icon: <IconHierarchy />, end: false, badge: 0 },
                    { to: '/kanban', label: 'Kanban de empresas', icon: <IconKanban />, end: false, badge: 0 },
                  ]
                : []),
              ...(minhaEmpresa
                ? [{ to: '/perfil', label: 'Meu perfil', icon: <IconProfile />, end: true, badge: 0 }]
                : []),
              { to: '/feed', label: 'Feed notícias', icon: <IconFeed />, end: false, badge: 0 },
              { to: '/embarcador/mapa-logistica', label: 'Mapa', icon: <IconMap />, end: false, badge: 0 },
            ].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => {
                  if (isNarrow) setSidebarPinned(false)
                }}
                className={({ isActive }) =>
                  ['sidebar-section', isActive ? 'sidebar-section--open' : ''].filter(Boolean).join(' ')
                }
              >
                {({ isActive }) => (
                  <span className={`sidebar-section-trigger${isActive ? ' active' : ''}`}>
                    <span className="sidebar-section-icon">{item.icon}</span>
                    <span className="sidebar-section-title">{item.label}</span>
                    {item.badge ? <span className="sidebar-section-badge">{item.badge > 9 ? '9+' : item.badge}</span> : null}
                    <span className={`sidebar-section-chevron${isActive ? ' sidebar-section-chevron--open' : ''}`}>
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
