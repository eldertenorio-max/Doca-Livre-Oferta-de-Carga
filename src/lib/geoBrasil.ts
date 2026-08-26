import { UF_CENTRO, type UfBr } from './mapaLogisticaIntel'
import { normalizarTexto } from './cidadesBrasil'
import { agruparDistritosEmZonasSp, MUN_SAO_PAULO_ID } from './zonasSaoPaulo'

export const UF_IBGE: Record<UfBr, string> = {
  RO: '11',
  AC: '12',
  AM: '13',
  RR: '14',
  PA: '15',
  AP: '16',
  TO: '17',
  MA: '21',
  PI: '22',
  CE: '23',
  RN: '24',
  PB: '25',
  PE: '26',
  AL: '27',
  SE: '28',
  BA: '29',
  MG: '31',
  ES: '32',
  RJ: '33',
  SP: '35',
  PR: '41',
  SC: '42',
  RS: '43',
  MS: '50',
  MT: '51',
  GO: '52',
  DF: '53',
}

export const IBGE_PARA_UF: Record<string, UfBr> = Object.fromEntries(
  Object.entries(UF_IBGE).map(([uf, cod]) => [cod, uf as UfBr]),
) as Record<string, UfBr>

export type MunicipioCat = {
  id: string
  nome: string
  uf: UfBr
  lat: number
  lng: number
}

export type GeoProps = {
  id: string
  nome: string
  uf?: UfBr
  regiao?: string
  municipioId?: string
  tipo?: 'bairro' | 'distrito' | 'zona'
  /** Nome da zona (São Paulo capital). */
  zona?: string
  /** Id legado da zona, se a área foi marcada no agrupamento antigo. */
  zonaId?: string
}

/** Códigos IBGE das 5 grandes regiões. */
export const IBGE_REGIAO: Record<string, string> = {
  '1': 'Norte',
  '2': 'Nordeste',
  '3': 'Sudeste',
  '4': 'Sul',
  '5': 'Centro-Oeste',
}

export type GeoFc = GeoJSON.FeatureCollection<GeoJSON.Geometry, GeoProps>

const cacheUfs = new Map<string, GeoFc>()
const cacheMun = new Map<string, GeoFc>()
const cacheRegioes = new Map<string, GeoFc>()
const cacheBairros = new Map<string, GeoFc>()
const cacheShpUf = new Map<string, Promise<GeoJSON.FeatureCollection>>()

const IBGE_GEOFP_INTRA =
  'https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022'
let catalogo: MunicipioCat[] | null = null
let catalogoPendente: Promise<MunicipioCat[]> | null = null

function asFc(raw: unknown): GeoJSON.FeatureCollection {
  const fc = raw as GeoJSON.FeatureCollection
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw new Error('GeoJSON inválido')
  }
  return fc
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function propsCodarea(props: GeoJSON.GeoJsonProperties | null): string {
  const p = props ?? {}
  const v = (p as { codarea?: string; id?: string | number }).codarea ?? (p as { id?: string | number }).id
  return String(v ?? '').trim()
}

/** Malha dos 27 UFs (IBGE). */
export async function carregarMalhaUfs(): Promise<GeoFc> {
  const hit = cacheUfs.get('BR')
  if (hit) return hit
  const raw = asFc(
    await fetchJson(
      'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF',
    ),
  )
  const fc: GeoFc = {
    type: 'FeatureCollection',
    features: raw.features.map((f) => {
      const cod = propsCodarea(f.properties)
      const uf = IBGE_PARA_UF[cod]
      const nome = uf ? UF_CENTRO[uf].nome : cod
      return {
        ...f,
        properties: {
          id: cod,
          nome,
          uf: uf ?? ('SP' as UfBr),
        },
      }
    }),
  }
  cacheUfs.set('BR', fc)
  return fc
}

/** Malha das 5 grandes regiões (IBGE). */
export async function carregarMalhaRegioes(): Promise<GeoFc> {
  const hit = cacheRegioes.get('BR')
  if (hit) return hit
  const raw = asFc(
    await fetchJson(
      'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=regiao',
    ),
  )
  const fc: GeoFc = {
    type: 'FeatureCollection',
    features: raw.features.map((f) => {
      const cod = propsCodarea(f.properties)
      const nome = IBGE_REGIAO[cod] || `Região ${cod}`
      return {
        ...f,
        properties: {
          id: cod,
          nome,
          regiao: nome,
        },
      }
    }),
  }
  cacheRegioes.set('BR', fc)
  return fc
}

type IbgeMun = {
  id: number
  nome: string
}

/** Municípios de um estado (polígonos + nome). */
export async function carregarMalhaMunicipios(uf: UfBr): Promise<GeoFc> {
  const cached = cacheMun.get(uf)
  if (cached) return cached
  const cod = UF_IBGE[uf]
  const [malhaRaw, nomesRaw] = await Promise.all([
    fetchJson(
      `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${cod}?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio`,
    ),
    fetchJson(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${cod}/municipios`),
  ])
  const malha = asFc(malhaRaw)
  const nomes = new Map<string, string>()
  for (const m of nomesRaw as IbgeMun[]) {
    nomes.set(String(m.id), m.nome)
  }
  const fc: GeoFc = {
    type: 'FeatureCollection',
    features: malha.features.map((f) => {
      const id = propsCodarea(f.properties)
      return {
        ...f,
        properties: {
          id,
          nome: nomes.get(id) || id,
          uf,
        },
      }
    }),
  }
  cacheMun.set(uf, fc)
  return fc
}

/** Brasil inteiro dividido por município (IBGE, qualidade mínima). */
export async function carregarMalhaMunicipiosBrasil(): Promise<GeoFc> {
  const hit = cacheMun.get('BR')
  if (hit) return hit
  const [malhaRaw, cats] = await Promise.all([
    fetchJson(
      'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio',
    ),
    carregarCatalogoMunicipios().catch(() => [] as MunicipioCat[]),
  ])
  const malha = asFc(malhaRaw)
  const nomes = new Map(cats.map((c) => [c.id, c]))
  const fc: GeoFc = {
    type: 'FeatureCollection',
    features: malha.features.map((f) => {
      const id = propsCodarea(f.properties)
      const hitCat = nomes.get(id)
      const uf = hitCat?.uf ?? IBGE_PARA_UF[id.slice(0, 2)]
      return {
        ...f,
        properties: {
          id,
          nome: hitCat?.nome || id,
          uf,
        },
      }
    }),
  }
  cacheMun.set('BR', fc)
  return fc
}

type OsmPt = { lat: number; lon: number }
type OsmEl = {
  type: 'way' | 'relation' | 'node'
  id: number
  tags?: Record<string, string>
  geometry?: OsmPt[]
  members?: Array<{ role?: string; geometry?: OsmPt[] }>
}

function fecharAnel(coords: number[][]): number[][] {
  if (coords.length < 3) return coords
  const a = coords[0]
  const b = coords[coords.length - 1]
  if (a[0] !== b[0] || a[1] !== b[1]) return [...coords, a]
  return coords
}

function distPontoReta(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

function douglasPeucker(pts: number[][], eps: number): number[][] {
  if (pts.length <= 4) return pts
  let maxD = 0
  let idx = 0
  const end = pts.length - 1
  for (let i = 1; i < end; i++) {
    const d = distPontoReta(pts[i], pts[0], pts[end])
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD > eps) {
    const left = douglasPeucker(pts.slice(0, idx + 1), eps)
    const right = douglasPeucker(pts.slice(idx), eps)
    return left.slice(0, -1).concat(right)
  }
  return [pts[0], pts[end]]
}

function simplificarAnel(ring: number[][], eps = 0.0003): number[][] {
  if (ring.length <= 16) return fecharAnel(ring)
  const aberto =
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring
  return fecharAnel(douglasPeucker(aberto, eps))
}

function simplificarGeom(g: GeoJSON.Geometry): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (g.type === 'Polygon') {
    const rings = g.coordinates.map((r) => simplificarAnel(r)).filter((r) => r.length >= 4)
    if (!rings.length) return null
    return { type: 'Polygon', coordinates: rings }
  }
  if (g.type === 'MultiPolygon') {
    const polys = g.coordinates
      .map((poly) => poly.map((r) => simplificarAnel(r)).filter((r) => r.length >= 4))
      .filter((poly) => poly.length > 0)
    if (!polys.length) return null
    if (polys.length === 1) return { type: 'Polygon', coordinates: polys[0] }
    return { type: 'MultiPolygon', coordinates: polys }
  }
  return null
}

function propCampo(p: GeoJSON.GeoJsonProperties | null, keys: string[]): string {
  if (!p) return ''
  const rec = p as Record<string, unknown>
  for (const k of keys) {
    const v = rec[k]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return ''
}

function ufDoMunicipio(municipioId: string, uf?: UfBr): UfBr {
  if (uf) return uf
  const found = IBGE_PARA_UF[municipioId.slice(0, 2)]
  if (!found) throw new Error('UF desconhecida para este município')
  return found
}

function urlMalhaIbge(tipo: 'bairros' | 'distritos', uf: UfBr): string {
  return `${IBGE_GEOFP_INTRA}/${tipo}/shp/UF/${uf}_${tipo}_CD2022.zip`
}

async function carregarShpIbge(url: string): Promise<GeoJSON.FeatureCollection> {
  const hit = cacheShpUf.get(url)
  if (hit) return hit
  const pendente = (async () => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    const { default: shp } = await import('shpjs')
    const parsed = await shp(buf)
    if (Array.isArray(parsed)) {
      return {
        type: 'FeatureCollection' as const,
        features: parsed.flatMap((g) => g.features ?? []),
      }
    }
    return parsed
  })()
  cacheShpUf.set(url, pendente)
  try {
    return await pendente
  } catch (e) {
    cacheShpUf.delete(url)
    throw e
  }
}

function malhaIbgeDoMunicipio(
  raw: GeoJSON.FeatureCollection,
  municipioId: string,
  uf: UfBr,
  tipo: 'bairro' | 'distrito',
): GeoFc {
  const features: GeoFc['features'] = []
  const seen = new Set<string>()
  for (const f of raw.features) {
    const mun = propCampo(f.properties, ['CD_MUN', 'cd_mun'])
    if (mun !== municipioId) continue
    const nome =
      tipo === 'bairro'
        ? propCampo(f.properties, ['NM_BAIRRO', 'nm_bairro', 'NM_DIST', 'nm_dist'])
        : propCampo(f.properties, ['NM_DIST', 'nm_dist', 'NM_BAIRRO', 'nm_bairro'])
    const codigo =
      tipo === 'bairro'
        ? propCampo(f.properties, ['CD_BAIRRO', 'cd_bairro'])
        : propCampo(f.properties, ['CD_DIST', 'cd_dist'])
    if (!nome || !f.geometry) continue
    const geom = simplificarGeom(f.geometry)
    if (!geom) continue
    const id = `b-${codigo || `${municipioId}-${nome.toLowerCase()}`}`
    if (seen.has(id)) continue
    seen.add(id)
    features.push({
      type: 'Feature',
      geometry: geom,
      properties: { id, nome, uf, municipioId, tipo },
    })
  }
  return { type: 'FeatureCollection', features }
}

async function tentarMalhaIbge(
  tipo: 'bairros' | 'distritos',
  municipioId: string,
  uf: UfBr,
): Promise<GeoFc | null> {
  try {
    const raw = await carregarShpIbge(urlMalhaIbge(tipo, uf))
    const fc = malhaIbgeDoMunicipio(raw, municipioId, uf, tipo === 'bairros' ? 'bairro' : 'distrito')
    return fc.features.length >= 2 ? fc : null
  } catch {
    return null
  }
}

function anelDePts(pts: OsmPt[] | undefined): number[][] | null {
  if (!pts || pts.length < 2) return null
  return pts.map((p) => [p.lon, p.lat])
}

function ptsIguais(a: number[], b: number[], tol = 1e-8): boolean {
  return Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol
}

function juntarCaminhos(paths: number[][][]): number[][][] {
  const rest = paths.filter((p) => p.length >= 2).map((p) => [...p])
  const rings: number[][][] = []
  while (rest.length) {
    let ring = rest.shift()!
    let grew = true
    while (grew) {
      grew = false
      for (let i = 0; i < rest.length; i++) {
        const w = rest[i]
        const r0 = ring[0]
        const r1 = ring[ring.length - 1]
        const w0 = w[0]
        const w1 = w[w.length - 1]
        if (ptsIguais(r1, w0)) {
          ring = ring.concat(w.slice(1))
          rest.splice(i, 1)
          grew = true
          break
        }
        if (ptsIguais(r1, w1)) {
          ring = ring.concat(w.slice(0, -1).reverse())
          rest.splice(i, 1)
          grew = true
          break
        }
        if (ptsIguais(r0, w1)) {
          ring = w.slice(0, -1).concat(ring)
          rest.splice(i, 1)
          grew = true
          break
        }
        if (ptsIguais(r0, w0)) {
          ring = w.slice(1).reverse().concat(ring)
          rest.splice(i, 1)
          grew = true
          break
        }
      }
    }
    const closed = fecharAnel(ring)
    if (closed.length >= 4) rings.push(closed)
  }
  return rings
}

function osmParaMalha(elements: OsmEl[], municipioId: string, uf?: UfBr): GeoFc {
  const seen = new Set<string>()
  const features: GeoFc['features'] = []
  for (const el of elements) {
    const nome = (el.tags?.name || el.tags?.['name:pt'] || '').trim()
    if (!nome) continue
    const key = nome.toLowerCase()
    if (seen.has(key)) continue
    let rings: number[][][] = []
    if (el.type === 'way') {
      const ring = anelDePts(el.geometry)
      if (ring) rings = juntarCaminhos([ring])
    } else if (el.type === 'relation') {
      const outers = (el.members ?? [])
        .filter((m) => m.role === 'outer' || !m.role)
        .map((m) => anelDePts(m.geometry))
        .filter((r): r is number[][] => Boolean(r))
      rings = juntarCaminhos(outers)
    }
    if (!rings.length) continue
    seen.add(key)
    const geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon =
      rings.length === 1
        ? { type: 'Polygon', coordinates: rings }
        : { type: 'MultiPolygon', coordinates: rings.map((r) => [r]) }
    features.push({
      type: 'Feature',
      geometry,
      properties: {
        id: `b-${municipioId}-${el.type}-${el.id}`,
        nome,
        uf,
        municipioId,
        tipo: 'bairro',
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

async function overpassJson(query: string): Promise<OsmEl[]> {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ]
  let lastErr: Error | null = null
  for (const url of endpoints) {
    try {
      let res = await fetch(`${url}?data=${encodeURIComponent(query)}`)
      if (!res.ok) {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: `data=${encodeURIComponent(query)}`,
        })
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { elements?: OsmEl[] }
      return json.elements ?? []
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error('Overpass falhou')
    }
  }
  if (lastErr) throw lastErr
  return []
}

async function malhaBairrosOsm(opts: {
  municipioId: string
  uf?: UfBr
}): Promise<GeoFc | null> {
  const query = `[out:json][timeout:45];area["IBGE:GEOCODIGO"="${opts.municipioId}"]->.a;rel(area.a)["boundary"="administrative"]["admin_level"="10"];out geom;`
  try {
    const elements = await overpassJson(query)
    const fc = osmParaMalha(elements, opts.municipioId, opts.uf)
    return fc.features.length >= 2 ? fc : null
  } catch {
    return null
  }
}

/**
 * Bairros oficiais do município (IBGE Censo 2022). Quando o IBGE só tem distrito
 * (comum fora das capitais) e ele vem raso — sede + 1 ou 2 distritos rurais, o que
 * na prática desenha o contorno quase inteiro da cidade em vez de bairros —
 * tenta o OSM (admin_level=10), que costuma ter os bairros reais mapeados.
 * Usa sempre a malha mais granular disponível entre distrito e OSM.
 */
export async function carregarMalhaBairros(opts: {
  municipioId: string
  uf?: UfBr
}): Promise<GeoFc> {
  const hit = cacheBairros.get(opts.municipioId)
  if (hit) return hit
  const uf = ufDoMunicipio(opts.municipioId, opts.uf)
  const [ibgeBairros, ibgeDistritos] = await Promise.all([
    tentarMalhaIbge('bairros', opts.municipioId, uf),
    tentarMalhaIbge('distritos', opts.municipioId, uf),
  ])
  const zonasSp =
    opts.municipioId === MUN_SAO_PAULO_ID && ibgeDistritos
      ? agruparDistritosEmZonasSp(ibgeDistritos)
      : null

  let escolhida: GeoFc | null = zonasSp ?? ibgeBairros ?? null
  if (!escolhida) {
    const distritoRaso = !ibgeDistritos || ibgeDistritos.features.length <= 3
    const osm = distritoRaso
      ? await malhaBairrosOsm({ municipioId: opts.municipioId, uf })
      : null
    escolhida =
      osm && (!ibgeDistritos || osm.features.length > ibgeDistritos.features.length)
        ? osm
        : ibgeDistritos ?? osm
  }
  if (!escolhida || escolhida.features.length === 0) {
    throw new Error('Sem malha de bairros nesta cidade')
  }
  cacheBairros.set(opts.municipioId, escolhida)
  return escolhida
}

type KelvinMun = {
  codigo_ibge: number
  nome: string
  latitude: number
  longitude: number
  codigo_uf: number
}

/** Catálogo com sede (lat/lng) para busca e pins. */
export async function carregarCatalogoMunicipios(): Promise<MunicipioCat[]> {
  if (catalogo) return catalogo
  if (catalogoPendente) return catalogoPendente
  catalogoPendente = (async () => {
    try {
      const raw = (await fetchJson(
        'https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/json/municipios.json',
      )) as KelvinMun[]
      const list: MunicipioCat[] = []
      for (const m of raw) {
        const uf = IBGE_PARA_UF[String(m.codigo_uf)]
        if (!uf || !Number.isFinite(m.latitude) || !Number.isFinite(m.longitude)) continue
        list.push({
          id: String(m.codigo_ibge),
          nome: m.nome,
          uf,
          lat: m.latitude,
          lng: m.longitude,
        })
      }
      catalogo = list
      return list
    } catch {
      const porUf = await Promise.all(
        (Object.keys(UF_IBGE) as UfBr[]).map(async (uf) => {
          try {
            const raw = (await fetchJson(
              `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${UF_IBGE[uf]}/municipios`,
            )) as IbgeMun[]
            const centro = UF_CENTRO[uf]
            return raw.map((m) => ({
              id: String(m.id),
              nome: m.nome,
              uf,
              lat: centro.lat,
              lng: centro.lng,
            }))
          } catch {
            return [] as MunicipioCat[]
          }
        }),
      )
      catalogo = porUf.flat()
      return catalogo
    }
  })()
  try {
    return await catalogoPendente
  } finally {
    catalogoPendente = null
  }
}

export function buscarMunicipiosCatalogo(
  lista: MunicipioCat[],
  query: string,
  limit = 12,
): MunicipioCat[] {
  const q = normalizarTexto(query)
  if (q.length < 2) return []
  const starts: MunicipioCat[] = []
  const rest: MunicipioCat[] = []
  for (const m of lista) {
    const n = normalizarTexto(m.nome)
    if (n.startsWith(q)) starts.push(m)
    else if (n.includes(q)) rest.push(m)
    if (starts.length >= limit) break
  }
  return [...starts, ...rest].slice(0, limit)
}

export function acharMunicipio(
  lista: MunicipioCat[],
  nome: string,
  uf?: string | null,
): MunicipioCat | null {
  const n = normalizarTexto(nome)
  if (!n) return null
  const ufOk = (uf || '').trim().toUpperCase()
  const sameUf = ufOk ? lista.filter((m) => m.uf === ufOk) : lista
  return (
    sameUf.find((m) => normalizarTexto(m.nome) === n) ??
    sameUf.find((m) => normalizarTexto(m.nome).includes(n) || n.includes(normalizarTexto(m.nome))) ??
    null
  )
}

/** @deprecated use coordsSedeMunicipio em municipiosSedes.ts (síncrono, sem rede). */
export { coordsSedeMunicipio } from './municipiosSedes'
