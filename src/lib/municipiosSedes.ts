import sedesJson from './municipiosSedes.data.json' with { type: 'json' }

const SEDES = sedesJson as Record<string, [number, number]>

const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
])

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
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

/** "Arujá - SP" / "São José dos Campos, SP". */
export function coordsSedePorLabel(label: string): SedeMunicipio | null {
  const raw = label
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[,;]\s*(Brasil|Brazil)\s*$/i, '')
    .replace(/\s+[-–]\s*(Brasil|Brazil)\s*$/i, '')
    .trim()
  if (!raw) return null
  let m = raw.match(/^(.+?)\s*[-–,]\s*([A-Za-zÁÉÍÓÚÂÊÔÃÕÇ]{2})\s*$/u)
  if (!m) m = raw.match(/^(.+)-([A-Za-z]{2})$/)
  if (!m) m = raw.match(/^(.+?)\s+([A-Za-z]{2})$/)
  if (!m) return null
  const uf = m[2].toUpperCase()
  const cidade = m[1].trim()
  if (!UFS.has(uf) || cidade.length < 2) return null
  return coordsSedeMunicipio(cidade, uf)
}
