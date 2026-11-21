import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { logoDocaLivre } from '../../lib/brandAssets'
import { useTema } from '../../lib/tema'
import { IconePadrao } from './IconesPadrao'
import { ProductMark } from '../ProductMark'
import { ChatModal } from '../carga/ChatModal'
import { PerfilPanel } from './PerfilPanel'
import { ActionFlashHost } from '../ui/ActionFlashHost'
import { FacialGate } from '../verificacao/FacialGate'
import { DisponibilidadeMapaFlag } from '../transportador/DisponibilidadeMapaFlag'
import { canOpenModulo, moduloFromPath } from '../../lib/portalModules'
import { findOrgNo, loadOrgTree, ORG_TIPO_LABEL } from '../../lib/orgHierarchy'
import { ehSuperDiegoOuElder, isSuperSession } from '../../lib/superUsers'
import { canonicalTransportadorId } from '../../lib/transportadorIds'
import { deduplicarAvisosCarga } from '../../lib/modulosSombra'
import '../../styles/shell.css'

type NavItem = {
  to: string
  label: string
  end?: boolean
  icon: React.ReactNode
}

// Ícones do menu: os mesmos do WMS Doca Livre (ver IconesPadrao.tsx).
function IconGrid() {
  return <IconePadrao nome="table-cells-large" />
}

function IconMap() {
  return <IconePadrao nome="map-location-dot" />
}

function IconLocation() {
  return <IconePadrao nome="location-dot" />
}

function IconRoute() {
  return <IconePadrao nome="route" />
}

function IconUsers() {
  return <IconePadrao nome="users" />
}

function IconGroups() {
  return <IconePadrao nome="people-group" />
}

function IconChart() {
  return <IconePadrao nome="chart-column" />
}

function IconTruck() {
  return <IconePadrao nome="truck" />
}

function IconShield() {
  return <IconePadrao nome="shield-halved" />
}

function IconStar() {
  return <IconePadrao nome="star" />
}

function IconWallet() {
  return <IconePadrao nome="wallet" />
}

function IconRadar() {
  return <IconePadrao nome="satellite-dish" />
}

function IconCredito() {
  return <IconePadrao nome="coins" />
}

function IconMalha() {
  return <IconePadrao nome="diagram-project" />
}

function IconCelular() {
  return <IconePadrao nome="mobile-screen-button" />
}

const ITEM_APLICATIVO: NavItem = { to: '/aplicativo', label: 'Aplicativo', icon: <IconCelular /> }

const minervaLinks: NavItem[] = [
  { to: '/embarcador', label: 'Cargas', icon: <IconGrid />, end: true },
  { to: '/embarcador/viagens', label: 'Viagens', icon: <IconTruck /> },
  { to: '/embarcador/mapa-frota', label: 'Mapa da Frota', icon: <IconMap /> },
  {
    to: '/embarcador/mapa-logistica',
    label: 'Mapa da Logística',
    icon: <IconRadar />,
  },
  {
    to: '/embarcador/malha-radar',
    label: 'Malha da Logística',
    icon: <IconMalha />,
  },
  { to: '/embarcador/rotas', label: 'Rotas', icon: <IconLocation /> },
  { to: '/embarcador/calcular-rota', label: 'Calcular rota', icon: <IconRoute /> },
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
  { to: '/transportador/calcular-rota', label: 'Calcular rota', icon: <IconRoute /> },
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
    cargas,
    notificacoes,
    marcarNotificacaoLida,
    marcarTodasNotificacoesLidas,
    actingTransportadorId,
    transportadores,
  } = useData()
  const navigate = useNavigate()
  // Tema claro/escuro como no WMS: logo azul no claro, logo com moldura branca no escuro.
  const { tema, alternar: alternarTema } = useTema()
  const logoDaMarca = logoDocaLivre(tema)
  /** Fixado expandido pelos 3 riscos; senão só ícones e hover abre temporário */
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const [sidebarHover, setSidebarHover] = useState(false)
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1200px)').matches : false,
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
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 1200px)').matches
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
    const mq = window.matchMedia('(max-width: 1200px)')
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
    const visiveis = (notificacoes ?? [])
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
    return deduplicarAvisosCarga(visiveis).slice(0, 40)
  }, [notificacoes, user, actingTransportadorId, isSuper])

  const unread = minhasNotifs.filter((n) => !n.lida).length

  const logisticaLinks: NavItem[] = [
    { to: '/embarcador/mapa-logistica', label: 'Mapa da Logística', icon: <IconMap /> },
    { to: '/embarcador/mapa-logistica/feed', label: 'Feed', icon: <IconGrid /> },
    { to: '/embarcador/mapa-logistica/perfil', label: 'Meu perfil', icon: <IconUsers /> },
  ]

  const linksDoPerfil = useMemo(() => {
    if (user?.role === 'logistica') return logisticaLinks
    if (isSuper) {
      return [
        ...minervaLinks,
        { to: '/transportador/painel', label: 'Painel Transportador', icon: <IconChart /> },
        { to: '/transportador', label: 'Ofertas', icon: <IconGrid />, end: true },
        { to: '/transportador/viagens', label: 'Viagens', icon: <IconTruck /> },
      ]
    }
    if (user?.role === 'minerva') {
      const ocultos = new Set([
        '/embarcador/config',
        '/embarcador/financeiro',
        '/embarcador/configuracoes',
      ])
      return minervaLinks.filter((item) => {
        if (ocultos.has(item.to)) return false
        const mod = moduloFromPath(item.to)
        if (!mod) return true
        return canOpenModulo(user?.permissoes_modulos, mod)
      })
    }
    // Só transportador (demos / cadastro público) — sem equipe Minerva
    return transportadorLinks.filter((item) => {
      const mod = moduloFromPath(item.to)
      if (!mod) return true
      return canOpenModulo(user?.permissoes_modulos, mod)
    })
  }, [user, isSuper])
  const links = useMemo(() => [...linksDoPerfil, ITEM_APLICATIVO], [linksDoPerfil])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    const id = window.setInterval(() => setClock(formatClock(new Date())), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const noHierarquia =
    user?.role === 'minerva' && user.empresa_org_id
      ? findOrgNo(loadOrgTree(), user.empresa_org_id)
      : null
  const roleLabel = isSuper
    ? 'Super Usuário'
    : user?.role === 'logistica'
      ? 'Empresa · Logística'
      : noHierarquia
        ? ORG_TIPO_LABEL[noHierarquia.tipo]
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
            <IconePadrao nome="bars" tamanho={20} />
          </button>

          <div className="app-topbar-brand">
            <Link to="/home" title="Home">
              <img src={logoDaMarca} alt="Doca Livre" className="app-topbar-logo" />
            </Link>
            <ProductMark size="md" className="app-topbar-wms" />
          </div>
        </div>

        <div className="app-topbar-right">
          {topbarTransportadorId ? (
            <DisponibilidadeMapaFlag transportadorId={topbarTransportadorId} variant="topbar" />
          ) : null}

          {(isSuper || user?.role === 'minerva') && !actingTransportadorId ? (
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

          {ehSuperDiegoOuElder(user) ? (
            <NavLink
              to="/embarcador/dar-creditos"
              className={({ isActive }) =>
                `app-topbar-dar-creditos${isActive ? ' is-on' : ''}`
              }
              title="Dar créditos"
              aria-label="Dar créditos"
              onClick={() => setNotifOpen(false)}
            >
              <span className="app-topbar-dar-creditos__icon" aria-hidden>
                <IconCredito />
              </span>
              <span className="app-topbar-dar-creditos__label">Dar créditos</span>
            </NavLink>
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
              <IconePadrao nome="bell" tamanho={17} />
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

          {/* Tema claro/escuro, ao lado do sino (mesmo estilo dos botões de ícone). */}
          <button
            type="button"
            className="app-topbar-refresh app-topbar-tema"
            onClick={alternarTema}
            title={tema === 'escuro' ? 'Tema claro' : 'Tema escuro'}
            aria-label={tema === 'escuro' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
          >
            <IconePadrao nome={tema === 'escuro' ? 'sun' : 'moon'} tamanho={17} />
          </button>

          <button
            type="button"
            className="app-topbar-refresh"
            onClick={() => window.location.reload()}
            title="Atualizar página"
            aria-label="Atualizar página"
          >
            <IconePadrao nome="rotate-right" tamanho={17} />
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
        </div>
      </header>

      {fotoAvisoVisivel ? (
        <div className="app-foto-aviso" role="status">
          <div className="app-foto-aviso__body">
            <strong>Foto de perfil</strong>
            <span>
              {podeEditarLogo
                ? 'Adicione a logo da empresa ou uma foto sua: clique no seu nome, no canto de cima, para abrir o perfil. A imagem aparece no login, no perfil e no mapa da frota.'
                : 'Transportadores podem adicionar logo ou foto no perfil (clique no seu nome, no canto de cima) ou na edição da transportadora. A imagem vira o perfil no login.'}
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
          <div className="sidebar-footer">
            <span>Oferta de Carga Doca Livre</span>
          </div>
        </aside>

        <main
          className="main-panel"
          style={{ ['--brand-logo-url' as string]: `url("${logoDaMarca}")` }}
        >
          <Outlet />
          <FacialGate />
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
