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
 * Tarifa-base (automóvel / cat.1) estimada por rodovia.
 * Referência operacional ARTESP/ANTT 2026 (cobrança por eixo = esta tarifa × eixos).
 */
function tarifaBaseCarro(rodovia: string, nome = ''): number {
  const r = `${rodovia} ${nome}`.toUpperCase().replace(/\s+/g, '')
  if (/SP-?280|CASTELO|SP-?270|RAPOSO/.test(r)) return 3.65
  if (/SP-?021|RODOANEL/.test(r)) return 3.5
  if (/BR-?116|DUTRA|SP-?070|AYRTON|BANDEIRANTES|SP-?348/.test(r)) return 3.8
  if (/BR-?101|BR-?040|BR-?381|SP-?330|ANHANGUERA/.test(r)) return 3.7
  if (/BR-?153|BR-?262|BR-?277|BR-?376|BR-?050/.test(r)) return 3.4
  if (/BR-?290|BR-?386|BR-?163|BR-?364/.test(r)) return 3.2
  return 3.5
}

/**
 * Caminhão: tarifa = valor do automóvel × número de eixos (regra ARTESP / maioria das concessões).
 */
function valorPracaPorEixos(tarifaCarro: number, eixos: number): number {
  const e = Math.max(2, Math.min(9, Math.round(eixos)))
  return roundMoney(tarifaCarro * e)
}

export type PedagioRotaResultado = {
  pedagio: number
  pedagio_por_eixo: number
  vale_pedagio: number
  pracas: AnttPracaPedagio[]
  free_flow: boolean
  fonte: string
}

function normTxt(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Praça antiga / fora de uso no catálogo ANTT (ex. "1 Norte - Defasada"). */
function nomePracaObsoleta(nome: string): boolean {
  return /\b(defasada|desativad|desativada|inativa|inativo)\b/i.test(nome)
}

/**
 * Mesma estação em sentidos opostos ou fontes diferentes:
 * "1 Norte (Mairiporã)", "1 Sul (Mairiporã)" e "1 Norte - Defasada" → uma chave.
 */
function chavePraca(p: { nome: string; concessionaria: string; rodovia: string }): string {
  const nome = normTxt(p.nome)
    .replace(/\b(free flow|ocr|portico|praca|pedagio|defasada|desativada|desativado|inativa|inativo)\b/g, ' ')
    .replace(/\b(norte|sul|leste|oeste|sentido|autopista)\b/g, ' ')
    .replace(/\b(de|da|do|das|dos)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const conc = normTxt(p.concessionaria)
    .replace(/\b(autopista|concessionaria)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const rod = normTxt(p.rodovia).replace(/\s+/g, '')
  return `${conc}|${rod}|${nome}`
}

/**
 * Cruza a polilinha da rota com praças ANTT + OSM.
 * Raio curto (~250 m) para não pegar praça de rodovia paralela (comum na Grande SP).
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
  const pad = 0.03
  minLat -= pad
  maxLat += pad
  minLng -= pad
  maxLng += pad

  const RAIO_M = 250
  /** Norte/Sul da mesma praça ficam ~1 km; 500 m não junta. */
  const DEDUPE_M = 500
  /** OSM costuma repetir a mesma cabine ANTT com outro nome (ex. "Autopista Fernão Dias"). */
  const DEDUPE_OSM_ANTT_M = 2500

  type Cand = PracaAntt & { dist: number }
  const candidatos: Cand[] = []

  let fonteAntt = false
  let fonteOsm = false
  try {
    const todas = await carregarPracasAntt()
    const noBbox = todas.filter(
      (p) =>
        p.lat >= minLat &&
        p.lat <= maxLat &&
        p.lng >= minLng &&
        p.lng <= maxLng,
    )
    for (const p of noBbox) {
      const d = distPontoPolilinhaM({ lat: p.lat, lng: p.lng }, polyline)
      if (d > RAIO_M) continue
      candidatos.push({ ...p, dist: d })
    }
  } catch {
    /* catálogo local indisponível */
  }

  candidatos.sort((a, b) => {
    const obsoletaA = nomePracaObsoleta(a.nome) ? 1 : 0
    const obsoletaB = nomePracaObsoleta(b.nome) ? 1 : 0
    if (obsoletaA !== obsoletaB) return obsoletaA - obsoletaB
    const osmA = a.fonte === 'osm' ? 1 : 0
    const osmB = b.fonte === 'osm' ? 1 : 0
    if (osmA !== osmB) return osmA - osmB
    return a.dist - b.dist
  })

  const hits: AnttPracaPedagio[] = []
  const chaves = new Set<string>()
  let porticosFreeFlow = 0

  function pareceFreeFlow(p: PracaAntt): boolean {
    if (p.free_flow) return true
    return /free.?flow|p[oó]rtico|\bpfe\s*\d+/i.test(`${p.nome} ${p.rodovia}`)
  }

  function jaTem(c: Cand, isOsm: boolean): boolean {
    const key = chavePraca(c)
    if (key && chaves.has(key)) return true
    return hits.some((h) => {
      if (h.lat == null || h.lng == null) return false
      const d = haversineM({ lat: c.lat, lng: c.lng }, { lat: h.lat, lng: h.lng })
      const anttHit = h.tipo !== 'Praça (OpenStreetMap)'
      const lim = isOsm && anttHit ? DEDUPE_OSM_ANTT_M : DEDUPE_M
      return d < lim
    })
  }

  for (const p of candidatos) {
    if (pareceFreeFlow(p)) {
      porticosFreeFlow += 1
      continue
    }
    if (nomePracaObsoleta(p.nome)) continue
    const isOsm = p.fonte === 'osm'
    if (jaTem(p, isOsm)) continue
    const raioOsm = isOsm ? 160 : RAIO_M
    if (p.dist > raioOsm) continue
    const base = tarifaBaseCarro(p.rodovia, p.nome)
    const valor = valorPracaPorEixos(base, eixos)
    const sufixo =
      p.rodovia && p.uf ? ` (${p.rodovia}/${p.uf})` : p.rodovia ? ` (${p.rodovia})` : ''
    hits.push({
      nome: `${p.nome}${sufixo}`,
      valor,
      tipo: isOsm ? 'Praça (OpenStreetMap)' : 'Praça convencional',
      free_flow: false,
      lat: p.lat,
      lng: p.lng,
    })
    const key = chavePraca(p)
    if (key) chaves.add(key)
    if (isOsm) fonteOsm = true
    else fonteAntt = true
  }

  const pedagio = roundMoney(hits.reduce((s, h) => s + h.valor, 0))
  const e = Math.max(1, eixos)
  const fontes = [
    fonteAntt ? 'ANTT' : null,
    fonteOsm ? 'OpenStreetMap' : null,
  ].filter(Boolean)
  const avisoFf =
    porticosFreeFlow > 0
      ? ` · ${porticosFreeFlow} pórtico(s) Free Flow próximos não somados (rota alternativa / conferir se o trecho é tarifado)`
      : ''
  return {
    pedagio,
    pedagio_por_eixo: roundMoney(pedagio / e),
    vale_pedagio: pedagio,
    pracas: hits,
    free_flow: porticosFreeFlow > 0,
    fonte:
      (fontes.length
        ? `Praças convencionais: ${fontes.join(' + ')}`
        : 'Nenhuma praça convencional nesta rota') +
      avisoFf +
      ' · tarifa por eixo (cat.1 × eixos) · Res. Vale-Pedágio 6.024/2023',
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
  const step = Math.max(1, Math.floor(polyline.length / 1200))
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

/** Valhalla polyline6 (precisão 1e6). */
function decodePolyline6(encoded: string): Array<{ lat: number; lng: number }> {
  let i = 0
  let lat = 0
  let lng = 0
  const out: Array<{ lat: number; lng: number }> = []
  while (i < encoded.length) {
    let b = 0
    let shift = 0
    let result = 0
    do {
      b = encoded.charCodeAt(i++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlat = result & 1 ? ~(result >> 1) : result >> 1
    lat += dlat
    shift = 0
    result = 0
    do {
      b = encoded.charCodeAt(i++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlng = result & 1 ? ~(result >> 1) : result >> 1
    lng += dlng
    out.push({ lat: lat / 1e6, lng: lng / 1e6 })
  }
  return out
}

function slimLatLng(
  line: Array<{ lat: number; lng: number }>,
): Array<{ lat: number; lng: number }> {
  const step = Math.max(1, Math.floor(line.length / 1200))
  return line.filter((_, i) => i % step === 0 || i === line.length - 1)
}

const VALHALLA_URL = 'https://valhalla1.openstreetmap.de/route'

/**
 * Rodoanel Norte trecho 2 (Fernão Dias → Av. Raimundo Pereira de Magalhães).
 * O OSM/Valhalla trata o alinhamento como motorway aberta, mas em ago/2026
 * só o trecho 1 (Dutra ↔ Fernão Dias) opera; o trecho 2 segue em obras.
 * Anel Valhalla: [lon, lat]. Remover quando o trecho 2 for liberado.
 */
const EXCLUDE_RODOANEL_NORTE_TRECHO2: number[][] = [
  [-46.79, -23.4],
  [-46.72, -23.39],
  [-46.64, -23.395],
  [-46.585, -23.405],
  [-46.568, -23.43],
  [-46.575, -23.455],
  [-46.64, -23.465],
  [-46.72, -23.46],
  [-46.785, -23.478],
  [-46.798, -23.45],
]

type CostingValhalla = 'auto' | 'truck'

function costingDeEixos(eixos?: number): CostingValhalla {
  return eixos != null && eixos >= 3 ? 'truck' : 'auto'
}

/**
 * OSM (Valhalla/OSRM) no Brasil costuma marcar ~70 km/h em rodovia.
 * QualP/Google na Fernão Dias ficam ~92 km/h. Só ajusta trecho interurbano
 * já em velocidade de estrada (não cidade lenta).
 */
function calibrarDuracaoRodovia(km: number, duracaoMin: number): number {
  if (km < 80 || duracaoMin <= 0) return duracaoMin
  const vel = km / (duracaoMin / 60)
  if (vel < 55 || vel >= 88) return duracaoMin
  return (km / 92) * 60
}

function comDuracaoCalibrada<T extends { distanciaKm: number; duracaoMin: number }>(
  r: T,
): T {
  return { ...r, duracaoMin: calibrarDuracaoRodovia(r.distanciaKm, r.duracaoMin) }
}

async function fetchValhallaRoute(
  pontos: Array<{ lat: number; lng: number }>,
  opts: { useTolls: number; costing?: CostingValhalla },
): Promise<{
  distanciaKm: number
  duracaoMin: number
  polyline: Array<{ lat: number; lng: number }>
} | null> {
  if (pontos.length < 2) return null
  const costing: CostingValhalla = opts.costing ?? 'auto'
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 12000) : 0
  try {
    const res = await fetch(VALHALLA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl?.signal,
      body: JSON.stringify({
        locations: pontos.map((p) => ({ lat: p.lat, lon: p.lng })),
        costing,
        costing_options: {
          [costing]: { use_tolls: opts.useTolls, use_highways: 1 },
        },
        exclude_polygons: [EXCLUDE_RODOANEL_NORTE_TRECHO2],
        shape_format: 'polyline6',
        units: 'kilometers',
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      trip?: {
        summary?: { length?: number; time?: number }
        legs?: Array<{ shape?: string }>
      }
    }
    const legs = data.trip?.legs ?? []
    const line = legs.flatMap((l) => (l.shape ? decodePolyline6(l.shape) : []))
    const km = Number(data.trip?.summary?.length)
    const sec = Number(data.trip?.summary?.time)
    if (!line.length || !Number.isFinite(km) || km <= 0 || !Number.isFinite(sec)) return null
    return {
      distanciaKm: km,
      duracaoMin: sec / 60,
      polyline: slimLatLng(line),
    }
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const OSRM_BASES = [
  'https://router.project-osrm.org',
  'https://routing.openstreetmap.de/routed-car',
]

async function fetchOsrmRoutesFromBase(
  base: string,
  pontos: Array<{ lat: number; lng: number }>,
  opts?: { excludeToll?: boolean; alternatives?: boolean },
): Promise<OsrmRouteRaw[]> {
  if (pontos.length < 2) return []
  try {
    const params = new URLSearchParams({
      overview: 'full',
      geometries: 'geojson',
      alternatives: opts?.alternatives && pontos.length === 2 ? 'true' : 'false',
    })
    if (opts?.excludeToll) params.set('exclude', 'toll')
    const path = pontos.map((p) => `${p.lng},${p.lat}`).join(';')
    const url = `${base}/route/v1/driving/${path}?${params.toString()}`
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
  pontos: Array<{ lat: number; lng: number }>,
  opts?: { excludeToll?: boolean; alternatives?: boolean },
): Promise<OsrmRouteRaw[]> {
  const batches = await Promise.all(
    OSRM_BASES.map((base) => fetchOsrmRoutesFromBase(base, pontos, opts)),
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
 * Rota:
 * - eficiente: Valhalla use_tolls=0.5 (menor tempo, como QualP Rota 1)
 * - curta: OSRM menor distância
 * - evitar_pedagio: Valhalla use_tolls=0 (OSRM público não aceita exclude=toll)
 * Caminhão (3+ eixos) usa perfil truck. Duração em rodovia calibrada (~92 km/h).
 */
export async function rotaOsrmComGeometria(
  origem: { lat: number; lng: number },
  destino: { lat: number; lng: number },
  opts?: {
    evitarPedagios?: boolean
    preferencia?: PreferenciaOsrm
    /** Paradas intermediárias entre origem e destino. */
    waypoints?: Array<{ lat: number; lng: number }>
    /** Define perfil Valhalla auto vs truck. */
    eixos?: number
  },
): Promise<{
  distanciaKm: number
  duracaoMin: number
  polyline: Array<{ lat: number; lng: number }>
  preferencia?: PreferenciaOsrm
} | null> {
  try {
    const preferencia: PreferenciaOsrm =
      opts?.preferencia ?? (opts?.evitarPedagios ? 'evitar_pedagio' : 'eficiente')
    const vias = (opts?.waypoints || []).filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
    )
    const pontos = [origem, ...vias, destino]
    const costing = costingDeEixos(opts?.eixos)

    if (preferencia === 'evitar_pedagio') {
      const valhalla = await fetchValhallaRoute(pontos, { useTolls: 0, costing })
      if (valhalla) return { ...comDuracaoCalibrada(valhalla), preferencia }
      const routes = await fetchOsrmRoutes(pontos, { alternatives: true })
      const escolhida = escolherRota(routes, 'eficiente')
      if (!escolhida) return null
      const mapped = mapOsrmRoute(escolhida)
      if (!mapped) return null
      return { ...comDuracaoCalibrada(mapped), preferencia }
    }

    if (preferencia === 'eficiente') {
      const valhalla = await fetchValhallaRoute(pontos, { useTolls: 0.5, costing })
      if (valhalla) return { ...comDuracaoCalibrada(valhalla), preferencia }
      const routes = await fetchOsrmRoutes(pontos, { alternatives: true })
      const escolhida = escolherRota(routes, 'eficiente')
      if (!escolhida) return null
      const mapped = mapOsrmRoute(escolhida)
      if (!mapped) return null
      return { ...comDuracaoCalibrada(mapped), preferencia }
    }

    const routes = await fetchOsrmRoutes(pontos, { alternatives: true })
    const escolhida = escolherRota(routes, 'curta')
    if (!escolhida) return null
    const mapped = mapOsrmRoute(escolhida)
    if (!mapped) return null
    return { ...comDuracaoCalibrada(mapped), preferencia: 'curta' }
  } catch {
    return null
  }
}
