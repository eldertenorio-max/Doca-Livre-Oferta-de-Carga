/** Calculadora pública (a tela da foto). */
export const HOST_OFERTA_DE_CARGA = 'ofertadecarga.com.br'
/** Sistema (login, kanban, cadastro) — já no ar no Render. */
export const HOST_SISTEMA = 'ofertadecargas.docalivre.com.br'

export const URL_SITE_ROTA = `https://${HOST_OFERTA_DE_CARGA}`
export const URL_SISTEMA = `https://${HOST_SISTEMA}`
export const URL_OFERTA_DE_CARGA = URL_SITE_ROTA
export const URL_ROTA_PUBLICA = `${URL_SITE_ROTA}/#/rota`
export const URL_MAPA_FROTA = `${URL_SISTEMA}/#/mapa`

function hostAtual(): string {
  if (typeof window === 'undefined') return ''
  return window.location.hostname.toLowerCase()
}

function hostCanonico(hostname = hostAtual()): string {
  return hostname.replace(/^www\./, '')
}

export function isLocalDev(hostname = hostAtual()): boolean {
  const h = hostCanonico(hostname)
  return h === 'localhost' || h === '127.0.0.1'
}

/** Home do calcular rota: ofertadecarga.com.br (e www). */
export function isSiteOfertaDeCarga(hostname = hostAtual()): boolean {
  return hostCanonico(hostname) === HOST_OFERTA_DE_CARGA
}

/** Sistema: ofertadecargas.docalivre.com.br (e o subdomínio novo, se existir). */
export function isSiteSistema(hostname = hostAtual()): boolean {
  const h = hostCanonico(hostname)
  return (
    h === HOST_SISTEMA ||
    h === 'sistema.ofertadecarga.com.br' ||
    h.endsWith('.onrender.com')
  )
}

export function isPublicSitePath(): boolean {
  const hash = (typeof window !== 'undefined' ? window.location.hash : '').replace(/^#/, '')
  const path = hash.split('?')[0] || '/'
  return (
    path === '/mapa' ||
    path.startsWith('/mapa/') ||
    path === '/rota' ||
    path.startsWith('/rota/') ||
    path === '/calcular-rota' ||
    path.startsWith('/calcular-rota/')
  )
}

export function devePularSplash(): boolean {
  return isPublicSitePath() || isSiteOfertaDeCarga()
}

function normPath(path: string): string {
  const trimmed = path.trim() || '/'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/** Login / cadastro / app: no site da calculadora, aponta para o sistema no Doca Livre. */
export function hrefSistema(path: string): string {
  const p = normPath(path)
  if (isLocalDev() || isSiteSistema()) return p
  return `${URL_SISTEMA}/#${p}`
}

export function urlSistemaComHash(path: string): string {
  return `${URL_SISTEMA}/#${normPath(path)}`
}

/** Calculadora pública: sempre ofertadecarga.com.br (exceto no próprio site e no localhost). */
export function hrefRota(): string {
  if (isSiteOfertaDeCarga() || isLocalDev()) return '/rota'
  return URL_ROTA_PUBLICA
}

export function hrefMapaFrota(): string {
  if (isSiteOfertaDeCarga()) return URL_MAPA_FROTA
  return '/mapa'
}
