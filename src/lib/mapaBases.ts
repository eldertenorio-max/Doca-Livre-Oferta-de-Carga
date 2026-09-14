export type MapaPlano = 'ruas' | 'relevo' | 'satelite'
export type MapaVista = 'globo' | MapaPlano

export type MapaBaseCfg = {
  id: MapaVista
  label: string
  title: string
  preview: string
  fallback: string
  url?: string
  options?: {
    maxZoom: number
    attribution: string
    subdomains?: string
  }
}

const VISTA_KEY = 'doca-rota-mapa-vista'
const PLANO_KEY = 'doca-rota-mapa-plano'

export const MAPA_VISTAS: MapaBaseCfg[] = [
  {
    id: 'globo',
    label: 'Globo',
    title: 'Globo 3D',
    preview:
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/2/1/1',
    fallback: '#0b1c3a',
  },
  {
    id: 'ruas',
    label: 'Mapa',
    title: 'Mapa de ruas',
    preview: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/3/2/3.png',
    fallback: '#dbe4ea',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      attribution: '© OpenStreetMap © CARTO',
      subdomains: 'abcd',
    },
  },
  {
    id: 'relevo',
    label: 'Relevo',
    title: 'Mapa de relevo',
    preview:
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/3/3/2',
    fallback: '#b7d4c4',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    options: {
      maxZoom: 19,
      attribution: 'Tiles © Esri',
    },
  },
  {
    id: 'satelite',
    label: 'Satélite',
    title: 'Imagem de satélite',
    preview:
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/3/2',
    fallback: '#163048',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: {
      maxZoom: 19,
      attribution: 'Tiles © Esri',
    },
  },
]

function eVista(v: string | null): v is MapaVista {
  return v === 'globo' || v === 'ruas' || v === 'relevo' || v === 'satelite'
}

function ePlano(v: string | null): v is MapaPlano {
  return v === 'ruas' || v === 'relevo' || v === 'satelite'
}

export function loadMapaVista(): MapaVista {
  try {
    const v = localStorage.getItem(VISTA_KEY)
    if (eVista(v)) return v
  } catch {
    /* private mode */
  }
  return 'globo'
}

export function loadMapaPlano(): MapaPlano {
  try {
    const v = localStorage.getItem(PLANO_KEY)
    if (ePlano(v)) return v
  } catch {
    /* private mode */
  }
  return 'ruas'
}

export function saveMapaVista(vista: MapaVista) {
  try {
    localStorage.setItem(VISTA_KEY, vista)
    if (vista !== 'globo') localStorage.setItem(PLANO_KEY, vista)
  } catch {
    /* private mode */
  }
}
