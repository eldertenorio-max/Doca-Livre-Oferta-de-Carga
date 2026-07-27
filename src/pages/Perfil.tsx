import { Navigate } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { isSuperSession } from '../lib/superUsers'

/** Perfil abre no cantinho da topbar — esta rota só redireciona. */
export function PerfilPage() {
  const { user } = useData()
  if (!user) return <Navigate to="/login" replace />
  if (isSuperSession(user)) return <Navigate to="/embarcador" replace />
  if (user.role === 'transportador') return <Navigate to="/transportador" replace />
  return <Navigate to="/embarcador" replace />
}
