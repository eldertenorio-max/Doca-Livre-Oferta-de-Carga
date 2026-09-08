/** Site público de calcular rota (Registro.br). */
export const HOST_OFERTA_DE_CARGA = 'ofertadecarga.com.br'
/** Sistema (login, kanban, cadastro). */
export const HOST_SISTEMA = 'sistema.ofertadecarga.com.br'

export const URL_SITE_ROTA = `https://${HOST_OFERTA_DE_CARGA}`
export const URL_SISTEMA = `https://${HOST_SISTEMA}`
export const URL_OFERTA_DE_CARGA = `${URL_SITE_ROTA}/#/rota`
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

/** Home do calcular rota: ofertadecarga.com.br */
export function isSiteOfertaDeCarga(hostname = hostAtual()): boolean {
  return hostCanonico(hostname) === HOST_OFERTA_DE_CARGA
}

/** Sistema: sistema.ofertadecarga.com.br (e hosts antigos enquanto o DNS troca). */
export function isSiteSistema(hostname = hostAtual()): boolean {
  const h = hostCanonico(hostname)
  return (
    h === HOST_SISTEMA ||
    h === 'ofertadecargas.docalivre.com.br' ||
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

/** Login / cadastro / app: no site da rota, aponta para o subdomínio do sistema. */
export function hrefSistema(path: string): string {
  const p = normPath(path)
  if (isSiteOfertaDeCarga()) return `${URL_SISTEMA}/#${p}`
  return p
}

export function urlSistemaComHash(path: string): string {
  return `${URL_SISTEMA}/#${normPath(path)}`
}

/** Calculadora pública: no sistema, aponta para ofertadecarga.com.br. */
export function hrefRota(): string {
  if (isSiteOfertaDeCarga() || isLocalDev()) return '/rota'
  return URL_OFERTA_DE_CARGA
}

export function hrefMapaFrota(): string {
  if (isSiteOfertaDeCarga()) return URL_MAPA_FROTA
  return '/mapa'
}
