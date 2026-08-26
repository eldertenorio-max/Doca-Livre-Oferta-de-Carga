/**
 * CEP (ViaCEP) + geocodificação (Nominatim / OpenStreetMap).
 * Usado na origem residencial do transportador (não no endereço do CNPJ).
 */

import { coordsSedeMunicipio } from './municipiosSedes'

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
  name?: string
  address?: {
    road?: string
    pedestrian?: string
    path?: string
    residential?: string
    house_number?: string
    suburb?: string
    neighbourhood?: string
    city_district?: string
    quarter?: string
    city?: string
    town?: string
    village?: string
    municipality?: string
    county?: string
    state_district?: string
    state?: string
    postcode?: string
    'ISO3166-2-lvl4'?: string
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

/** Escapa texto para uso em RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extrai número do imóvel digitado pelo usuário.
 * Aceita no fim (“… 907”), após vírgula (“Rua X, 907 Vila…”),
 * com prefixo (“nº 907”), rodovia (“Rodovia X, 975 - KM…”)
 * ou no meio da rua (“Av. X 907 Guarulhos”).
 */
export function extrairNumeroDigitado(consulta: string): string | undefined {
  const raw = consulta.trim().replace(/\s+/g, ' ')
  if (!raw) return undefined

  // 1) nº / n° / n. / numero 907
  const pref = raw.match(/\b(?:n[º°o.]?|n[uú]mero)\s*[:.]?\s*(\d{1,6}[A-Za-z]?)\b/i)
  if (pref?.[1]) return pref[1]

  // 2) Após a 1ª vírgula, antes de hífen/KM/complemento:
  //    "Rodovia Castelo Branco, 975 - KM 33 …"
  const aposVirgula = raw.match(
    /^[^,]+,\s*(\d{1,6}[A-Za-z/\-]?)\b(?=\s*(?:[-–,]|$|\s))/i,
  )
  if (aposVirgula?.[1]) return aposVirgula[1]

  // 3) No final: "… Ramalho 907" / "… Ramalho, 907"
  const noFim = raw.match(/(?:^|[\s,])(\d{1,6}[A-Za-z/\-]?)(?:\s*)$/)
  if (noFim?.[1]) return noFim[1]

  // 4) Depois do logradouro, antes de bairro/cidade (ignora KM / CEP)
  const semKmCep = raw
    .replace(/\bKM\s*\d+([.,]\d+)?\b/gi, ' ')
    .replace(/\bCEP\s*[:.]?\s*[\d.\-]+/gi, ' ')
  const aposLogradouro = semKmCep.match(
    /\b(?:rua|r\.|avenida|av\.?|alameda|al\.|travessa|tv\.?|rodovia|rod\.|estrada|est\.|praça|praca|largo|viela|via)\b[\s\wÀ-ú.'’-]{0,80}?\s+(\d{1,5}[A-Za-z]?)\b/i,
  )
  if (aposLogradouro?.[1]) return aposLogradouro[1]

  // 5) Qualquer número curto (1–5 dígitos) na 1ª metade — evita CEP (8 dígitos) e KM
  const metade = Math.ceil(raw.length * 0.55)
  const trecho = raw
    .slice(0, metade)
    .replace(/\bKM\s*\d+([.,]\d+)?\b/gi, ' ')
  const candidatos = [...trecho.matchAll(/\b(\d{1,5}[A-Za-z]?)\b/g)].map((m) => m[1])
  const valido = candidatos.find((n) => {
    const dig = n.replace(/\D/g, '')
    if (dig.length < 1 || dig.length > 5) return false
    if (dig.length === 4 && Number(dig) >= 1900 && Number(dig) <= 2100) return false
    return true
  })
  return valido
}

/** CEP embutido no texto (ex.: "CEP 06.696-000" ou "06696-000"). */
export function extrairCepDigitado(consulta: string): string | undefined {
  const raw = consulta.trim()
  const comLabel = raw.match(/\bCEP\s*[:.]?\s*([\d.\-\s]{8,12})/i)
  if (comLabel?.[1]) {
    const d = onlyCepDigits(comLabel[1])
    if (d.length === 8) return d
  }
  const noFim = raw.match(/(\d{2}\.?\d{3}-?\d{3})\s*$/)
  if (noFim?.[1]) {
    const d = onlyCepDigits(noFim[1])
    if (d.length === 8) return d
  }
  return undefined
}

export type EnderecoBrParseado = {
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  cep: string
  /** Query enxuta para Photon/Nominatim. */
  queryGeocode: string
  /** True se parece endereço BR “rico” (CEP, KM, Quadra, vários hífens). */
  rico: boolean
}

function pareceComplementoBr(parte: string): boolean {
  return /\b(km|quadra|lote|qd\.?|lt\.?|quinh[aã]o|bloco|sala|apto|apartamento|conjunto|condom[ií]nio|galp[aã]o|box)\b/i.test(
    parte,
  )
}

/** Remove ", Brasil" / "- Brazil" do fim — senão "Arujá - SP, Brasil" não parseia como município. */
function stripSufixoPaisBr(consulta: string): string {
  return consulta
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[,;]\s*(Brasil|Brazil)\s*$/i, '')
    .replace(/\s+[-–]\s*(Brasil|Brazil)\s*$/i, '')
    .trim()
}

/**
 * Interpreta endereços BR no estilo Google / nota fiscal:
 * "Rodovia X, 975 - KM 33 Quadra GI Lote … - Bairro - Cidade - SP - CEP 06.696-000"
 */
export function parseEnderecoBrLivre(consulta: string): EnderecoBrParseado {
  const original = stripSufixoPaisBr(consulta)
  let resto = original
  const cep = extrairCepDigitado(resto) || ''
  if (cep) {
    resto = resto
      .replace(/\bCEP\s*[:.]?\s*[\d.\-\s]{8,12}/gi, ' ')
      .replace(
        new RegExp(
          `${cep.slice(0, 2)}\\.?${cep.slice(2, 5)}-?${cep.slice(5)}`,
          'g',
        ),
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim()
  }
  // Remove hífens/separadores soltos no fim ("… SP -")
  resto = resto.replace(/[\s,;./\\–-]+$/g, '').trim()

  let uf = ''
  const ufMatch =
    resto.match(/\s[-–]\s*([A-Za-z]{2})\s*$/i) ||
    resto.match(/\b([A-Za-z]{2})\s*$/)
  if (ufMatch && UFS_BR.has(ufMatch[1].toUpperCase())) {
    uf = ufMatch[1].toUpperCase()
    resto = resto.slice(0, ufMatch.index).replace(/[\s,;–-]+$/g, '').trim()
  }

  // Partes separadas por " - " (padrão comercial BR)
  const partes = resto
    .split(/\s+[-–]\s+/)
    .map((p) => p.trim())
    .filter(Boolean)

  // Se a última parte for UF (ex.: sobrou "SP"), promove
  if (!uf && partes.length > 0) {
    const ultima = partes[partes.length - 1]
    if (/^[A-Za-z]{2}$/.test(ultima) && UFS_BR.has(ultima.toUpperCase())) {
      uf = ultima.toUpperCase()
      partes.pop()
    }
  }

  let logradouro = ''
  let numero = ''
  let complemento = ''
  let bairro = ''
  let cidade = ''

  if (partes.length >= 2) {
    const cabeca = partes[0]
    const mNum = cabeca.match(/^(.+?),\s*(\d{1,6}[A-Za-z/\-]?)\s*$/)
    if (mNum) {
      logradouro = mNum[1].trim()
      numero = mNum[2].trim()
    } else {
      logradouro = cabeca
      numero = extrairNumeroDigitado(cabeca) || ''
      if (numero) {
        logradouro = cabeca
          .replace(new RegExp(`,?\\s*${escapeRegExp(numero)}\\b`), '')
          .trim()
      }
    }

    const meio = partes.slice(1)
    // Última parte (sem UF/CEP) costuma ser cidade
    if (meio.length >= 1) {
      cidade = meio[meio.length - 1]
      const antes = meio.slice(0, -1)
      const comps = antes.filter(pareceComplementoBr)
      const bairros = antes.filter((p) => !pareceComplementoBr(p))
      complemento = comps.join(' - ')
      bairro = bairros.join(' - ')
    }
  } else {
    const mNum = resto.match(/^(.+?),\s*(\d{1,6}[A-Za-z/\-]?)\b(.*)$/)
    if (mNum) {
      logradouro = mNum[1].trim()
      numero = mNum[2].trim()
      const cauda = mNum[3].replace(/^[\s,;-–]+/, '').trim()
      if (cauda) {
        if (pareceComplementoBr(cauda)) complemento = cauda
        else bairro = cauda
      }
    } else {
      logradouro = resto
      numero = extrairNumeroDigitado(resto) || ''
    }
  }

  if (!numero) numero = extrairNumeroDigitado(original) || ''

  // Se parseCidadeUf clássico achar algo melhor para município puro
  if (!cidade || !uf) {
    const mun = parseCidadeUf(original.replace(/\bCEP\s*[:.]?\s*[\d.\-\s]+/i, '').trim())
    if (mun) {
      if (!uf) uf = mun.uf
      // só usa cidade do parse se ainda vazia e o "cidade" não parecer logradouro inteiro
      if (!cidade && mun.cidade.length < 60 && !pareceLogradouroTxt(mun.cidade)) {
        cidade = mun.cidade
      }
    }
  }

  const queryGeocode = [
    logradouro,
    numero,
    bairro,
    cidade,
    uf,
    cep ? formatCepBr(cep) : '',
    'Brasil',
  ]
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join(', ')

  const rico =
    Boolean(cep) ||
    /\bKM\s*\d/i.test(original) ||
    /\b(quadra|lote|quinh[aã]o)\b/i.test(original) ||
    (original.match(/\s[-–]\s/g) || []).length >= 2

  return {
    logradouro,
    numero,
    complemento,
    bairro,
    cidade,
    uf,
    cep,
    queryGeocode,
    rico,
  }
}

function pareceLogradouroTxt(s: string): boolean {
  return /\b(rua|r\.|avenida|av\.?|alameda|al\.|travessa|tv\.?|rodovia|rod\.|estrada|est\.|praça|praca|largo|viela|via)\b/i.test(
    s,
  )
}

function limparEstado(uf: string): string {
  return uf
    .replace(/^Estado d[eoas]\s+/i, '')
    .replace(/^State of\s+/i, '')
    .trim()
}

const UF_POR_ESTADO: Record<string, string> = {
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

function normalizarSemAcento(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Converte "São Paulo" / "SP" → sigla UF. */
export function ufDoEstado(estado: string | undefined | null): string {
  const raw = (estado || '').trim()
  if (!raw) return ''
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase()
  return UF_POR_ESTADO[normalizarSemAcento(limparEstado(raw))] || ''
}

function dadosDeNominatimReverse(
  data: NominatimHit,
): { dados: EnderecoCampos; display?: string } | null {
  const a = data.address
  if (!a && !(data.display_name || '').trim()) return null

  const cidade = (
    a?.city ||
    a?.town ||
    a?.village ||
    a?.municipality ||
    a?.county ||
    ''
  ).trim()

  let uf = ufDoEstado(a?.state)
  const iso = (a?.['ISO3166-2-lvl4'] || '').trim().toUpperCase()
  if (!uf && /^BR-[A-Z]{2}$/.test(iso)) uf = iso.slice(3)

  const cep = a?.postcode ? formatCepBr(a.postcode) : ''
  let endereco = (
    a?.road ||
    a?.pedestrian ||
    a?.path ||
    a?.residential ||
    ''
  ).trim()
  const numero = (a?.house_number || '').trim()
  const bairro = (
    a?.suburb ||
    a?.neighbourhood ||
    a?.city_district ||
    a?.quarter ||
    ''
  ).trim()

  // Área rural / sem rua: usa o nome do lugar para não deixar o campo vazio
  if (!endereco) {
    const nome = (data.name || '').trim()
    if (nome && nome.toLowerCase() !== cidade.toLowerCase()) endereco = nome
    else if (cidade) endereco = `Zona rural — ${cidade}`
  }

  if (!cidade && !endereco && !cep) {
    // Fallback: tenta extrair cidade/UF do display_name ("Salto do Céu, Mato Grosso, …")
    const parts = (data.display_name || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length >= 2) {
      const cidadeDisp = parts[0]
      const ufDisp = ufDoEstado(parts[1])
      if (!cidadeDisp) return null
      return {
        dados: {
          cep: '',
          cidade: cidadeDisp,
          uf: ufDisp || 'SP',
          endereco: `Zona rural — ${cidadeDisp}`,
          numero: '',
          bairro: '',
        },
        display: data.display_name,
      }
    }
    return null
  }

  return {
    dados: {
      cep,
      cidade,
      uf: uf || 'SP',
      endereco,
      numero,
      bairro,
    },
    display: (data.display_name || '').trim() || undefined,
  }
}

async function reverseNominatim(
  lat: number,
  lng: number,
  zoom: number,
): Promise<NominatimHit | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('zoom', String(zoom))
  url.searchParams.set('accept-language', 'pt-BR')

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  })
  if (!res.ok) return null
  const data = (await res.json()) as NominatimHit & { error?: string }
  if (data.error) return null
  return data
}

async function reversePhoton(
  lat: number,
  lng: number,
): Promise<Partial<EnderecoCampos> | null> {
  try {
    const url = new URL('https://photon.komoot.io/reverse')
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lng))
    url.searchParams.set('lang', 'en')
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const body = (await res.json()) as { features?: PhotonFeature[] }
    const f = body.features?.[0]
    if (!f?.properties) return null
    const p = f.properties
    const cidade = (p.city || p.town || p.county || '').trim()
    const uf = ufDoEstado(p.state)
    const endereco = (p.street || p.name || '').trim()
    const numero = (p.housenumber || '').trim()
    const bairro = (p.district || p.suburb || p.neighbourhood || '').trim()
    const cep = p.postcode ? formatCepBr(p.postcode) : ''
    if (!cidade && !endereco && !cep) return null
    return {
      cep,
      cidade,
      uf: uf || undefined,
      endereco: endereco || (cidade ? `Zona rural — ${cidade}` : ''),
      numero,
      bairro,
    }
  } catch {
    return null
  }
}

/**
 * Reverse geocode: lat/lng → campos de endereço (Nominatim + Photon).
 * Usado quando o transportador aponta o pin ou edita as coordenadas.
 */
export async function enderecoPorCoordenadas(
  lat: number,
  lng: number,
): Promise<
  | { ok: true; dados: EnderecoCampos; display?: string }
  | { ok: false; erro: string }
> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, erro: 'Coordenadas inválidas.' }
  }
  if (lat < -35 || lat > 6 || lng < -75 || lng > -30) {
    return { ok: false, erro: 'Coordenadas fora do Brasil.' }
  }

  try {
    // zoom 18 = rua; zoom 14 = município (melhor em área rural)
    for (const zoom of [18, 16, 14, 12]) {
      const data = await reverseNominatim(lat, lng, zoom)
      if (!data) continue
      const parsed = dadosDeNominatimReverse(data)
      if (parsed) {
        return { ok: true, dados: parsed.dados, display: parsed.display }
      }
    }

    const photon = await reversePhoton(lat, lng)
    if (photon && (photon.cidade || photon.endereco || photon.cep)) {
      return {
        ok: true,
        dados: {
          cep: photon.cep ?? '',
          cidade: photon.cidade ?? '',
          uf: photon.uf || 'SP',
          endereco: photon.endereco ?? '',
          numero: photon.numero ?? '',
          bairro: photon.bairro ?? '',
        },
      }
    }

    return { ok: false, erro: 'Não foi possível obter o endereço deste ponto.' }
  } catch {
    return { ok: false, erro: 'Não foi possível obter o endereço deste ponto.' }
  }
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
 * Endereços BR “ricos” (CEP, KM, Quadra/Lote, vários hífens) são preservados.
 */
export function aplicarNumeroDigitado(
  sugestao: SugestaoEndereco,
  consulta: string,
): string {
  const parsed = parseEnderecoBrLivre(consulta)
  if (parsed.rico && consulta.trim().length >= 20) {
    return consulta.trim()
  }

  const num = (sugestao.housenumber || '').trim() || parsed.numero || extrairNumeroDigitado(consulta)
  if (!num) return sugestao.label

  const temNumero = new RegExp(`\\b${escapeRegExp(num)}\\b`, 'i').test(sugestao.label)
  if (temNumero) return sugestao.label

  const rua = sugestao.primary
    .replace(/,\s*\d{1,6}[A-Za-z/\-]?.*$/i, '')
    .trim()
  const primary = rua ? `${rua}, ${num}` : num
  return [primary, sugestao.secondary].filter(Boolean).join(', ')
}

/** Decora sugestões com o número digitado (aparece na lista e no preenchimento). */
export function decorarSugestoesComNumero(
  hits: SugestaoEndereco[],
  consulta: string,
): SugestaoEndereco[] {
  const num = extrairNumeroDigitado(consulta)
  if (!num || hits.length === 0) return hits
  return hits.map((h) => {
    const label = aplicarNumeroDigitado(h, consulta)
    if (label === h.label) return h
    const rua = h.primary.replace(/,\s*\d{1,6}[A-Za-z/\-]?.*$/i, '').trim()
    return {
      ...h,
      primary: rua ? `${rua}, ${num}` : h.primary,
      label,
      housenumber: h.housenumber || num,
    }
  })
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

  const numero = (p.housenumber || '').trim()
  let rua = (p.street || '').trim()
  if (!rua) {
    const nome = (p.name || '').trim()
    // Em hits de porta, `name` às vezes é só o número — não usar como logradouro
    if (nome && (!numero || nome.toLowerCase() !== numero.toLowerCase()) && !/^\d{1,6}[A-Za-z]?$/.test(nome)) {
      rua = nome
    } else if (nome && !numero) {
      rua = nome
    }
  }
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
  // Bounding box aproximado do Brasil
  url.searchParams.set('bbox', '-74,-34,-34,6')

  // Viés SP só para busca de rua (não para "Cidade - UF", que enviesava Ribeirão Preto → capital)
  const mun = parseCidadeUf(consulta)
  if (!mun) {
    url.searchParams.set('lat', '-23.55')
    url.searchParams.set('lon', '-46.63')
    url.searchParams.set('location_bias_scale', '0.25')
  }

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
 * Endereços BR longos (KM/Quadra/CEP) usam query enxuta para achar o local.
 */
export async function sugerirEnderecos(
  consulta: string,
  limit = 8,
): Promise<SugestaoEndereco[]> {
  const q = consulta.trim()
  if (q.length < 2) return []

  const parsed = parseEnderecoBrLivre(q)
  const queries = Array.from(
    new Set(
      [
        parsed.rico && parsed.queryGeocode ? parsed.queryGeocode : '',
        parsed.logradouro && parsed.cidade
          ? [parsed.logradouro, parsed.numero, parsed.cidade, parsed.uf, 'Brasil']
              .filter(Boolean)
              .join(', ')
          : '',
        q,
      ].filter((s) => s.trim().length >= 2),
    ),
  )

  let hits: SugestaoEndereco[] = []
  for (const query of queries) {
    try {
      hits = await sugerirEnderecosPhoton(query, limit)
    } catch {
      /* tenta Nominatim */
    }
    if (hits.length === 0) {
      try {
        hits = await sugerirEnderecosNominatim(query, limit)
      } catch {
        hits = []
      }
    }
    if (hits.length > 0) break
  }

  // CEP: enriquece ranking com cidade do ViaCEP se a busca vier vazia
  if (hits.length === 0 && parsed.cep) {
    const via = await buscarEnderecoPorCep(parsed.cep)
    if (via.ok) {
      const qCep = [
        parsed.logradouro || via.dados.endereco,
        parsed.numero,
        via.dados.bairro || parsed.bairro,
        via.dados.cidade || parsed.cidade,
        via.dados.uf || parsed.uf,
        'Brasil',
      ]
        .filter(Boolean)
        .join(', ')
      try {
        hits = await sugerirEnderecosPhoton(qCep, limit)
      } catch {
        /* ignore */
      }
      if (hits.length === 0) {
        try {
          hits = await sugerirEnderecosNominatim(qCep, limit)
        } catch {
          hits = []
        }
      }
    }
  }

  return decorarSugestoesComNumero(hits, q)
}

/**
 * Geocodifica texto livre (rua, cidade, CEP, etc.) via Nominatim.
 * Municípios no formato "Cidade - UF" usam busca estruturada (sem viés SP do Photon).
 * Aceita também o formato comercial BR com KM / Quadra / Lote / CEP.
 */
export async function geocodificarConsulta(
  consulta: string,
): Promise<{ ok: true; coords: Coordenadas; display?: string } | { ok: false; erro: string }> {
  const q = stripSufixoPaisBr(consulta)
  if (q.length < 3) return { ok: false, erro: 'Digite um endereço ou lugar.' }

  const parsed = parseEnderecoBrLivre(q)
  const displayFinal = parsed.rico ? q : undefined

  // 1) CEP completo → geocode estruturado (mais estável p/ galpões / rodovias)
  if (parsed.cep) {
    const via = await buscarEnderecoPorCep(parsed.cep)
    if (via.ok) {
      const campos: EnderecoCampos = {
        cep: formatCepBr(parsed.cep),
        cidade: via.dados.cidade || parsed.cidade || '',
        uf: via.dados.uf || parsed.uf || '',
        endereco: parsed.logradouro || via.dados.endereco || '',
        numero: parsed.numero || '',
        bairro: parsed.bairro || via.dados.bairro || '',
        complemento: parsed.complemento || via.dados.complemento,
      }
      const geo = await geocodificarEndereco(campos)
      if (geo.ok) {
        return {
          ok: true,
          coords: geo.coords,
          display: displayFinal || geo.display || q,
        }
      }
    }
  }

  const mun =
    parsed.cidade && parsed.uf
      ? { cidade: parsed.cidade, uf: parsed.uf }
      : parseCidadeUf(q.replace(/\bCEP\s*[:.]?\s*[\d.\-\s]+/i, '').trim())
  const temNumero = Boolean(parsed.numero || extrairNumeroDigitado(q))
  const temTipoLogradouro = pareceLogradouroTxt(q)

  // Município puro: sede IBGE. Não cai no Photon (evita "Rua São José dos Campos" em SP).
  if (mun && !temNumero && !temTipoLogradouro) {
    const geo = await geocodificarMunicipioBr(mun.cidade, mun.uf)
    if (geo) {
      return { ok: true, coords: { lat: geo.lat, lng: geo.lng }, display: geo.display }
    }
  }

  // Nome de cidade sem UF: só se for único no IBGE (Arujá, Guarulhos…)
  if (!mun && !temNumero && !temTipoLogradouro && !parsed.rico && !parsed.cep) {
    const sede = coordsSedeMunicipio(parsed.cidade || q, parsed.uf || null)
    if (sede) {
      return {
        ok: true,
        coords: { lat: sede.lat, lng: sede.lng },
        display: `${sede.nome} - ${sede.uf}`,
      }
    }
  }

  // Endereço completo: pega vários hits e ranqueia (evita 1º resultado enviesado do Photon)
  const hits = await sugerirEnderecos(q, 8)
  const melhor = escolherMelhorHit(hits, q, mun?.uf || parsed.uf || undefined)
  if (melhor) {
    return {
      ok: true,
      coords: { lat: melhor.lat, lng: melhor.lng },
      display: displayFinal || aplicarNumeroDigitado(melhor, q),
    }
  }

  // Fallback: só cidade/UF do parse rico
  if (parsed.cidade && parsed.uf) {
    const geo = await geocodificarMunicipioBr(parsed.cidade, parsed.uf)
    if (geo) {
      return {
        ok: true,
        coords: { lat: geo.lat, lng: geo.lng },
        display: displayFinal || geo.display,
      }
    }
  }

  return { ok: false, erro: 'Endereço não encontrado.' }
}

const UFS_BR = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
])

const UF_NOME: Record<string, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
}

function normalizarGeo(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extrai "Cidade - UF" / "Cidade-UF" / "Cidade, UF" de textos de rota. */
export function parseCidadeUf(consulta: string): { cidade: string; uf: string } | null {
  const raw = stripSufixoPaisBr(consulta)
  if (!raw) return null

  // "Ribeirão Preto - SP" | "Ribeirão Preto, SP" | "Ribeirão Preto – SP"
  let m = raw.match(/^(.+?)\s*[-–,]\s*([A-Za-zÁÉÍÓÚÂÊÔÃÕÇ]{2})\s*$/u)
  if (m && UFS_BR.has(m[2].toUpperCase())) {
    return { cidade: m[1].trim(), uf: m[2].toUpperCase() }
  }

  // "RIBEIRAO PRETO-SP" (sem espaço antes da UF)
  m = raw.match(/^(.+)-([A-Za-z]{2})$/)
  if (m && UFS_BR.has(m[2].toUpperCase())) {
    return { cidade: m[1].trim(), uf: m[2].toUpperCase() }
  }

  // "Ribeirão Preto SP" (espaço + UF no fim)
  m = raw.match(/^(.+?)\s+([A-Za-z]{2})$/)
  if (m && UFS_BR.has(m[2].toUpperCase()) && m[1].trim().length >= 3) {
    return { cidade: m[1].trim(), uf: m[2].toUpperCase() }
  }

  return null
}

async function nominatimEscolherMunicipio(
  url: URL,
  cidade: string,
  ufUp: string,
  estado: string,
): Promise<{ lat: number; lng: number; display: string } | null> {
  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
  })
  if (!res.ok) return null
  const rows = (await res.json()) as (NominatimHit & {
    type?: string
    class?: string
    importance?: number
  })[]

  const cidadeNorm = normalizarGeo(cidade)
  const estadoNorm = normalizarGeo(estado)
  let best: { lat: number; lng: number; display: string; score: number } | null = null

  for (const hit of rows) {
    const lat = hit.lat != null ? Number(hit.lat) : NaN
    const lng = hit.lon != null ? Number(hit.lon) : NaN
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

    const a = hit.address
    const nomeLocal = normalizarGeo(
      a?.city || a?.town || a?.village || a?.municipality || hit.display_name?.split(',')[0] || '',
    )
    const estadoHit = normalizarGeo(limparEstado(a?.state || ''))
    const display = (hit.display_name || '').trim()
    const displayNorm = normalizarGeo(display)

    let score = Number(hit.importance ?? 0) * 10
    if (nomeLocal === cidadeNorm || displayNorm.startsWith(cidadeNorm)) score += 50
    else if (nomeLocal.includes(cidadeNorm) || displayNorm.includes(cidadeNorm)) score += 25
    else continue

    if (
      estadoHit.includes(estadoNorm) ||
      estadoHit === normalizarGeo(ufUp) ||
      displayNorm.includes(` ${normalizarGeo(ufUp)}`) ||
      displayNorm.includes(estadoNorm)
    ) {
      score += 40
    } else {
      score -= 30
    }

    const tipo = `${hit.class || ''}/${hit.type || ''}`.toLowerCase()
    if (
      tipo.includes('city') ||
      tipo.includes('town') ||
      tipo.includes('municipality') ||
      tipo.includes('administrative')
    ) {
      score += 20
    }
    if (tipo.includes('highway') || tipo.includes('residential') || tipo.includes('shop')) {
      score -= 40
    }

    if (!best || score > best.score) {
      best = { lat, lng, display: display || `${cidade} - ${ufUp}`, score }
    }
  }

  return best && best.score >= 40 ? best : null
}

async function geocodificarMunicipioBr(
  cidade: string,
  uf: string,
): Promise<{ lat: number; lng: number; display: string } | null> {
  const ufUp = uf.toUpperCase()
  const estado = UF_NOME[ufUp] || ufUp

  const sede = coordsSedeMunicipio(cidade, ufUp)
  if (sede) {
    return {
      lat: sede.lat,
      lng: sede.lng,
      display: `${sede.nome} - ${sede.uf}`,
    }
  }

  const queries = [
    `${cidade}, ${ufUp}, Brasil`,
    `${cidade}, ${estado}, Brasil`,
    `${cidade}, ${estado}, Brazil`,
  ]

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'json')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('limit', '8')
    url.searchParams.set('countrycodes', 'br')
    url.searchParams.set('city', cidade)
    url.searchParams.set('state', estado)
    url.searchParams.set('country', 'Brasil')
    url.searchParams.set('featureType', 'city')
    const structured = await nominatimEscolherMunicipio(url, cidade, ufUp, estado)
    if (structured) return structured
  } catch {
    /* tenta query livre */
  }

  for (const q of queries) {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search')
      url.searchParams.set('format', 'json')
      url.searchParams.set('addressdetails', '1')
      url.searchParams.set('limit', '8')
      url.searchParams.set('countrycodes', 'br')
      url.searchParams.set('q', q)
      const best = await nominatimEscolherMunicipio(url, cidade, ufUp, estado)
      if (best) return best
    } catch {
      /* tenta próxima query */
    }
  }
  return null
}

function escolherMelhorHit(
  hits: SugestaoEndereco[],
  consulta: string,
  ufHint?: string,
): SugestaoEndereco | null {
  if (hits.length === 0) return null
  if (hits.length === 1) return hits[0]

  const parsed = parseEnderecoBrLivre(consulta)
  const qNorm = normalizarGeo(consulta)
  const uf = (ufHint || parsed.uf || '').toUpperCase() || undefined
  const numDigitado = parsed.numero || extrairNumeroDigitado(consulta)
  const cidadeNorm = parsed.cidade ? normalizarGeo(parsed.cidade) : ''
  let best = hits[0]
  let bestScore = -Infinity

  for (const h of hits) {
    const label = normalizarGeo(h.label)
    const display = normalizarGeo(h.display)
    let score = 0
    if (label.startsWith(qNorm) || display.startsWith(qNorm.split(',')[0] || qNorm)) score += 20
    if (uf) {
      const ufN = normalizarGeo(uf)
      const estadoN = normalizarGeo(UF_NOME[uf] || '')
      if (label.includes(ufN) || display.includes(ufN) || display.includes(estadoN)) score += 30
    }
    if (cidadeNorm && (label.includes(cidadeNorm) || display.includes(cidadeNorm))) score += 35
    if (h.secondary) score += 5
    if (numDigitado) {
      const hn = (h.housenumber || '').trim()
      if (hn && hn.toLowerCase() === numDigitado.toLowerCase()) score += 45
      else if (hn) score += 10
      else score += 2
    }
    if (score > bestScore) {
      bestScore = score
      best = h
    }
  }
  return best
}

