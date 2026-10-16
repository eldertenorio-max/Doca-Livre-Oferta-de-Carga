import L from 'leaflet'
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { isSupabaseConfigured, supabaseUrl } from './supabase'

/** Estilo OpenFreeMap Liberty (fallback) sem alfabetos locais. */
export const MAPA_STYLE_RUAS_PT = '/mapas/liberty-pt.json?v=365'

export const MAPA_ATRIBUICAO_RUAS_PT =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.osmap.pt/">osMap PT</a>'

let workerPronto = false
function garantirWorkerMapLibre() {
  if (workerPronto) return
  try {
    setWorkerUrl(workerUrl)
  } catch {
    /* bundler sem worker — MapLibre tenta o default */
  }
  workerPronto = true
}

/**
 * Rótulo: português → inglês/latim.
 * Se o lugar tem nome em alfabeto local (name:nonlatin), não usa `name`
 * (evita chinês/árabe/etc. quando não há name_pt).
 */
export const ROTULO_MAPA_PT: unknown = [
  'coalesce',
  ['get', 'name_pt'],
  ['get', 'name:pt'],
  ['get', 'name_en'],
  ['get', 'name:en'],
  ['get', 'name:latin'],
  [
    'case',
    ['has', 'name:nonlatin'],
    ['coalesce', ['get', 'name:latin'], ['get', 'name_en'], ['get', 'name:en'], ''],
    ['get', 'name'],
  ],
]

function urlTilePortugues(): string | null {
  if (!isSupabaseConfigured || !supabaseUrl) return null
  const base = supabaseUrl.replace(/\/$/, '')
  return `${base}/functions/v1/mapa-tile-pt/{s}/{z}/{x}/{y}.png`
}

/** Camada raster OSM com nomes em português (proxy osMap). */
function camadaRasterPortugues(): L.TileLayer {
  const url = urlTilePortugues()!
  return L.tileLayer(url, {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: MAPA_ATRIBUICAO_RUAS_PT,
    crossOrigin: true,
  })
}

/** Fallback vetorial OpenFreeMap com rótulos PT/latim. */
function camadaVetorPortugues(): L.Layer {
  garantirWorkerMapLibre()
  return maplibreGL({
    style: MAPA_STYLE_RUAS_PT,
    interactive: false,
    attributionControl: false,
  })
}

/**
 * Camada de ruas com nomes em português.
 * Preferência: tiles osMap PT via Edge; senão OpenFreeMap vetorial.
 */
export function camadaRuasPortugues(): L.Layer {
  if (urlTilePortugues()) return camadaRasterPortugues()
  return camadaVetorPortugues()
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
