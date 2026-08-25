import { UF_CENTRO, type UfBr } from './mapaLogisticaIntel'
import { normalizarTexto } from './cidadesBrasil'

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
  uf: UfBr
}

export type GeoFc = GeoJSON.FeatureCollection<GeoJSON.Geometry, GeoProps>

const cacheUfs = new Map<string, GeoFc>()
const cacheMun = new Map<string, GeoFc>()
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
