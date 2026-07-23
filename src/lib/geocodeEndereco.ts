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
