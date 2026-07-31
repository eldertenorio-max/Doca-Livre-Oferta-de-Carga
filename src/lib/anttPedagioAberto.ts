/**
 * Pedágio gratuito com Dados Abertos da ANTT (praças + coords) + OpenStreetMap + rota OSRM.
 * Fonte ANTT: https://dados.antt.gov.br/dataset/praca-de-pedagio (atualização mensal, CC-BY).
 * Complemento OSM: barrier=toll_booth / highway=toll_gantry (cobre pedágios estaduais, ex. ARTESP).
 * Tarifas por eixo: estimativa operacional a partir da tarifa-base típica por rodovia
 * (a ANTT não publica API REST de tarifas vigentes por categoria).
 */

import { roundMoney } from './businessRules'
import type { AnttPracaPedagio } from './anttFrete'

const ANTT_PACKAGE_API =
  'https://dados.antt.gov.br/api/3/action/package_show?id=praca-de-pedagio'

/** Fallbacks caso a API CKAN falhe — o resource id muda quando a ANTT republica o arquivo. */
const ANTT_PRACAS_URL_FALLBACKS = [
  'https://dados.antt.gov.br/dataset/a7e1e12d-f8e8-40cd-bc1f-57973a4a4a6d/resource/d400debd-8058-4971-9625-8b614b08cf9c/download/dados-dos-pracas-de-pedagio6_2026.json',
  'https://dados.antt.gov.br/dataset/a7e1e12d-f8e8-40cd-bc1f-57973a4a4a6d/resource/5e57925f-b4b5-4bc3-ab23-8ee41346e472/download/dados_das_pracas_de_pedagio.json',
]

const CACHE_KEY = 'doca-livre-antt-pracas-v3'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const OSM_CACHE_PREFIX = 'doca-livre-osm-tolls-v1:'
const OSM_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_UA = 'DocaLivre/1.0 (https://docalivre.com; contato@docalivre.com)'

export type PracaAntt = {
  nome: string
  concessionaria: string
  rodovia: string
  uf: string
  lat: number
  lng: number
  free_flow?: boolean
}

type CacheBlob = { at: number; pracas: PracaAntt[] }

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

function parseCoord(v: unknown): number {
  if (typeof v === 'number') return v
  const s = String(v ?? '').trim().replace(',', '.')
  return Number(s)
}

function normalizarPracas(raw: unknown): PracaAntt[] {
  const root = raw as Record<string, unknown>
  const arr = (root['praca-de-pedagio'] || root.data || raw) as unknown
  if (!Array.isArray(arr)) return []
  const out: PracaAntt[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const situacao = String(o.situacao || '').toLowerCase()
    if (situacao && situacao !== 'ativo') continue
    const lat = parseCoord(o.latitude)
    const lng = parseCoord(o.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const nome = String(o.praca_de_pedagio || o.praca || 'Praça').trim()
    const rodovia = String(o.rodovia || '').trim()
    const nomeLower = nome.toLowerCase()
    const free_flow =
      /free.?flow|p[oó]rtico|ocr|livre passagem|eletr[oô]nic/.test(nomeLower) ||
      /free.?flow/.test(String(o.tipo_de_pista || '').toLowerCase())
    out.push({
      nome,
      concessionaria: String(o.concessionaria || '').trim(),
      rodovia,
      uf: String(o.uf || '').trim(),
      lat,
      lng,
      free_flow,
    })
  }
  return out
}

async function resolverUrlPracasAntt(): Promise<string[]> {
  const urls = [...ANTT_PRACAS_URL_FALLBACKS]
  try {
    const res = await fetch(ANTT_PACKAGE_API, {
      headers: { Accept: 'application/json', 'User-Agent': FETCH_UA },
    })
    if (!res.ok) return urls
    const data = (await res.json()) as {
      success?: boolean
      result?: {
        resources?: Array<{ format?: string; url?: string; name?: string }>
      }
    }
    const resources = data.result?.resources ?? []
    const jsonUrls = resources
      .filter(
        (r) =>
          String(r.format || '').toUpperCase() === 'JSON' &&
          String(r.url || '').includes('/download/'),
      )
      .map((r) => String(r.url))
      .filter(Boolean)
    // Preferir o recurso mais recente (geralmente o último da lista)
    for (let i = jsonUrls.length - 1; i >= 0; i--) {
      if (!urls.includes(jsonUrls[i])) urls.unshift(jsonUrls[i])
    }
  } catch {
    /* usa fallbacks */
  }
  return urls
}

export async function carregarPracasAntt(force = false): Promise<PracaAntt[]> {
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
          return blob.pracas
        }
      }
    } catch {
      /* ignore */
    }
  }

  const urls = await resolverUrlPracasAntt()
  let lastErr: Error | null = null
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': FETCH_UA },
      })
      if (!res.ok) {
        lastErr = new Error(`ANTT praças HTTP ${res.status}`)
        continue
      }
      const json = await res.json()
      const pracas = normalizarPracas(json)
      if (pracas.length === 0) {
        lastErr = new Error('ANTT praças vazias')
        continue
      }
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
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastErr ?? new Error('Falha ao carregar praças ANTT')
}

type OsmToll = { nome: string; lat: number; lng: number; free_flow?: boolean }

async function carregarPracasOsmNaBbox(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
): Promise<OsmToll[]> {
  const key =
    OSM_CACHE_PREFIX +
    [minLat, minLng, maxLat, maxLng].map((n) => n.toFixed(3)).join('|')
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const blob = JSON.parse(raw) as { at: number; items: OsmToll[] }
        if (Date.now() - blob.at < OSM_CACHE_TTL_MS && Array.isArray(blob.items)) {
          return blob.items
        }
      }
    } catch {
      /* ignore */
    }
  }

  const q = `[out:json][timeout:35];(
  node["barrier"="toll_booth"](${minLat},${minLng},${maxLat},${maxLng});
  node["highway"="toll_gantry"](${minLat},${minLng},${maxLat},${maxLng});
);out body;`
  const bases = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ]
  for (const base of bases) {
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': FETCH_UA,
        },
        body: `data=${encodeURIComponent(q)}`,
      })
      if (!res.ok) continue
      const txt = await res.text()
      if (!txt.trim().startsWith('{')) continue
      const data = JSON.parse(txt) as {
        elements?: Array<{
          lat?: number
          lon?: number
          tags?: Record<string, string>
        }>
      }
      const items: OsmToll[] = []
      for (const el of data.elements ?? []) {
        if (el.lat == null || el.lon == null) continue
        const tags = el.tags || {}
        const nome =
          tags.name || tags.operator || tags.ref || tags.brand || 'Pedágio'
        const free_flow =
          /free.?flow|p[oó]rtico|gantry|eletr[oô]nic/i.test(
            `${nome} ${tags.highway || ''} ${tags.barrier || ''}`,
          ) || tags.highway === 'toll_gantry'
        items.push({ nome, lat: el.lat, lng: el.lon, free_flow })
      }
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(key, JSON.stringify({ at: Date.now(), items }))
        } catch {
          /* ignore */
        }
      }
      return items
    } catch {
      /* tenta próximo mirror */
    }
  }
  return []
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
      const base = tarifaBaseCarro(p.rodovia)
      const valor = valorPracaPorEixos(base, eixos)
      hits.push({
        nome: `${p.nome} (${p.rodovia}/${p.uf})`,
        valor,
        tipo: p.free_flow ? 'Free Flow / OCR' : 'Praça convencional',
        free_flow: Boolean(p.free_flow),
        lat: p.lat,
        lng: p.lng,
      })
      fonteAntt = true
    }
  } catch {
    /* ANTT offline/URL antiga — segue com OSM */
  }

  let fonteOsm = false
  try {
    const osm = await carregarPracasOsmNaBbox(minLat, minLng, maxLat, maxLng)
    for (const p of osm) {
      const d = distPontoPolilinhaM({ lat: p.lat, lng: p.lng }, polyline)
      if (d > RAIO_M) continue
      if (jaTemProximo(p.lat, p.lng)) continue
      const valor = valorPracaPorEixos(tarifaBaseCarro(''), eixos)
      hits.push({
        nome: p.nome,
        valor,
        tipo: p.free_flow ? 'Free Flow / OCR (OSM)' : 'Praça (OpenStreetMap)',
        free_flow: Boolean(p.free_flow),
        lat: p.lat,
        lng: p.lng,
      })
      fonteOsm = true
    }
  } catch {
    /* OSM indisponível */
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
