/** Mesma chave do DataContext — leitura leve, sem puxar o Kanban. */
const AUTH_KEY = 'doca-livre-auth-v1'

export type PerfilLocal = {
  role?: string
}

export function lerPerfilLocal(): PerfilLocal | null {
  if (typeof window === 'undefined') return null
  try {
    const raw =
      localStorage.getItem(AUTH_KEY) ?? sessionStorage.getItem(AUTH_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PerfilLocal
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}
