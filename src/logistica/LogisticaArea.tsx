import { NavLink, Outlet } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { isSuperSession } from '../lib/superUsers'
import { AuthProvider } from './lib/AuthContext'
import { rotasLogistica } from './lib/rotasApp'
import './styles/logistica-area.css'

function LogisticaNav() {
  const item = ({ isActive }: { isActive: boolean }) =>
    `logistica-nav__link${isActive ? ' is-on' : ''}`
  return (
    <nav className="logistica-nav" aria-label="Mapa da Logística">
      <NavLink to={rotasLogistica.mapa} end className={item}>
        Mapa
      </NavLink>
      <NavLink to={rotasLogistica.painel} className={item}>
        Painel
      </NavLink>
      <NavLink to={rotasLogistica.kanban} className={item}>
        Kanban
      </NavLink>
      <NavLink to={rotasLogistica.hierarquia} className={item}>
        Hierarquia
      </NavLink>
      <NavLink to={rotasLogistica.feed} className={item}>
        Feed
      </NavLink>
    </nav>
  )
}

export function LogisticaArea() {
  const { user } = useData()
  const forcarSuper =
    user && isSuperSession(user)
      ? {
          nome: user.nome || 'Super',
          usuario: user.email || user.id,
        }
      : null

  return (
    <AuthProvider forcarSuper={forcarSuper}>
      <div className="logistica-area">
        <LogisticaNav />
        <Outlet />
      </div>
    </AuthProvider>
  )
}
