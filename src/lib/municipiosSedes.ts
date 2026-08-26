import sedesJson from './municipiosSedes.data.json' with { type: 'json' }
import { buscarCidades } from './cidadesBrasil'

const SEDES = sedesJson as Record<string, [number, number]>

const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
])

const ESTADO_PARA_UF: Record<string, string> = {
  acre: 'AC',
  alagoas: 'AL',
  amapa: 'AP',
  amazonas: 'AM',
  bahia: 'BA',
  ceara: 'CE',
  'distrito federal': 'DF',
  'espirito santo': 'ES',
  goias: 'GO',
  maranhao: 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  para: 'PA',
  paraiba: 'PB',
  parana: 'PR',
  pernambuco: 'PE',
  piaui: 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  rondonia: 'RO',
  roraima: 'RR',
  'santa catarina': 'SC',
  'sao paulo': 'SP',
  sergipe: 'SE',
  tocantins: 'TO',
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function stripSufixoPais(consulta: string): string {
  return consulta
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[,;]\s*(Brasil|Brazil)\s*$/i, '')
    .replace(/\s+[-–]\s*(Brasil|Brazil)\s*$/i, '')
    .trim()
}

function parseUfToken(token: string): string | null {
  const t = token.trim()
  if (!t) return null
  if (/^[A-Za-z]{2}$/.test(t) && UFS.has(t.toUpperCase())) return t.toUpperCase()
  const n = normalizar(
    t.replace(/^Estado d[eoas]\s+/i, '').replace(/^State of\s+/i, ''),
  )
  if (n.startsWith('regiao ')) return null
  return ESTADO_PARA_UF[n] || null
}

export type SedeMunicipio = {
  lat: number
  lng: number
  nome: string
  uf: string
}

/** Sede IBGE (lat/lng). Match exato nome+UF; sem UF só se o nome for único no Brasil. */
export function coordsSedeMunicipio(
  nome: string,
  uf?: string | null,
): SedeMunicipio | null {
  const n = normalizar(nome)
  if (!n) return null
  const ufOk = (uf || '').trim().toUpperCase()
  if (ufOk) {
    const hit = SEDES[`${n}|${ufOk}`]
    if (!hit) return null
    return { lat: hit[0], lng: hit[1], nome: nome.trim(), uf: ufOk }
  }
  const exact: SedeMunicipio[] = []
  for (const [key, hit] of Object.entries(SEDES)) {
    const pipe = key.lastIndexOf('|')
    if (pipe < 0) continue
    if (key.slice(0, pipe) !== n) continue
    exact.push({ lat: hit[0], lng: hit[1], nome: nome.trim(), uf: key.slice(pipe + 1) })
    if (exact.length > 1) return null
  }
  return exact[0] ?? null
}

/**
 * "Arujá - SP" | "São José dos Campos, SP" | "São José dos Campos, São Paulo, Brasil"
 */
export function parseCidadeUf(consulta: string): { cidade: string; uf: string } | null {
  const raw = stripSufixoPais(consulta)
  if (!raw) return null

  let m = raw.match(/^(.+?)\s*[-–,]\s*([A-Za-zÁÉÍÓÚÂÊÔÃÕÇ]{2})\s*$/u)
  if (m && UFS.has(m[2].toUpperCase())) {
    return { cidade: m[1].trim(), uf: m[2].toUpperCase() }
  }

  m = raw.match(/^(.+)-([A-Za-z]{2})$/)
  if (m && UFS.has(m[2].toUpperCase())) {
    return { cidade: m[1].trim(), uf: m[2].toUpperCase() }
  }

  m = raw.match(/^(.+?)\s+([A-Za-z]{2})$/)
  if (m && UFS.has(m[2].toUpperCase()) && m[1].trim().length >= 3) {
    return { cidade: m[1].trim(), uf: m[2].toUpperCase() }
  }

  const partes = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => {
      if (!p) return false
      const n = normalizar(p)
      return n !== 'brasil' && n !== 'brazil' && !n.startsWith('regiao ')
    })
  if (partes.length >= 2) {
    for (let i = partes.length - 1; i >= 1; i--) {
      const uf = parseUfToken(partes[i])
      if (!uf) continue
      const cidade = partes[0].trim()
      if (cidade.length < 2) continue
      if (/\b(rua|r\.|avenida|av\.?|alameda|rodovia|estrada)\b/i.test(cidade)) continue
      return { cidade, uf }
    }
  }

  const estadoFim = raw.match(/^(.+?)\s*[-–,]\s*([A-Za-zÀ-ú ]{3,})$/u)
  if (estadoFim) {
    const uf = parseUfToken(estadoFim[2])
    const cidade = estadoFim[1].trim()
    if (uf && cidade.length >= 2) return { cidade, uf }
  }

  return null
}

export function coordsSedePorLabel(label: string): SedeMunicipio | null {
  const mun = parseCidadeUf(label)
  if (mun) return coordsSedeMunicipio(mun.cidade, mun.uf)
  if (/\b(rua|r\.|avenida|av\.?|alameda|rodovia|estrada|travessa)\b/i.test(label)) return null
  return coordsSedeMunicipio(stripSufixoPais(label), null)
}

export function sugerirCidadesComCoords(
  query: string,
  limit = 8,
): Array<{
  label: string
  primary: string
  secondary: string
  display: string
  lat: number
  lng: number
}> {
  const labels = buscarCidades(query, limit)
  const out: Array<{
    label: string
    primary: string
    secondary: string
    display: string
    lat: number
    lng: number
  }> = []
  const seen = new Set<string>()
  for (const label of labels) {
    const sede = coordsSedePorLabel(label)
    if (!sede) continue
    const key = `${normalizar(sede.nome)}|${sede.uf}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      label,
      primary: label,
      secondary: 'Município',
      display: label,
      lat: sede.lat,
      lng: sede.lng,
    })
    if (out.length >= limit) break
  }
  return out
}
