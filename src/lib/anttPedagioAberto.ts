/**
 * Pedágio gratuito com Dados Abertos da ANTT (praças + coords) + rota OSRM.
 * Fonte: https://dados.antt.gov.br/dataset/praca-de-pedagio (atualização mensal, CC-BY).
 * Tarifas por eixo: estimativa operacional a partir da tarifa-base típica por rodovia
 * (a ANTT não publica API REST de tarifas vigentes por categoria).
 */

import { roundMoney } from './businessRules'
import type { AnttPracaPedagio } from './anttFrete'

const ANTT_PRACAS_URL =
  'https://dados.antt.gov.br/dataset/a7e1e12d-f8e8-40cd-bc1f-57973a4a4a6d/resource/83d29bc8-0fdd-49a2-9fe9-023ace398c35/download/dados-dos-praas-de-pedgio.json'

const CACHE_KEY = 'doca-livre-antt-pracas-v1'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

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

/** Distância mínima do ponto à polilinha (m). */
function distPontoPolilinhaM(
  p: { lat: number; lng: number },
  line: Array<{ lat: number; lng: number }>,
): number {
  let min = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]
    const b = line[i + 1]
    // amostra 3 pontos do segmento
    for (const t of [0, 0.5, 1]) {
      const q = {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      }
      min = Math.min(min, haversineM(p, q))
    }
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

export async function carregarPracasAntt(force = false): Promise<PracaAntt[]> {
  if (!force && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const blob = JSON.parse(raw) as CacheBlob
        if (Date.now() - blob.at < CACHE_TTL_MS && Array.isArray(blob.pracas)) {
          return blob.pracas
        }
      }
    } catch {
      /* ignore */
    }
  }

  const res = await fetch(ANTT_PRACAS_URL, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`ANTT praças HTTP ${res.status}`)
  const json = await res.json()
  const pracas = normalizarPracas(json)

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), pracas } satisfies CacheBlob))
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
 * Cruza a polilinha da rota com praças ANTT (raio ~220 m) e estima o pedágio.
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
      fonte: 'Dados Abertos ANTT',
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
  const pad = 0.08
  minLat -= pad
  maxLat += pad
  minLng -= pad
  maxLng += pad

  const todas = await carregarPracasAntt()
  const candidatas = todas.filter(
    (p) => p.lat >= minLat && p.lat <= maxLat && p.lng >= minLng && p.lng <= maxLng,
  )

  const RAIO_M = 220
  const hits: AnttPracaPedagio[] = []
  const seen = new Set<string>()

  for (const p of candidatas) {
    const d = distPontoPolilinhaM({ lat: p.lat, lng: p.lng }, polyline)
    if (d > RAIO_M) continue
    const key = `${p.nome}|${p.rodovia}|${p.lat.toFixed(4)}`
    if (seen.has(key)) continue
    seen.add(key)
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
  }

  const pedagio = roundMoney(hits.reduce((s, h) => s + h.valor, 0))
  const e = Math.max(1, eixos)
  return {
    pedagio,
    pedagio_por_eixo: roundMoney(pedagio / e),
    vale_pedagio: pedagio,
    pracas: hits,
    free_flow: hits.some((h) => h.free_flow),
    fonte: 'Dados Abertos ANTT (praças) + estimativa tarifária por eixos · Res. Vale-Pedágio 6.024/2023',
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
  const step = Math.max(1, Math.floor(polyline.length / 180))
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
