import { isLocalDev, isSiteOfertaDeCarga, URL_SITE_ROTA } from './siteOfertaDeCarga'

export type RotaShareDados = {
  origem: string
  destino: string
  vias?: { endereco: string; lat?: number | null; lng?: number | null }[]
  origemCoords?: { lat: number; lng: number } | null
  destinoCoords?: { lat: number; lng: number } | null
  tipoVeiculo?: string
  idaEVolta?: boolean
  preferencia?: string
  eixos?: number
  categoriaId?: number | null
  consumoKmL?: number | null
  precoDiesel?: number | null
}

function pathCalculadora(): string {
  if (typeof window === 'undefined') return '/'
  if (isSiteOfertaDeCarga()) return '/'
  const p = window.location.pathname
  if (p.startsWith('/diego-lab')) return '/diego-lab'
  if (p.startsWith('/rota')) return '/rota'
  if (isLocalDev()) return '/rota'
  return '/'
}

function parCoord(c?: { lat: number; lng: number } | null): string {
  if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return ''
  return `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`
}

function lerCoord(raw: string | null): { lat: number; lng: number } | null {
  if (!raw) return null
  const [a, b] = raw.split(',')
  const lat = Number(a)
  const lng = Number(b)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function serializarVias(
  vias: { endereco: string; lat?: number | null; lng?: number | null }[] | undefined,
): string {
  return (vias ?? [])
    .map((v) => {
      const end = v.endereco.trim()
      if (!end) return ''
      if (v.lat != null && v.lng != null && Number.isFinite(v.lat) && Number.isFinite(v.lng)) {
        return `${end}@${v.lat.toFixed(5)},${v.lng.toFixed(5)}`
      }
      return end
    })
    .filter(Boolean)
    .join('|')
}

function lerVias(raw: string | null): RotaShareDados['vias'] {
  if (!raw?.trim()) return []
  return raw.split('|').flatMap((parte) => {
    const t = parte.trim()
    if (!t) return []
    const at = t.lastIndexOf('@')
    if (at > 0) {
      const coords = lerCoord(t.slice(at + 1))
      if (coords) {
        return [{ endereco: t.slice(0, at), lat: coords.lat, lng: coords.lng }]
      }
    }
    return [{ endereco: t, lat: null, lng: null }]
  })
}

export function queryRotaCompartilhada(p: RotaShareDados): string {
  const q = new URLSearchParams()
  q.set('o', p.origem.trim())
  q.set('d', p.destino.trim())
  const oc = parCoord(p.origemCoords)
  const dc = parCoord(p.destinoCoords)
  if (oc) q.set('oc', oc)
  if (dc) q.set('dc', dc)
  const vias = serializarVias(p.vias)
  if (vias) q.set('v', vias)
  if (p.tipoVeiculo?.trim()) q.set('tv', p.tipoVeiculo.trim())
  if (p.idaEVolta) q.set('iv', '1')
  if (p.preferencia && p.preferencia !== 'eficiente') q.set('p', p.preferencia)
  if (p.eixos && p.eixos > 0) q.set('e', String(p.eixos))
  if (p.categoriaId) q.set('c', String(p.categoriaId))
  if (p.consumoKmL && p.consumoKmL > 0) q.set('k', String(p.consumoKmL).replace('.', ','))
  if (p.precoDiesel && p.precoDiesel > 0) q.set('dl', String(p.precoDiesel).replace('.', ','))
  return q.toString()
}

/** Link público da rota (ofertadecarga.com.br), com origem e destino. */
export function montarUrlRotaPublica(p: RotaShareDados): string {
  const q = queryRotaCompartilhada(p)
  if (typeof window !== 'undefined' && (isSiteOfertaDeCarga() || isLocalDev())) {
    return `${window.location.origin}${pathCalculadora()}?${q}`
  }
  return `${URL_SITE_ROTA}/?${q}`
}

export function lerRotaDaUrl(search = typeof window === 'undefined' ? '' : window.location.search): RotaShareDados | null {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const origem = (q.get('o') || '').trim()
  const destino = (q.get('d') || '').trim()
  if (origem.length < 3 || destino.length < 3) return null
  const eixos = Number(q.get('e'))
  const categoriaId = Number(q.get('c'))
  const consumo = Number(String(q.get('k') || '').replace(',', '.'))
  const diesel = Number(String(q.get('dl') || '').replace(',', '.'))
  return {
    origem,
    destino,
    vias: lerVias(q.get('v')),
    origemCoords: lerCoord(q.get('oc')),
    destinoCoords: lerCoord(q.get('dc')),
    tipoVeiculo: (q.get('tv') || '').trim() || undefined,
    idaEVolta: q.get('iv') === '1',
    preferencia: (q.get('p') || '').trim() || undefined,
    eixos: Number.isFinite(eixos) && eixos >= 2 ? eixos : undefined,
    categoriaId: Number.isFinite(categoriaId) && categoriaId > 0 ? categoriaId : null,
    consumoKmL: Number.isFinite(consumo) && consumo > 0 ? consumo : null,
    precoDiesel: Number.isFinite(diesel) && diesel > 0 ? diesel : null,
  }
}

/** No Windows/Chrome o compartilhar usa a URL da barra. Grava os parâmetros antes. */
export function sincronizarBarraEndereco(p: RotaShareDados) {
  if (typeof window === 'undefined') return
  try {
    const u = new URL(montarUrlRotaPublica(p))
    if (u.origin !== window.location.origin) return
    const next = `${u.pathname}${u.search}`
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(null, '', next)
    }
  } catch {
    /* ignore */
  }
}
