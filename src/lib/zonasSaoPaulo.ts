import { normalizarTexto } from './cidadesBrasil'
import type { GeoFc, GeoProps } from './geoBrasil'

/** Município de São Paulo (IBGE). */
export const MUN_SAO_PAULO_ID = '3550308'

export const ZONAS_SP = [
  { id: 'centro', nome: 'Centro' },
  { id: 'norte', nome: 'Zona Norte' },
  { id: 'sul', nome: 'Zona Sul' },
  { id: 'leste', nome: 'Zona Leste' },
  { id: 'oeste', nome: 'Zona Oeste' },
] as const

export type ZonaSpId = (typeof ZONAS_SP)[number]['id']

export const ZONA_SP_COR: Record<string, string> = {
  Centro: '#64748b',
  'Zona Norte': '#2563eb',
  'Zona Sul': '#16a34a',
  'Zona Leste': '#dc2626',
  'Zona Oeste': '#7c3aed',
}

/** Distritos IBGE do município, agrupados nas regiões da Prefeitura. */
const DISTRITOS_POR_ZONA: Record<ZonaSpId, string[]> = {
  centro: [
    'Bela Vista',
    'Bom Retiro',
    'Cambuci',
    'Consolação',
    'Liberdade',
    'República',
    'Santa Cecília',
    'Sé',
  ],
  norte: [
    'Anhanguera',
    'Brasilândia',
    'Cachoeirinha',
    'Casa Verde',
    'Freguesia do Ó',
    'Jaraguá',
    'Jaçanã',
    'Limão',
    'Mandaqui',
    'Perus',
    'Pirituba',
    'Santana',
    'São Domingos',
    'Tremembé',
    'Tucuruvi',
    'Vila Guilherme',
    'Vila Maria',
    'Vila Medeiros',
  ],
  sul: [
    'Campo Belo',
    'Campo Grande',
    'Campo Limpo',
    'Capão Redondo',
    'Cidade Ademar',
    'Cidade Dutra',
    'Cursino',
    'Grajaú',
    'Ipiranga',
    'Jabaquara',
    'Jardim São Luís',
    'Jardim Ângela',
    'Marsilac',
    'Moema',
    'Parelheiros',
    'Pedreira',
    'Sacomã',
    'Santo Amaro',
    'Saúde',
    'Socorro',
    'Vila Andrade',
    'Vila Mariana',
  ],
  leste: [
    'Aricanduva',
    'Artur Alvim',
    'Belém',
    'Brás',
    'Cangaiba',
    'Carrão',
    'Cidade Lider',
    'Cidade Tiradentes',
    'Ermelino Matarazzo',
    'Guaianases',
    'Iguatemi',
    'Itaim Paulista',
    'Itaquera',
    'Jardim Helena',
    'José Bonifácio',
    'Lajeado',
    'Mooca',
    'Pari',
    'Parque do Carmo',
    'Penha',
    'Ponte Rasa',
    'Sapopemba',
    'São Lucas',
    'São Mateus',
    'São Miguel',
    'São Rafael',
    'Tatuapé',
    'Vila Curuçá',
    'Vila Formosa',
    'Vila Jacuí',
    'Vila Matilde',
    'Vila Prudente',
    'Água Rasa',
  ],
  oeste: [
    'Alto de Pinheiros',
    'Barra Funda',
    'Butantã',
    'Itaim Bibi',
    'Jaguara',
    'Jaguaré',
    'Jardim Paulista',
    'Lapa',
    'Morumbi',
    'Perdizes',
    'Pinheiros',
    'Raposo Tavares',
    'Rio Pequeno',
    'Vila Leopoldina',
    'Vila Sônia',
  ],
}

const ZONA_POR_DISTRITO = new Map<string, ZonaSpId>()
for (const z of ZONAS_SP) {
  for (const nome of DISTRITOS_POR_ZONA[z.id]) {
    ZONA_POR_DISTRITO.set(normalizarTexto(nome), z.id)
  }
}

function aneisDeGeom(g: GeoJSON.Geometry): number[][][][] {
  if (g.type === 'Polygon') return [g.coordinates]
  if (g.type === 'MultiPolygon') return g.coordinates
  return []
}

/** Mantém os 96 distritos e pinta cada um na zona da Prefeitura. */
export function agruparDistritosEmZonasSp(fc: GeoFc): GeoFc | null {
  const features: GeoFc['features'] = []
  const municipioId = fc.features[0]?.properties.municipioId || MUN_SAO_PAULO_ID

  for (const f of fc.features) {
    const zonaId = ZONA_POR_DISTRITO.get(normalizarTexto(f.properties.nome || ''))
    if (!zonaId || !f.geometry) continue
    const zona = ZONAS_SP.find((z) => z.id === zonaId)
    if (!zona) continue
    features.push({
      ...f,
      properties: {
        ...f.properties,
        tipo: 'distrito',
        zona: zona.nome,
        zonaId: `b-${municipioId}-zona-${zona.id}`,
      },
    })
  }

  return features.length >= 2 ? { type: 'FeatureCollection', features } : null
}

/** Centroides das 5 zonas (para o rótulo grande). */
export function centrosZonasSp(
  fc: GeoFc,
): Array<{ nome: string; lat: number; lng: number }> {
  const acc = new Map<string, { lat: number; lng: number; n: number }>()
  for (const f of fc.features) {
    const nome = f.properties.zona
    if (!nome || !f.geometry) continue
    const aneis = aneisDeGeom(f.geometry)
    let lat = 0
    let lng = 0
    let n = 0
    for (const poly of aneis) {
      const ring = poly[0]
      if (!ring?.length) continue
      for (const [x, y] of ring) {
        lng += x
        lat += y
        n += 1
      }
    }
    if (!n) continue
    const cur = acc.get(nome) ?? { lat: 0, lng: 0, n: 0 }
    cur.lat += lat
    cur.lng += lng
    cur.n += n
    acc.set(nome, cur)
  }
  return [...acc.entries()].map(([nome, c]) => ({
    nome,
    lat: c.lat / c.n,
    lng: c.lng / c.n,
  }))
}
