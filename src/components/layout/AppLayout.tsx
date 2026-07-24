import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { BRAND_EMBARCADOR_LABEL, LOGO_DOCA_LIVRE_SRC } from '../../lib/brandAssets'
import { ProductMark } from '../ProductMark'
import { ChatModal } from '../carga/ChatModal'
import { canOpenModulo, moduloFromPath } from '../../lib/portalModules'
import { PERFIL_OPERACIONAL_LABEL } from '../../lib/perfisOperacionais'
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

function IconWallet() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v1.5M3 7.5V17a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5.5a1.5 1.5 0 0 0-1.5-1.5H15a2 2 0 1 0 0 4h4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 7.5h15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

const minervaLinks: NavItem[] = [
  { to: '/minerva', label: 'Kanban Cargas', icon: <IconGrid />, end: true },
  { to: '/minerva/mapa-frota', label: 'Mapa da Frota', icon: <IconMap /> },
  { to: '/minerva/rotas', label: 'Rotas', icon: <IconMap /> },
  { to: '/minerva/transportadores', label: 'Transportadoras', icon: <IconUsers /> },
  { to: '/minerva/veiculos', label: 'Veículos', icon: <IconTruck /> },
  { to: '/minerva/motoristas', label: 'Motoristas', icon: <IconUsers /> },
  { to: '/minerva/grupos', label: 'Grupos', icon: <IconGroups /> },
  { to: '/minerva/indicadores', label: 'Indicadores', icon: <IconChart /> },
  { to: '/minerva/financeiro', label: 'Financeiro', icon: <IconWallet /> },
  { to: '/minerva/configuracoes', label: 'Configurações', icon: <IconShield /> },
  { to: '/minerva/historico', label: 'Histórico', icon: <IconChart /> },
  { to: '/minerva/config', label: 'Portal / Permissões', icon: <IconShield /> },
]

const transportadorLinks: NavItem[] = [
  { to: '/transportador/painel', label: 'Painel', icon: <IconChart /> },
  { to: '/transportador', label: 'Kanban Ofertas', icon: <IconGrid />, end: true },
  { to: '/minerva/mapa-frota', label: 'Mapa da Frota', icon: <IconMap /> },
  { to: '/transportador/veiculos', label: 'Meus Veículos', icon: <IconTruck /> },
  { to: '/transportador/motoristas', label: 'Meus Motoristas', icon: <IconUsers /> },
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
  const {
    user,
    logout,
    cargas,
    notificacoes,
    marcarNotificacaoLida,
    marcarTodasNotificacoesLidas,
    actingTransportadorId,
  } = useData()
  const navigate = useNavigate()
  /** Fixado expandido pelos 3 riscos; senão só ícones e hover abre temporário */
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const [sidebarHover, setSidebarHover] = useState(false)
  const hoverTimerRef = useRef<number | null>(null)
  const hoverLockedUntilRef = useRef(0)
  const sidebarWide = sidebarPinned || sidebarHover
  const [clock, setClock] = useState(() => formatClock(new Date()))
  const [notifOpen, setNotifOpen] = useState(false)
  const [chatCargaId, setChatCargaId] = useState<string | null>(null)
  const notifWrapRef = useRef<HTMLDivElement>(null)

  function clearHoverTimer() {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }

  function isNarrowViewport() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
  }

  function openSidebarHover() {
    if (sidebarPinned) return
    /* No mobile/tablet o menu abre só pelo botão (hover atrapalha o toque) */
    if (isNarrowViewport()) return
    if (Date.now() < hoverLockedUntilRef.current) return
    clearHoverTimer()
    hoverTimerRef.current = window.setTimeout(() => {
      setSidebarHover(true)
      hoverTimerRef.current = null
    }, 120)
  }

  function closeSidebarHover() {
    clearHoverTimer()
    setSidebarHover(false)
  }

  function toggleSidebarPin() {
    setSidebarPinned((pinned) => {
      if (pinned) {
        // Recolhe de verdade (evita ficar aberto sob o cursor)
        hoverLockedUntilRef.current = Date.now() + 400
        clearHoverTimer()
        setSidebarHover(false)
        return false
      }
      setSidebarHover(false)
      return true
    })
  }

  useEffect(() => () => clearHoverTimer(), [])

  useEffect(() => {
    if (!notifOpen) return
    function onPointerDown(e: MouseEvent) {
      if (!notifWrapRef.current?.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setNotifOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [notifOpen])

  const chatCarga = useMemo(
    () => (chatCargaId ? (cargas ?? []).find((c) => c.id === chatCargaId) ?? null : null),
    [chatCargaId, cargas],
  )

  const isSuper =
    Boolean(user?.is_superuser) ||
    user?.role === 'super' ||
    isLocalSuperUser(user?.usuario ?? '') ||
    isLocalSuperUser(user?.email ?? '')

  const minhasNotifs = useMemo(() => {
    if (!user) return []
    const tid = actingTransportadorId || user.transportador_id
    return (notificacoes ?? [])
      .filter((n) => {
        // Super vê tudo (inclui chat do embarcador e do transportador)
        if (isSuper) return true
        if (n.user_id && n.user_id === user.id) return true
        if (n.transportador_id && tid && n.transportador_id === tid) return true
        if (n.role === 'todos') return true
        if (n.role === 'minerva' && (user.role === 'minerva' || user.role === 'super')) return true
        if (n.role === 'transportador' && user.role === 'transportador' && !n.transportador_id) {
          return true
        }
        if (n.role && n.role === user.role) return true
        if (!n.user_id && !n.transportador_id && !n.role) {
          return user.role === 'minerva' || user.is_superuser
        }
        return false
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 40)
  }, [notificacoes, user, actingTransportadorId, isSuper])

  const unread = minhasNotifs.filter((n) => !n.lida).length

  const links = useMemo(() => {
    if (isSuper) {
      return [
        ...minervaLinks,
        { to: '/transportador/painel', label: 'Painel Transportador', icon: <IconChart /> },
        { to: '/transportador', label: 'Kanban Transportador', icon: <IconGrid />, end: true },
      ]
    }
    if (user?.role === 'minerva') {
      const base = [
        ...minervaLinks,
        { to: '/transportador/painel', label: 'Painel Transportador', icon: <IconChart /> },
        { to: '/transportador', label: 'Kanban Transportador', icon: <IconGrid />, end: true },
      ]
      return base.filter((item) => {
        if (item.to === '/minerva/config' || item.to === '/minerva/financeiro') return false
        const mod = moduloFromPath(item.to)
        if (!mod) return true
        return canOpenModulo(user?.permissoes_modulos, mod)
      })
    }
    const base = user?.role === 'transportador' ? transportadorLinks : minervaLinks
    return base.filter((item) => {
      // Super-only
      if (item.to === '/minerva/config' || item.to === '/minerva/financeiro') return false
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
      ? user.perfil_operacional
        ? `${BRAND_EMBARCADOR_LABEL} · ${PERFIL_OPERACIONAL_LABEL[user.perfil_operacional]}`
        : BRAND_EMBARCADOR_LABEL
      : 'Transportador'

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
            title={
              sidebarPinned
                ? 'Recolher menu (volta a só ícones)'
                : 'Expandir e fixar menu'
            }
          >
            <span className="app-topbar-menu-icon" aria-hidden />
          </button>

          <div className="app-topbar-brand">
            <img src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" className="app-topbar-logo" />
            <ProductMark size="md" className="app-topbar-wms" />
          </div>
        </div>

        <div className="app-topbar-right">
          <div className="app-topbar-notif-wrap" ref={notifWrapRef}>
            <button
              type="button"
              className="app-topbar-refresh"
              onClick={() => setNotifOpen((v) => !v)}
              title="Notificações"
              aria-label="Notificações"
              aria-expanded={notifOpen}
            >
              <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden>
                <path
                  d="M15 17H9m6 0a3 3 0 0 1-6 0m6 0h2.2c.9 0 1.3 0 1.5-.16.2-.14.35-.4.4-.7.05-.32-.1-.7-.4-1.45L17 12.5V10a5 5 0 1 0-10 0v2.5l-.7 2.2c-.3.74-.45 1.12-.4 1.44.05.3.2.56.4.7.2.16.6.16 1.5.16H9"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {unread > 0 && <span className="app-topbar-notif-badge">{unread > 9 ? '9+' : unread}</span>}
            </button>
            {notifOpen && (
              <div className="app-topbar-notif-panel" role="dialog" aria-label="Lista de notificações">
                <div className="app-topbar-notif-head">
                  <strong>Notificações</strong>
                  {unread > 0 && (
                    <button
                      type="button"
                      className="app-topbar-notif-mark"
                      onClick={() => marcarTodasNotificacoesLidas()}
                    >
                      Marcar todas lidas
                    </button>
                  )}
                </div>
                <ul className="app-topbar-notif-list">
                  {minhasNotifs.length === 0 && (
                    <li className="app-topbar-notif-empty">Nenhuma notificação.</li>
                  )}
                  {minhasNotifs.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={`app-topbar-notif-item${n.lida ? '' : ' app-topbar-notif-item--unread'}`}
                        onClick={() => {
                          if (!n.lida) marcarNotificacaoLida(n.id)
                          if (n.carga_id) {
                            const c = (cargas ?? []).find((x) => x.id === n.carga_id)
                            if (c) {
                              setNotifOpen(false)
                              setChatCargaId(c.id)
                            }
                          }
                        }}
                      >
                        <strong>{n.titulo}</strong>
                        <span>{n.mensagem}</span>
                        {n.carga_id ? (
                          <span className="app-topbar-notif-action">Abrir chat</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

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
        {/* Reserva a coluna de ícones enquanto o menu flutua no hover */}
        {sidebarHover && !sidebarPinned && <div className="sidebar-rail" aria-hidden />}
        {sidebarPinned && (
          <button
            type="button"
            className="app-workspace-backdrop"
            aria-label="Fechar menu"
            onClick={() => toggleSidebarPin()}
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
          onMouseEnter={openSidebarHover}
          onMouseLeave={closeSidebarHover}
          title={
            !sidebarWide
              ? 'Passe o mouse para ver os nomes'
              : sidebarPinned
                ? 'Menu fixado expandido'
                : undefined
          }
        >
          <nav className="sidebar-body" aria-label="Menu principal">
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={!sidebarWide ? item.label : undefined}
                onClick={() => {
                  if (sidebarPinned && isNarrowViewport()) {
                    hoverLockedUntilRef.current = Date.now() + 400
                    clearHoverTimer()
                    setSidebarHover(false)
                    setSidebarPinned(false)
                  }
                }}
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

      <ChatModal
        carga={chatCarga}
        open={!!chatCarga}
        onClose={() => setChatCargaId(null)}
      />
    </div>
  )
}
