/**
 * CEP (ViaCEP) + geocodificação (Nominatim / OpenStreetMap).
 * Usado na origem residencial do transportador (não no endereço do CNPJ).
 */

export type EnderecoCampos = {
  cep: string
  cidade: string
  uf: string
  endereco: string
  numero: string
  bairro: string
  complemento?: string
}

export type Coordenadas = { lat: number; lng: number }

function onlyCepDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 8)
}

export function formatCepBr(raw: string): string {
  const d = onlyCepDigits(raw)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

/** Preenche logradouro/cidade/UF a partir do CEP (ViaCEP). */
export async function buscarEnderecoPorCep(
  cepRaw: string,
): Promise<{ ok: true; dados: Partial<EnderecoCampos> } | { ok: false; erro: string }> {
  const cep = onlyCepDigits(cepRaw)
  if (cep.length !== 8) return { ok: false, erro: 'CEP incompleto.' }
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
    if (!res.ok) return { ok: false, erro: 'Falha ao consultar CEP.' }
    const data = (await res.json()) as {
      erro?: boolean
      logradouro?: string
      bairro?: string
      localidade?: string
      uf?: string
      complemento?: string
    }
    if (data.erro) return { ok: false, erro: 'CEP não encontrado.' }
    return {
      ok: true,
      dados: {
        cep: formatCepBr(cep),
        endereco: (data.logradouro || '').trim(),
        bairro: (data.bairro || '').trim(),
        cidade: (data.localidade || '').trim(),
        uf: (data.uf || '').trim().toUpperCase(),
        complemento: (data.complemento || '').trim() || undefined,
      },
    }
  } catch {
    return { ok: false, erro: 'Não foi possível consultar o CEP.' }
  }
}

function montarQueryEndereco(e: EnderecoCampos): string {
  const partes = [
    e.endereco?.trim(),
    e.numero?.trim(),
    e.bairro?.trim(),
    e.cidade?.trim(),
    e.uf?.trim(),
    e.cep?.replace(/\D/g, '') || undefined,
    'Brasil',
  ].filter(Boolean)
  return partes.join(', ')
}

/** Retorna true se há o mínimo para geocodificar (CEP completo OU cidade+rua). */
export function enderecoProntoParaGeocode(e: EnderecoCampos): boolean {
  const cepOk = onlyCepDigits(e.cep).length === 8
  const ruaOk = Boolean(e.cidade.trim() && e.uf.trim() && e.endereco.trim())
  return cepOk || ruaOk
}

/**
 * Geocodifica endereço via Nominatim (OSM).
 * Prefere query com rua/número/cidade; fallback só CEP.
 */
export async function geocodificarEndereco(
  e: EnderecoCampos,
): Promise<{ ok: true; coords: Coordenadas; display?: string } | { ok: false; erro: string }> {
  if (!enderecoProntoParaGeocode(e)) {
    return {
      ok: false,
      erro: 'Informe o CEP ou cidade, rua e número para localizar as coordenadas.',
    }
  }

  const queries: string[] = []
  const full = montarQueryEndereco(e)
  if (full.replace(/Brasil|,/g, '').trim()) queries.push(full)

  const cep = onlyCepDigits(e.cep)
  if (cep.length === 8) queries.push(`${cep}, Brasil`)

  if (e.cidade.trim() && e.uf.trim()) {
    queries.push(`${e.cidade.trim()}, ${e.uf.trim()}, Brasil`)
  }

  let lastErro = 'Endereço não encontrado no mapa.'
  for (const q of queries) {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search')
      url.searchParams.set('format', 'json')
      url.searchParams.set('limit', '1')
      url.searchParams.set('countrycodes', 'br')
      url.searchParams.set('q', q)

      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        lastErro = 'Falha ao consultar coordenadas.'
        continue
      }
      const rows = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>
      const hit = rows[0]
      const lat = hit?.lat != null ? Number(hit.lat) : NaN
      const lng = hit?.lon != null ? Number(hit.lon) : NaN
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return {
          ok: true,
          coords: { lat, lng },
          display: hit.display_name,
        }
      }
    } catch {
      lastErro = 'Não foi possível obter as coordenadas.'
    }
  }

  return { ok: false, erro: lastErro }
}

export type SugestaoEndereco = {
  /** Texto completo para preencher o campo (estilo Google Maps). */
  label: string
  /** Linha principal (rua / lugar). */
  primary: string
  /** Linha secundária (bairro, cidade, estado). */
  secondary: string
  display: string
  lat: number
  lng: number
  housenumber?: string
}

type NominatimHit = {
  lat?: string
  lon?: string
  display_name?: string
  address?: {
    road?: string
    pedestrian?: string
    house_number?: string
    suburb?: string
    neighbourhood?: string
    city_district?: string
    city?: string
    town?: string
    village?: string
    municipality?: string
    state?: string
    postcode?: string
  }
}

type PhotonProps = {
  name?: string
  street?: string
  housenumber?: string
  district?: string
  suburb?: string
  neighbourhood?: string
  city?: string
  town?: string
  county?: string
  state?: string
  country?: string
  postcode?: string
  type?: string
  osm_value?: string
}

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] }
  properties?: PhotonProps
}

/** Extrai número no fim da digitação (ex.: "… ramalho 907"). */
export function extrairNumeroDigitado(consulta: string): string | undefined {
  const m = consulta.trim().match(/(?:^|\s)(\d{1,6}[A-Za-z/\-]?)(?:\s*)$/)
  return m?.[1]
}

function limparEstado(uf: string): string {
  return uf
    .replace(/^Estado d[eoas]\s+/i, '')
    .replace(/^State of\s+/i, '')
    .trim()
}

function montarLabelMaps(parts: {
  rua: string
  numero?: string
  bairro?: string
  cidade?: string
  estado?: string
}): { label: string; primary: string; secondary: string } {
  const rua = parts.rua.trim()
  const numero = (parts.numero || '').trim()
  const primary = numero && rua ? `${rua}, ${numero}` : rua || numero
  const secondary = [parts.bairro, parts.cidade, parts.estado]
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join(', ')
  const label = [primary, secondary].filter(Boolean).join(', ')
  return { label, primary, secondary }
}

/**
 * Se o usuário digitou número e a sugestão é só a rua, inclui o número no preenchimento
 * (comportamento típico do Google Maps).
 */
export function aplicarNumeroDigitado(
  sugestao: SugestaoEndereco,
  consulta: string,
): string {
  if (sugestao.housenumber) return sugestao.label
  const num = extrairNumeroDigitado(consulta)
  if (!num) return sugestao.label
  if (new RegExp(`\\b${num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(sugestao.label)) {
    return sugestao.label
  }
  const primary = sugestao.primary.includes(',')
    ? sugestao.primary
    : `${sugestao.primary}, ${num}`
  return [primary, sugestao.secondary].filter(Boolean).join(', ')
}

function formatarSugestaoNominatim(hit: NominatimHit): SugestaoEndereco | null {
  const a = hit.address
  const lat = hit?.lat != null ? Number(hit.lat) : NaN
  const lng = hit?.lon != null ? Number(hit.lon) : NaN
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  if (!a) {
    const display = (hit.display_name || '').trim()
    if (!display) return null
    return {
      label: display,
      primary: display.split(',')[0]?.trim() || display,
      secondary: display.split(',').slice(1).map((s) => s.trim()).join(', '),
      display,
      lat,
      lng,
    }
  }

  const rua = (a.road || a.pedestrian || '').trim()
  const numero = (a.house_number || '').trim()
  const bairro = (a.suburb || a.neighbourhood || a.city_district || '').trim()
  const cidade = (a.city || a.town || a.village || a.municipality || '').trim()
  const estado = limparEstado(a.state || '')
  const { label, primary, secondary } = montarLabelMaps({
    rua: rua || cidade,
    numero,
    bairro,
    cidade: rua ? cidade : undefined,
    estado,
  })
  if (!label) return null
  return {
    label,
    primary,
    secondary,
    display: (hit.display_name || label).trim(),
    lat,
    lng,
    housenumber: numero || undefined,
  }
}

function formatarSugestaoPhoton(f: PhotonFeature): SugestaoEndereco | null {
  const p = f.properties
  const coords = f.geometry?.coordinates
  if (!p || !coords) return null
  const [lng, lat] = coords
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  // Só Brasil (Photon não tem countrycodes como o Nominatim)
  const country = (p.country || '').toLowerCase()
  if (country && !country.includes('brasil') && !country.includes('brazil')) return null

  const rua = (p.name || p.street || '').trim()
  const numero = (p.housenumber || '').trim()
  const bairro = (p.district || p.suburb || p.neighbourhood || '').trim()
  const cidade = (p.city || p.town || p.county || '').trim()
  const estado = limparEstado(p.state || '')
  if (!rua && !cidade) return null

  const { label, primary, secondary } = montarLabelMaps({
    rua: rua || cidade,
    numero,
    bairro,
    cidade: rua ? cidade : undefined,
    estado,
  })
  if (!label) return null
  return {
    label,
    primary,
    secondary,
    display: label,
    lat,
    lng,
    housenumber: numero || undefined,
  }
}

/** Photon (Komoot): search-as-you-type, tolerante a typos — estilo Google Maps. */
async function sugerirEnderecosPhoton(
  consulta: string,
  limit: number,
): Promise<SugestaoEndereco[]> {
  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', consulta)
  url.searchParams.set('limit', String(Math.min(12, Math.max(1, limit))))
  // Bounding box aproximado do Brasil + viés na Grande SP
  url.searchParams.set('bbox', '-74,-34,-34,6')
  url.searchParams.set('lat', '-23.55')
  url.searchParams.set('lon', '-46.63')
  url.searchParams.set('location_bias_scale', '0.4')

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) return []
  const data = (await res.json()) as { features?: PhotonFeature[] }
  const out: SugestaoEndereco[] = []
  const seen = new Set<string>()
  for (const f of data.features || []) {
    const sug = formatarSugestaoPhoton(f)
    if (!sug) continue
    const key = sug.label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(sug)
    if (out.length >= limit) break
  }
  return out
}

async function sugerirEnderecosNominatim(
  consulta: string,
  limit: number,
): Promise<SugestaoEndereco[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'json')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', String(Math.min(12, Math.max(1, limit))))
  url.searchParams.set('countrycodes', 'br')
  url.searchParams.set('q', consulta.includes('Brasil') ? consulta : `${consulta}, Brasil`)

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) return []
  const rows = (await res.json()) as NominatimHit[]
  const out: SugestaoEndereco[] = []
  const seen = new Set<string>()
  for (const hit of rows) {
    const sug = formatarSugestaoNominatim(hit)
    if (!sug) continue
    const key = sug.label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(sug)
    if (out.length >= limit) break
  }
  return out
}

/**
 * Sugestões de endereço estilo Google Maps (Photon, fallback Nominatim).
 * Debounce no componente que chama.
 */
export async function sugerirEnderecos(
  consulta: string,
  limit = 8,
): Promise<SugestaoEndereco[]> {
  const q = consulta.trim()
  if (q.length < 2) return []

  try {
    const photon = await sugerirEnderecosPhoton(q, limit)
    if (photon.length > 0) return photon
  } catch {
    /* tenta Nominatim */
  }

  try {
    return await sugerirEnderecosNominatim(q, limit)
  } catch {
    return []
  }
}

/**
 * Geocodifica texto livre (rua, cidade, CEP, etc.) via Nominatim.
 */
export async function geocodificarConsulta(
  consulta: string,
): Promise<{ ok: true; coords: Coordenadas; display?: string } | { ok: false; erro: string }> {
  const q = consulta.trim()
  if (q.length < 3) return { ok: false, erro: 'Digite um endereço ou lugar.' }

  const hits = await sugerirEnderecos(q, 1)
  if (hits[0]) {
    return {
      ok: true,
      coords: { lat: hits[0].lat, lng: hits[0].lng },
      display: hits[0].display,
    }
  }
  return { ok: false, erro: 'Endereço não encontrado.' }
}
