/** Domínio do site público de calcular rota (Registro.br). */
export const HOST_OFERTA_DE_CARGA = 'ofertadecarga.com.br'

export const URL_OFERTA_DE_CARGA = 'https://ofertadecarga.com.br/#/rota'
export const URL_MAPA_FROTA = 'https://ofertadecargas.docalivre.com.br/#/mapa'

export function isSiteOfertaDeCarga(
  hostname = typeof window !== 'undefined' ? window.location.hostname : '',
): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, '')
  return h === HOST_OFERTA_DE_CARGA
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
