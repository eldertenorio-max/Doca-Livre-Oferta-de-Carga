export const UFS_BR = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

export const UF_NOMES: Record<(typeof UFS_BR)[number], string> = {
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

const CENTRO_UF: Record<string, [number, number]> = {
  AC: [-9.97, -67.81],
  AL: [-9.67, -35.74],
  AP: [0.03, -51.07],
  AM: [-3.12, -60.02],
  BA: [-12.97, -38.5],
  CE: [-3.72, -38.54],
  DF: [-15.78, -47.93],
  ES: [-20.32, -40.34],
  GO: [-16.68, -49.25],
  MA: [-2.53, -44.3],
  MT: [-15.6, -56.1],
  MS: [-20.44, -54.65],
  MG: [-19.92, -43.94],
  PA: [-1.46, -48.5],
  PB: [-7.12, -34.86],
  PR: [-25.43, -49.27],
  PE: [-8.05, -34.88],
  PI: [-5.09, -42.8],
  RJ: [-22.91, -43.17],
  RN: [-5.79, -35.21],
  RS: [-30.03, -51.23],
  RO: [-8.76, -63.9],
  RR: [2.82, -60.67],
  SC: [-27.59, -48.55],
  SP: [-23.55, -46.63],
  SE: [-10.91, -37.07],
  TO: [-10.18, -48.33],
}

export async function geocodificarEndereco(q: {
  endereco?: string
  cidade: string
  uf: string
}): Promise<{ lat: number; lng: number }> {
  const fallback = CENTRO_UF[q.uf] ?? CENTRO_UF.SP
  const busca = [q.endereco, q.cidade, q.uf, 'Brasil'].filter(Boolean).join(', ')
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(busca)}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return { lat: fallback[0], lng: fallback[1] }
    const data = (await res.json()) as { lat: string; lon: string }[]
    if (!data[0]) return { lat: fallback[0], lng: fallback[1] }
    return { lat: Number(data[0].lat), lng: Number(data[0].lon) }
  } catch {
    return { lat: fallback[0], lng: fallback[1] }
  }
}
