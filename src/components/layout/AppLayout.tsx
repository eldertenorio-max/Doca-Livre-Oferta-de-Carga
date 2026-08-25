import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { LOGO_DOCA_LIVRE_SRC } from '../../lib/brandAssets'
import { ProductMark } from '../ProductMark'
import { ChatModal } from '../carga/ChatModal'
import { PerfilPanel } from './PerfilPanel'
import { ActionFlashHost } from '../ui/ActionFlashHost'
import { DisponibilidadeMapaFlag } from '../transportador/DisponibilidadeMapaFlag'
import { canOpenModulo, moduloFromPath } from '../../lib/portalModules'
import { isSuperSession } from '../../lib/superUsers'
import { canonicalTransportadorId } from '../../lib/transportadorIds'
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

function IconLocation() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s7-5.5 7-12a7 7 0 1 0-14 0c0 6.5 7 12 7 12z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.75" />
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

function IconStar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5 14.4 9l6.1.6-4.6 4 1.4 6-5.3-3.2L6.7 19.6l1.4-6-4.6-4L9.6 9 12 3.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
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

function IconRadar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 3a9 9 0 0 1 9 9M12 6a6 6 0 0 1 6 6M5.6 5.6a9 9 0 1 0 12.8 0"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

const minervaLinks: NavItem[] = [
  { to: '/embarcador', label: 'Cargas', icon: <IconGrid />, end: true },
  { to: '/embarcador/viagens', label: 'Viagens', icon: <IconTruck /> },
  { to: '/embarcador/mapa-frota', label: 'Mapa da Frota', icon: <IconMap /> },
  {
    to: '/embarcador/mapa-logistica',
    label: 'Maps da Logística ★',
    icon: <IconRadar />,
  },
  { to: '/embarcador/rotas', label: 'Rotas', icon: <IconLocation /> },
  { to: '/embarcador/tabelas-frete', label: 'Tabelas de Frete', icon: <IconWallet /> },
  { to: '/embarcador/transportadores', label: 'Transportadoras', icon: <IconUsers /> },
  { to: '/embarcador/veiculos', label: 'Veículos', icon: <IconTruck /> },
  { to: '/embarcador/motoristas', label: 'Motoristas', icon: <IconUsers /> },
  { to: '/embarcador/grupos', label: 'Grupos', icon: <IconGroups /> },
  { to: '/embarcador/indicadores', label: 'Indicadores', icon: <IconChart /> },
  { to: '/embarcador/pontuacao', label: 'Pontuação', icon: <IconStar /> },
  { to: '/embarcador/financeiro', label: 'Financeiro', icon: <IconWallet /> },
  { to: '/embarcador/configuracoes', label: 'Configurações', icon: <IconShield /> },
  { to: '/embarcador/historico', label: 'Histórico', icon: <IconChart /> },
  { to: '/embarcador/config', label: 'Portal / Permissões', icon: <IconShield /> },
  { to: '/embarcador/tarefas', label: 'Tarefas', icon: <IconGrid /> },
]

const transportadorLinks: NavItem[] = [
  { to: '/transportador/painel', label: 'Painel', icon: <IconChart /> },
  { to: '/transportador', label: 'Ofertas', icon: <IconGrid />, end: true },
  { to: '/transportador/viagens', label: 'Viagens', icon: <IconTruck /> },
  { to: '/transportador/veiculos', label: 'Meus Veículos', icon: <IconTruck /> },
  { to: '/transportador/motoristas', label: 'Meus Motoristas', icon: <IconUsers /> },
  { to: '/transportador/configuracoes', label: 'Configurações', icon: <IconShield /> },
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
    transportadores,
  } = useData()
  const navigate = useNavigate()
  /** Fixado expandido pelos 3 riscos; senão só ícones e hover abre temporário */
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const [sidebarHover, setSidebarHover] = useState(false)
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 900px)').matches : false,
  )
  const hoverTimerRef = useRef<number | null>(null)
  const hoverLockedUntilRef = useRef(0)
  const sidebarWide = sidebarPinned || (!isNarrow && sidebarHover)
  const [clock, setClock] = useState(() => formatClock(new Date()))
  const [notifOpen, setNotifOpen] = useState(false)
  const [chatCargaId, setChatCargaId] = useState<string | null>(null)
  const notifWrapRef = useRef<HTMLDivElement>(null)
  const [perfilOpen, setPerfilOpen] = useState(false)
  const [perfilAutoOpenFoto, setPerfilAutoOpenFoto] = useState(false)
  const avatarWrapRef = useRef<HTMLDivElement>(null)
  const [fotoAvisoVisivel, setFotoAvisoVisivel] = useState(false)

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

  function closeSidebarMobile() {
    hoverLockedUntilRef.current = Date.now() + 400
    clearHoverTimer()
    setSidebarHover(false)
    setSidebarPinned(false)
  }

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    function sync() {
      const narrow = mq.matches
      setIsNarrow(narrow)
      if (narrow) setSidebarHover(false)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

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

  useEffect(() => {
    if (!perfilOpen) return
    function onPointerDown(e: MouseEvent) {
      if (!avatarWrapRef.current?.contains(e.target as Node)) {
        setPerfilOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPerfilOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [perfilOpen])

  const chatCarga = useMemo(
    () => (chatCargaId ? (cargas ?? []).find((c) => c.id === chatCargaId) ?? null : null),
    [chatCargaId, cargas],
  )

  const isSuper = isSuperSession(user)

  const topbarTransportadorId =
    canonicalTransportadorId(
      actingTransportadorId ||
        (user?.role === 'transportador' ? user.transportador_id : null) ||
        null,
    )

  const avatarFotoUrl = useMemo(() => {
    const pessoal = user?.avatar_url?.trim() || null
    if (pessoal) return pessoal
    if (!topbarTransportadorId) return null
    const t = (transportadores ?? []).find(
      (x) =>
        x.id === topbarTransportadorId ||
        canonicalTransportadorId(x.id) === topbarTransportadorId,
    )
    return t?.logo_url?.trim() || null
  }, [user?.avatar_url, topbarTransportadorId, transportadores])

  const podeEditarLogo = true

  // Aviso de foto/logo de perfil — aparece para todos até fechar ou até enviar a imagem
  useEffect(() => {
    if (!user) {
      setFotoAvisoVisivel(false)
      return
    }
    try {
      const key = `doca-aviso-foto-perfil:${user.id || user.usuario || 'u'}`
      if (sessionStorage.getItem(key) === '1') {
        setFotoAvisoVisivel(false)
        return
      }
    } catch {
      /* ignore */
    }
    // Se já tem foto (transportador), não precisa do aviso
    if (avatarFotoUrl) {
      setFotoAvisoVisivel(false)
      return
    }
    setFotoAvisoVisivel(true)
  }, [user, avatarFotoUrl])

  function dispensarAvisoFoto() {
    setFotoAvisoVisivel(false)
    try {
      const key = `doca-aviso-foto-perfil:${user?.id || user?.usuario || 'u'}`
      sessionStorage.setItem(key, '1')
    } catch {
      /* ignore */
    }
  }

  const minhasNotifs = useMemo(() => {
    if (!user) return []
    const tid = actingTransportadorId || user.transportador_id
    return (notificacoes ?? [])
      .filter((n) => {
        // Super vê tudo (inclui chat do embarcador e do transportador)
        if (isSuper && !actingTransportadorId) return true
        // Destino explícito por usuário
        if (n.user_id) return n.user_id === user.id
        // Destino explícito por transportadora
        if (n.transportador_id) {
          return Boolean(tid && n.transportador_id === tid)
        }
        if (n.role === 'todos') return true
        if (n.role === 'minerva') {
          // Lado embarcador → só Super (equipe Minerva removida)
          if (actingTransportadorId) return false
          return user.role === 'super' || Boolean(user.is_superuser)
        }
        if (n.role === 'transportador') {
          return user.role === 'transportador' || Boolean(actingTransportadorId)
        }
        if (!n.user_id && !n.transportador_id && !n.role) {
          return user.role === 'super' || Boolean(user.is_superuser)
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
        { to: '/transportador', label: 'Ofertas', icon: <IconGrid />, end: true },
        { to: '/transportador/viagens', label: 'Viagens', icon: <IconTruck /> },
      ]
    }
    // Só transportador (demos / cadastro público) — sem equipe Minerva
    return transportadorLinks.filter((item) => {
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

  const roleLabel = isSuper ? 'Super Usuário' : 'Transportador'

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
          {topbarTransportadorId ? (
            <DisponibilidadeMapaFlag transportadorId={topbarTransportadorId} variant="topbar" />
          ) : null}

          {isSuper && !actingTransportadorId ? (
            <button
              type="button"
              className="app-topbar-nova-carga inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#2f9e6a] bg-[#2f9e6a] px-3 text-[0.78rem] font-extrabold text-white hover:border-[#268556] hover:bg-[#268556]"
              title="Nova carga"
              aria-label="Nova carga"
              onClick={() => {
                setNotifOpen(false)
                navigate('/embarcador', { state: { novaCarga: true } })
              }}
            >
              <span aria-hidden className="text-[1.1rem] font-extrabold leading-none">
                +
              </span>
              <span className="app-topbar-nova-carga__label">Nova carga</span>
            </button>
          ) : null}

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
              {unread > 0 && <span className="app-topbar-notif-badge">{unread > 99 ? '99+' : unread}</span>}
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
                          if (n.href) {
                            setNotifOpen(false)
                            navigate(n.href, {
                              state: n.carga_id ? { abrirCargaId: n.carga_id } : undefined,
                            })
                            return
                          }
                          if (n.carga_id) {
                            const c = (cargas ?? []).find((x) => x.id === n.carga_id)
                            if (c) {
                              setNotifOpen(false)
                              // Proposta → card de negociação no Kanban embarcador
                              if (
                                n.titulo === 'Nova proposta' ||
                                n.titulo === 'Proposta atualizada' ||
                                n.titulo === 'Nova proposta recebida' ||
                                n.titulo === 'Resposta da contra-proposta'
                              ) {
                                navigate('/embarcador', {
                                  state: { abrirCargaId: n.carga_id },
                                })
                                return
                              }
                              // Contra-proposta → card de lance do transportador
                              if (
                                n.titulo === 'Contra-proposta no card' ||
                                n.titulo === 'Resposta da contra-proposta enviada'
                              ) {
                                navigate('/transportador', {
                                  state: { abrirCargaId: n.carga_id },
                                })
                                return
                              }
                              setChatCargaId(c.id)
                            }
                          }
                        }}
                      >
                        <strong>
                          {n.titulo === 'Nova proposta recebida' ||
                          n.titulo.startsWith('Nova mensagem ·')
                            ? 'Nova mensagem'
                            : n.titulo}
                        </strong>
                        <span>{n.mensagem}</span>
                        {n.href ? (
                          <span className="app-topbar-notif-action">
                            {n.href.includes('filtro=pendentes')
                              ? 'Abrir fila'
                              : n.href.includes('/viagens')
                                ? 'Ver viagens'
                                : 'Ver card'}
                          </span>
                        ) : n.carga_id ? (
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

          <div
            className="app-topbar-user-wrap"
            ref={avatarWrapRef}
            role="group"
            aria-label="Usuário"
          >
            <button
              type="button"
              className="app-topbar-user"
              title="Ver perfil"
              aria-label="Abrir perfil"
              aria-expanded={perfilOpen}
              aria-haspopup="dialog"
              onClick={() => {
                setNotifOpen(false)
                setPerfilAutoOpenFoto(false)
                setPerfilOpen((o) => !o)
              }}
            >
              <div className="app-topbar-user-text">
                <strong>{user?.nome ?? 'Doca Livre'}</strong>
                <span>{roleLabel}</span>
              </div>
              <span className="app-topbar-avatar" aria-hidden>
                {avatarFotoUrl ? (
                  <img src={avatarFotoUrl} alt="" className="app-topbar-avatar-img" />
                ) : (
                  <span className="app-topbar-avatar-iniciais">
                    {iniciais(user?.nome ?? 'DL')}
                  </span>
                )}
              </span>
            </button>

            {perfilOpen ? (
              <div className="app-topbar-perfil-panel" role="dialog" aria-label="Perfil">
                <PerfilPanel
                  autoOpenFoto={perfilAutoOpenFoto}
                  onClose={() => {
                    setPerfilOpen(false)
                    dispensarAvisoFoto()
                  }}
                />
              </div>
            ) : null}
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

      {fotoAvisoVisivel ? (
        <div className="app-foto-aviso" role="status">
          <div className="app-foto-aviso__body">
            <strong>Foto de perfil</strong>
            <span>
              {podeEditarLogo
                ? 'Adicione a logo da empresa ou uma foto sua: clique no seu nome (ao lado de Sair) para abrir o perfil. A imagem aparece no login, no perfil e no mapa da frota.'
                : 'Transportadores podem adicionar logo ou foto no perfil (clique no nome ao lado de Sair) ou na edição da transportadora. A imagem vira o perfil no login.'}
            </span>
          </div>
          <div className="app-foto-aviso__actions">
            {podeEditarLogo ? (
              <button
                type="button"
                className="app-foto-aviso__btn"
                onClick={() => {
                  setNotifOpen(false)
                  setPerfilAutoOpenFoto(true)
                  setPerfilOpen(true)
                }}
              >
                Adicionar agora
              </button>
            ) : null}
            <button
              type="button"
              className="app-foto-aviso__fechar"
              aria-label="Fechar aviso"
              onClick={dispensarAvisoFoto}
            >
              Entendi
            </button>
          </div>
        </div>
      ) : null}

      <div className="app-workspace">
        {sidebarHover && !sidebarPinned && !isNarrow && (
          <div className="sidebar-rail" aria-hidden />
        )}
        {sidebarPinned && isNarrow && (
          <button
            type="button"
            className="app-workspace-backdrop"
            aria-label="Fechar menu"
            onClick={closeSidebarMobile}
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
                  if (isNarrow) closeSidebarMobile()
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
      <ActionFlashHost />
    </div>
  )
}
