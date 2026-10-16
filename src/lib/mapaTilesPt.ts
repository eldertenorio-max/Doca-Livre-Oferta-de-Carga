import L from 'leaflet'
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'

/** Estilo OpenFreeMap Liberty com rótulos preferindo português. */
export const MAPA_STYLE_RUAS_PT = '/mapas/liberty-pt.json'

export const MAPA_ATRIBUICAO_RUAS_PT =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://openfreemap.org/">OpenFreeMap</a>'

/**
 * Camada de ruas com nomes em português (fallback: latim / inglês / nome local).
 * Substitui o raster OSM padrão, que mostra o idioma de cada país.
 */
export function camadaRuasPortugues(): L.Layer {
  return maplibreGL({
    style: MAPA_STYLE_RUAS_PT,
    interactive: false,
    attributionControl: false,
  })
}

/** Troca a base do mapa Leaflet pela camada de ruas em português. */
export function aplicarCamadaRuasPortugues(
  map: L.Map,
  atual: L.Layer | null = null,
): L.Layer {
  if (atual) {
    map.removeLayer(atual)
    map.attributionControl?.removeAttribution(MAPA_ATRIBUICAO_RUAS_PT)
  }
  const layer = camadaRuasPortugues()
  layer.addTo(map)
  map.attributionControl?.addAttribution(MAPA_ATRIBUICAO_RUAS_PT)
  if (typeof (layer as L.TileLayer).bringToBack === 'function') {
    ;(layer as L.TileLayer).bringToBack()
  }
  return layer
}
