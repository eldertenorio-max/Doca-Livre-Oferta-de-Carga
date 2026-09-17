export type CoordRota = { lat: number; lng: number }

export type ViaRotaMarca = {
  id: string
  endereco: string
  lat?: number | null
  lng?: number | null
}

export type EstadoRotaMarca = {
  origem: string
  destino: string
  origemCoords: CoordRota | null
  destinoCoords: CoordRota | null
  vias: ViaRotaMarca[]
}

/** Campo focado (`A`, `B` ou id da via) ou `auto` (sequência no mapa). */
export type AlvoRotaMarca = 'A' | 'B' | 'auto' | string

export function novoIdVia(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `via-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function temCoord(c: CoordRota | null | undefined): c is CoordRota {
  return Boolean(c && Number.isFinite(c.lat) && Number.isFinite(c.lng))
}

function aplicarAlvoFixo(
  estado: EstadoRotaMarca,
  alvo: string,
  label: string,
  coords: CoordRota,
): { estado: EstadoRotaMarca; proximoAlvo: AlvoRotaMarca; calcular: boolean } {
  if (alvo === 'A') {
    const next = { ...estado, origem: label, origemCoords: coords }
    return {
      estado: next,
      proximoAlvo: temCoord(next.destinoCoords) ? 'auto' : 'B',
      calcular: temCoord(next.destinoCoords) && next.destino.trim().length >= 3,
    }
  }
  if (alvo === 'B') {
    const next = { ...estado, destino: label, destinoCoords: coords }
    return {
      estado: next,
      proximoAlvo: 'auto',
      calcular: temCoord(next.origemCoords) && next.origem.trim().length >= 3,
    }
  }
  const existe = estado.vias.some((v) => v.id === alvo)
  const vias = existe
    ? estado.vias.map((v) => (v.id === alvo ? { ...v, endereco: label, lat: coords.lat, lng: coords.lng } : v))
    : [...estado.vias, { id: alvo, endereco: label, lat: coords.lat, lng: coords.lng }]
  const next = { ...estado, vias }
  return {
    estado: next,
    proximoAlvo: 'auto',
    calcular: temCoord(next.origemCoords) && temCoord(next.destinoCoords),
  }
}

/**
 * Clique no mapa: campo armado preenche aquele ponto.
 * Sem campo, 1º clique = origem, 2º = destino; cliques seguintes
 * viram o destino anterior em passagem e o último continua sendo o destino.
 * Arrastar só move o pino, sem criar ponto novo.
 */
export function aplicarPontoNoMapa(
  estado: EstadoRotaMarca,
  opts: {
    alvo: AlvoRotaMarca
    label: string
    lat: number
    lng: number
    novaViaId?: () => string
    arrastar?: boolean
  },
): { estado: EstadoRotaMarca; proximoAlvo: AlvoRotaMarca; calcular: boolean } {
  const coords = { lat: opts.lat, lng: opts.lng }
  const alvo = opts.alvo && opts.alvo !== 'auto' ? opts.alvo : 'auto'

  if (opts.arrastar) {
    const fixo = alvo === 'auto' ? 'B' : alvo
    return aplicarAlvoFixo(estado, fixo, opts.label, coords)
  }

  if (alvo !== 'auto') {
    return aplicarAlvoFixo(estado, alvo, opts.label, coords)
  }

  if (!temCoord(estado.origemCoords)) {
    return {
      estado: { ...estado, origem: opts.label, origemCoords: coords },
      proximoAlvo: 'B',
      calcular: false,
    }
  }

  if (!temCoord(estado.destinoCoords)) {
    const next = { ...estado, destino: opts.label, destinoCoords: coords }
    return {
      estado: next,
      proximoAlvo: 'auto',
      calcular: next.origem.trim().length >= 3,
    }
  }

  const id = opts.novaViaId?.() ?? novoIdVia()
  const via: ViaRotaMarca = {
    id,
    endereco: estado.destino,
    lat: estado.destinoCoords.lat,
    lng: estado.destinoCoords.lng,
  }
  return {
    estado: {
      ...estado,
      vias: [...estado.vias, via],
      destino: opts.label,
      destinoCoords: coords,
    },
    proximoAlvo: 'auto',
    calcular: true,
  }
}

export function rotuloMarcarPontos(pickMode: string | null) {
  if (pickMode === 'A') return 'Clique no mapa para marcar a origem'
  if (pickMode === 'B') return 'Clique no mapa para marcar o destino'
  if (pickMode && pickMode !== 'auto') return 'Clique no mapa para marcar o ponto de passagem'
  return 'Marcar pontos no mapa'
}
