import { NavLink, Outlet } from 'react-router-dom'
import { useMemo } from 'react'
import { useData } from '../context/DataContext'
import { isSuperSession } from '../lib/superUsers'
import { AuthProvider } from './lib/AuthContext'
import { rotasLogistica } from './lib/rotasApp'
import './styles/logistica-area.css'

function LogisticaNav() {
  const { user } = useData()
  const superUser = isSuperSession(user)
  const item = ({ isActive }: { isActive: boolean }) =>
    `logistica-nav__link${isActive ? ' is-on' : ''}`
  return (
    <nav className="logistica-nav" aria-label="Mapa da Logística">
      <NavLink to={rotasLogistica.mapa} end className={item}>
        Mapa
      </NavLink>
      {superUser ? (
        <>
          <NavLink to={rotasLogistica.painel} className={item}>
            Painel
          </NavLink>
          <NavLink to={rotasLogistica.kanban} className={item}>
            Kanban
          </NavLink>
          <NavLink to={rotasLogistica.hierarquia} className={item}>
            Hierarquia
          </NavLink>
        </>
      ) : null}
      <NavLink to={rotasLogistica.feed} className={item}>
        Feed
      </NavLink>
      <NavLink to={rotasLogistica.perfil} className={item}>
        Meu perfil
      </NavLink>
    </nav>
  )
}

export function LogisticaArea() {
  const { user } = useData()
  const contaPortal = useMemo(
    () =>
      user
        ? {
            id: user.id,
            usuario: (user.usuario || user.email || user.id).trim(),
            email: user.email || '',
            nome: user.nome,
            avatar_url: user.avatar_url || null,
            isSuper: isSuperSession(user),
          }
        : null,
    [user],
  )

  return (
    <AuthProvider contaPortal={contaPortal}>
      <div className="logistica-area">
        <LogisticaNav />
        <Outlet />
      </div>
    </AuthProvider>
  )
}
