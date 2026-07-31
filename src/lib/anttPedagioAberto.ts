/**
 * Pedágio gratuito com Dados Abertos da ANTT (praças + coords) + OpenStreetMap + rota OSRM.
 * Fonte ANTT: https://dados.antt.gov.br/dataset/praca-de-pedagio (atualização mensal, CC-BY).
 * Complemento OSM: barrier=toll_booth / highway=toll_gantry (cobre pedágios estaduais, ex. ARTESP).
 * Tarifas por eixo: estimativa operacional a partir da tarifa-base típica por rodovia
 * (a ANTT não publica API REST de tarifas vigentes por categoria).
 */

import { roundMoney } from './businessRules'
import type { AnttPracaPedagio } from './anttFrete'

/** Catálogo embutido (mesma origem do app — sem CORS). Gerado por scripts/fetch-pracas-pedagio.mjs */
const LOCAL_PRACAS_URL = `${import.meta.env.BASE_URL}data/pracas-pedagio.json`
const CACHE_KEY = 'doca-livre-pracas-catalogo-v1'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type PracaAntt = {
  nome: string
  concessionaria: string
  rodovia: string
  uf: string
  lat: number
  lng: number
  free_flow?: boolean
  fonte?: 'antt' | 'osm' | string
}

type CacheBlob = { at: number; pracas: PracaAntt[] }

let memCatalogo: PracaAntt[] | null = null

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Distância mínima do ponto a um segmento (projeção equiretangular local), em metros. */
function distPontoSegmentoM(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const lat0 = toRad((a.lat + b.lat + p.lat) / 3)
  const cos = Math.cos(lat0) || 1e-6
  const x = (lng: number) => toRad(lng) * cos
  const y = (lat: number) => toRad(lat)
  const ax = x(a.lng)
  const ay = y(a.lat)
  const bx = x(b.lng)
  const by = y(b.lat)
  const px = x(p.lng)
  const py = y(p.lat)
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return haversineM(p, {
    lat: (ay + t * dy) * (180 / Math.PI),
    lng: ((ax + t * dx) / cos) * (180 / Math.PI),
  })
}

/** Distância mínima do ponto à polilinha (m). */
function distPontoPolilinhaM(
  p: { lat: number; lng: number },
  line: Array<{ lat: number; lng: number }>,
): number {
  let min = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    min = Math.min(min, distPontoSegmentoM(p, line[i], line[i + 1]))
  }
  return min
}

function parseCatalogo(raw: unknown): PracaAntt[] {
  const root = raw as { pracas?: unknown }
  const arr = Array.isArray(root?.pracas)
    ? root.pracas
    : Array.isArray(raw)
      ? raw
      : []
  const out: PracaAntt[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const lat = Number(o.lat)
    const lng = Number(o.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    out.push({
      nome: String(o.nome || 'Pedágio').trim() || 'Pedágio',
      concessionaria: String(o.concessionaria || '').trim(),
      rodovia: String(o.rodovia || '').trim(),
      uf: String(o.uf || '').trim(),
      lat,
      lng,
      free_flow: Boolean(o.free_flow),
      fonte: String(o.fonte || 'local'),
    })
  }
  return out
}

/** Catálogo local ANTT+OSM (public/data/pracas-pedagio.json). */
export async function carregarPracasAntt(force = false): Promise<PracaAntt[]> {
  if (!force && memCatalogo) return memCatalogo

  if (!force && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const blob = JSON.parse(raw) as CacheBlob
        if (
          Date.now() - blob.at < CACHE_TTL_MS &&
          Array.isArray(blob.pracas) &&
          blob.pracas.length > 0
        ) {
          memCatalogo = blob.pracas
          return blob.pracas
        }
      }
    } catch {
      /* ignore */
    }
  }

  const res = await fetch(LOCAL_PRACAS_URL, { cache: 'force-cache' })
  if (!res.ok) throw new Error(`Catálogo de praças HTTP ${res.status}`)
  const pracas = parseCatalogo(await res.json())
  if (pracas.length === 0) throw new Error('Catálogo de praças vazio')
  memCatalogo = pracas
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ at: Date.now(), pracas } satisfies CacheBlob),
      )
    } catch {
      /* ignore quota */
    }
  }
  return pracas
}

/**
 * Tarifa-base (automóvel / cat.1) estimada por rodovia — médias operacionais BR.
 * Usada só quando a ANTT não publica a tabela tarifária no dataset aberto.
 */
function tarifaBaseCarro(rodovia: string): number {
  const r = rodovia.toUpperCase().replace(/\s+/g, '')
  if (/BR-?116|BR-?101|BR-?040|BR-?381|SP-?330|SP-?348|SP-?070/.test(r)) return 12.4
  if (/BR-?153|BR-?262|BR-?277|BR-?376|BR-?050/.test(r)) return 10.8
  if (/BR-?290|BR-?386|BR-?163|BR-?364/.test(r)) return 9.6
  return 11.2
}

/** Valor comercial por praça conforme eixos (aproximação das categorias ANTT). */
function valorPracaPorEixos(tarifaCarro: number, eixos: number): number {
  const e = Math.max(2, Math.min(9, Math.round(eixos)))
  // Categoria comercial: em muitas concessões ≈ tarifa_auto × (eixos / 2)
  return roundMoney(tarifaCarro * (e / 2))
}

export type PedagioRotaResultado = {
  pedagio: number
  pedagio_por_eixo: number
  vale_pedagio: number
  pracas: AnttPracaPedagio[]
  free_flow: boolean
  fonte: string
}

/**
 * Cruza a polilinha da rota com praças ANTT + OSM (raio ~900 m) e estima o pedágio.
 */
export async function calcularPedagioNaRota(
  polyline: Array<{ lat: number; lng: number }>,
  eixos: number,
): Promise<PedagioRotaResultado> {
  if (polyline.length < 2) {
    return {
      pedagio: 0,
      pedagio_por_eixo: 0,
      vale_pedagio: 0,
      pracas: [],
      free_flow: false,
      fonte: 'Dados Abertos ANTT + OpenStreetMap',
    }
  }

  // bbox da rota com margem
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const p of polyline) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng)
    maxLng = Math.max(maxLng, p.lng)
  }
  const pad = 0.06
  minLat -= pad
  maxLat += pad
  minLng -= pad
  maxLng += pad

  const RAIO_M = 900
  const DEDUPE_M = 350
  const hits: AnttPracaPedagio[] = []

  function jaTemProximo(lat: number, lng: number): boolean {
    return hits.some(
      (h) =>
        h.lat != null &&
        h.lng != null &&
        haversineM({ lat, lng }, { lat: h.lat, lng: h.lng }) < DEDUPE_M,
    )
  }

  let fonteAntt = false
  let fonteOsm = false
  try {
    const todas = await carregarPracasAntt()
    const candidatas = todas.filter(
      (p) =>
        p.lat >= minLat &&
        p.lat <= maxLat &&
        p.lng >= minLng &&
        p.lng <= maxLng,
    )
    for (const p of candidatas) {
      const d = distPontoPolilinhaM({ lat: p.lat, lng: p.lng }, polyline)
      if (d > RAIO_M) continue
      if (jaTemProximo(p.lat, p.lng)) continue
      const isOsm = p.fonte === 'osm'
      const base = tarifaBaseCarro(p.rodovia)
      const valor = valorPracaPorEixos(base, eixos)
      const sufixo =
        p.rodovia && p.uf ? ` (${p.rodovia}/${p.uf})` : p.rodovia ? ` (${p.rodovia})` : ''
      hits.push({
        nome: `${p.nome}${sufixo}`,
        valor,
        tipo: p.free_flow
          ? isOsm
            ? 'Free Flow / OCR (OSM)'
            : 'Free Flow / OCR'
          : isOsm
            ? 'Praça (OpenStreetMap)'
            : 'Praça convencional',
        free_flow: Boolean(p.free_flow),
        lat: p.lat,
        lng: p.lng,
      })
      if (isOsm) fonteOsm = true
      else fonteAntt = true
    }
  } catch {
    /* catálogo local indisponível */
  }

  const pedagio = roundMoney(hits.reduce((s, h) => s + h.valor, 0))
  const e = Math.max(1, eixos)
  const fontes = [
    fonteAntt ? 'ANTT' : null,
    fonteOsm ? 'OpenStreetMap' : null,
  ].filter(Boolean)
  return {
    pedagio,
    pedagio_por_eixo: roundMoney(pedagio / e),
    vale_pedagio: pedagio,
    pracas: hits,
    free_flow: hits.some((h) => h.free_flow),
    fonte:
      (fontes.length
        ? `Praças: ${fontes.join(' + ')}`
        : 'Sem praças georreferenciadas nesta rota') +
      ' · estimativa tarifária por eixos · Res. Vale-Pedágio 6.024/2023',
  }
}

export type PreferenciaOsrm = 'eficiente' | 'curta' | 'evitar_pedagio'

type OsrmRouteRaw = {
  distance?: number
  duration?: number
  geometry?: { coordinates?: [number, number][] }
}

function slimPolyline(coords: [number, number][]): Array<{ lat: number; lng: number }> {
  const polyline = coords.map(([lng, lat]) => ({ lat, lng }))
  // Mais pontos = melhor cruzamento com praças de pedágio
  const step = Math.max(1, Math.floor(polyline.length / 500))
  return polyline.filter((_, i) => i % step === 0 || i === polyline.length - 1)
}

function mapOsrmRoute(r: OsrmRouteRaw): {
  distanciaKm: number
  duracaoMin: number
  polyline: Array<{ lat: number; lng: number }>
} | null {
  if (!r.distance || !r.duration || !r.geometry?.coordinates?.length) return null
  return {
    distanciaKm: r.distance / 1000,
    duracaoMin: r.duration / 60,
    polyline: slimPolyline(r.geometry.coordinates),
  }
}

const OSRM_BASES = [
  'https://router.project-osrm.org',
  'https://routing.openstreetmap.de/routed-car',
]

async function fetchOsrmRoutesFromBase(
  base: string,
  origem: { lat: number; lng: number },
  destino: { lat: number; lng: number },
  opts?: { excludeToll?: boolean; alternatives?: boolean },
): Promise<OsrmRouteRaw[]> {
  try {
    const params = new URLSearchParams({
      overview: 'full',
      geometries: 'geojson',
      alternatives: opts?.alternatives ? 'true' : 'false',
    })
    if (opts?.excludeToll) params.set('exclude', 'toll')
    const url =
      `${base}/route/v1/driving/` +
      `${origem.lng},${origem.lat};${destino.lng},${destino.lat}?${params.toString()}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = (await res.json()) as { code?: string; routes?: OsrmRouteRaw[] }
    if (data.code && data.code !== 'Ok') return []
    return Array.isArray(data.routes) ? data.routes : []
  } catch {
    return []
  }
}

/** Une rotas de 1+ servidores OSRM (mais alternativas para curta vs eficiente). */
async function fetchOsrmRoutes(
  origem: { lat: number; lng: number },
  destino: { lat: number; lng: number },
  opts?: { excludeToll?: boolean; alternatives?: boolean },
): Promise<OsrmRouteRaw[]> {
  const batches = await Promise.all(
    OSRM_BASES.map((base) => fetchOsrmRoutesFromBase(base, origem, destino, opts)),
  )
  const all = batches.flat()
  // Dedup por distância/duração arredondadas
  const seen = new Set<string>()
  const unique: OsrmRouteRaw[] = []
  for (const r of all) {
    if (!r.distance || !r.duration) continue
    const key = `${Math.round(r.distance / 200)}:${Math.round(r.duration / 30)}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(r)
  }
  return unique
}

function escolherRota(
  routes: OsrmRouteRaw[],
  preferencia: 'eficiente' | 'curta',
): OsrmRouteRaw | null {
  const validas = routes.filter(
    (r) => r.distance && r.duration && r.geometry?.coordinates?.length,
  )
  if (validas.length === 0) return null
  if (preferencia === 'curta') {
    return validas.reduce((best, r) =>
      (r.distance ?? Infinity) < (best.distance ?? Infinity) ? r : best,
    )
  }
  // eficiente = menor tempo
  return validas.reduce((best, r) =>
    (r.duration ?? Infinity) < (best.duration ?? Infinity) ? r : best,
  )
}

/**
 * Rota OSRM:
 * - eficiente: entre alternativas, menor duração
 * - curta: entre alternativas, menor distância
 * - evitar_pedagio: exclude=toll (falha → null; quem chama trata a mensagem)
 */
export async function rotaOsrmComGeometria(
  origem: { lat: number; lng: number },
  destino: { lat: number; lng: number },
  opts?: { evitarPedagios?: boolean; preferencia?: PreferenciaOsrm },
): Promise<{
  distanciaKm: number
  duracaoMin: number
  polyline: Array<{ lat: number; lng: number }>
  preferencia?: PreferenciaOsrm
} | null> {
  try {
    const preferencia: PreferenciaOsrm =
      opts?.preferencia ?? (opts?.evitarPedagios ? 'evitar_pedagio' : 'eficiente')

    if (preferencia === 'evitar_pedagio') {
      const semToll = await fetchOsrmRoutes(origem, destino, {
        excludeToll: true,
        alternatives: true,
      })
      const escolhida = escolherRota(semToll, 'eficiente')
      if (!escolhida) return null
      const mapped = mapOsrmRoute(escolhida)
      if (!mapped) return null
      return { ...mapped, preferencia }
    }

    const routes = await fetchOsrmRoutes(origem, destino, { alternatives: true })
    const modo = preferencia === 'curta' ? 'curta' : 'eficiente'
    const escolhida = escolherRota(routes, modo)
    if (!escolhida) return null
    const mapped = mapOsrmRoute(escolhida)
    if (!mapped) return null
    return { ...mapped, preferencia: modo }
  } catch {
    return null
  }
}
