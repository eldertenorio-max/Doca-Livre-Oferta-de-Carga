/** Super Usuários canônicos deste sistema: Diego e Elder (Doca Livre). */

const SUPER_LOGINS = new Set([
  'diego',
  'elder',
  'diego.isidoro',
  'diegoisidoro',
  'diego isidoro',
  'elder.tenorio',
  'eldertenorio',
  'elder tenorio',
])

const SUPER_EMAILS = new Set([
  'diego@docalivre.com',
  'elder@docalivre.com',
  'elder.tenorio@docalivre.com.br',
])

function asciiLower(valor: string) {
  return (valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** E-mails/logins de Super — só domínio Doca Livre (não Ultrafrio etc.). */
export function isLocalSuperUser(usuario: string): boolean {
  const u = asciiLower(usuario)
  if (!u) return false

  if (u.includes('@')) {
    // Transportadora / e-mail externo nunca é Super por heurística
    if (!u.endsWith('@docalivre.com') && !u.endsWith('@docalivre.com.br')) return false
    if (SUPER_EMAILS.has(u)) return true
    const local = (u.split('@')[0] || '').trim()
    return SUPER_LOGINS.has(local)
  }

  return SUPER_LOGINS.has(u)
}

type SessionLike = {
  role?: string | null
  is_superuser?: boolean | null
  usuario?: string | null
  email?: string | null
}

/**
 * Fonte da verdade: perfil salvo na Configuração do Portal (`role`).
 * Heurística de e-mail só entra se o role não for transportador.
 */
export function isSuperSession(user: SessionLike | null | undefined): boolean {
  if (!user) return false
  if (user.role === 'transportador') return false
  if (user.role === 'super' || Boolean(user.is_superuser)) return true
  return isLocalSuperUser(user.usuario ?? '') || isLocalSuperUser(user.email ?? '')
}
