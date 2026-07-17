/** Super Usuários deste sistema: Diego e Elder. */

export function isLocalSuperUser(usuario: string): boolean {
  const u = (usuario || '').trim().toLowerCase()
  if (!u) return false
  const ascii = u.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const locals = [
    'diego',
    'elder',
    'diego.isidoro',
    'elder.tenorio',
    'eldertenorio',
    'diegoisidoro',
    'diego isidoro',
    'elder tenorio',
  ]
  if (locals.includes(u) || locals.includes(ascii)) return true
  const local = (ascii.split('@')[0] || '').trim()
  if (locals.includes(local)) return true
  if (locals.some((s) => ascii === s || ascii.startsWith(`${s}.`) || ascii.startsWith(`${s}@`))) {
    return true
  }
  if (local.startsWith('diego') || local.startsWith('elder')) return true
  return false
}
