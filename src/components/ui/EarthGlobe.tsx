import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../../styles/earth-globe.css'

type Coord = { lat: number; lng: number }

export type EarthGlobePick = 'A' | 'B'

/** Foto de satélite (Sentinel-2) — no espaço fica parecido com o Google Earth. */
const TILES_ESPACO =
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg'
/** Satélite de alta resolução para quando o zoom entra no chão. */
const TILES_PERTO =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

const CENTRO_INICIAL: [number, number] = [-40, -8]
/** Zoom alto o bastante para o planeta encostar nas margens, sem sumir no espaço. */
const ZOOM_INICIAL = 2.45
const ZOOM_MIN = 1.85
const ZOOM_MAX = 19

type Props = {
  pickMode?: EarthGlobePick | null
  onPick?: (lat: number, lng: number) => void
  pontoA?: Coord | null
  pontoB?: Coord | null
  onReady?: () => void
  onError?: () => void
}

function criarPinEl(letra: string, cor: string) {
  const el = document.createElement('div')
  el.className = 'earth-globe__pin'
  el.innerHTML = `<svg viewBox="0 0 32 42" width="30" height="39" aria-hidden="true">
    <path d="M16 2C8.8 2 3 8 3 15.6c0 9.8 13 23.6 13 23.6s13-13.8 13-23.6C29 8 23.2 2 16 2z"
      fill="${cor}" stroke="#fff" stroke-width="2"/>
    <circle cx="16" cy="15.4" r="7.2" fill="#fff"/>
    <text x="16" y="19.4" text-anchor="middle" font-size="10.5" font-weight="800"
      font-family="system-ui,sans-serif" fill="${cor}">${letra}</text>
  </svg>`
  return el
}

function ativarGlobo(map: maplibregl.Map) {
  map.setProjection({ type: 'globe' })
}

/** Zoom para o planeta ocupar quase toda a área (perto das margens). */
function zoomParaMargens(map: maplibregl.Map): number {
  const el = map.getContainer()
  const menor = Math.min(el.clientWidth || 520, el.clientHeight || 520)
  const z = ZOOM_INICIAL + Math.log2(Math.max(menor, 280) / 520)
  return Math.min(2.95, Math.max(ZOOM_MIN, z))
}

function visaoEspaco(map: maplibregl.Map, imediato: boolean, reduced: boolean) {
  const pose = {
    center: CENTRO_INICIAL,
    zoom: zoomParaMargens(map),
    bearing: 0,
    pitch: 0,
  }
  if (imediato || reduced) map.jumpTo(pose)
  else map.flyTo({ ...pose, duration: 1000 })
}

export function EarthGlobe({
  pickMode = null,
  onPick,
  pontoA = null,
  pontoB = null,
  onReady,
  onError,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | undefined>(undefined)
  const markerARef = useRef<maplibregl.Marker | undefined>(undefined)
  const markerBRef = useRef<maplibregl.Marker | undefined>(undefined)
  const pickModeRef = useRef(pickMode)
  const onPickRef = useRef(onPick)
  pickModeRef.current = pickMode
  onPickRef.current = onPick
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  onReadyRef.current = onReady
  onErrorRef.current = onError
  const [mapaOk, setMapaOk] = useState(false)

  useEffect(() => {
    const host = mapEl.current
    const root = rootRef.current
    if (!host || !root) return
    let disposed = false
    let resizeObs: ResizeObserver | undefined
    let onUi: ((e: Event) => void) | undefined
    let down: { x: number; y: number } | undefined

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container: host,
        style: {
          version: 8,
          projection: { type: 'globe' },
          sources: {
            espaco: {
              type: 'raster',
              tiles: [TILES_ESPACO],
              tileSize: 256,
              maxzoom: 13,
              attribution: 'Sentinel-2 cloudless © EOX',
            },
            perto: {
              type: 'raster',
              tiles: [TILES_PERTO],
              tileSize: 256,
              maxzoom: 19,
              attribution: 'Esri, Maxar, Earthstar Geographics',
            },
          },
          layers: [
            { id: 'espaco', type: 'raster', source: 'espaco' },
            {
              id: 'perto',
              type: 'raster',
              source: 'perto',
              minzoom: 6,
            },
          ],
          sky: {
            'sky-color': '#000010',
            'horizon-color': '#1a4a8a',
            'fog-color': '#0b1c3a',
            'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
          },
          light: { anchor: 'viewport', position: [1.15, 210, 30] },
        },
        center: CENTRO_INICIAL,
        zoom: ZOOM_INICIAL,
        minZoom: ZOOM_MIN,
        maxZoom: ZOOM_MAX,
        attributionControl: false,
        dragRotate: true,
        touchPitch: false,
        pitchWithRotate: false,
        doubleClickZoom: false,
        renderWorldCopies: false,
        fadeDuration: reduced ? 0 : 300,
      })
    } catch (e) {
      console.error('[EarthGlobe] falha ao criar mapa', e)
      onErrorRef.current?.()
      return
    }
    mapRef.current = map

    const pronto = () => {
      if (disposed) return
      ativarGlobo(map)
      visaoEspaco(map, true, reduced)
      map.resize()
      setMapaOk(true)
      onReadyRef.current?.()
    }

    map.on('style.load', () => {
      if (disposed) return
      ativarGlobo(map)
    })

    map.on('error', (e) => {
      console.error('[EarthGlobe] erro do mapa', e?.error || e)
    })

    map.on('load', pronto)

    map.on('mousedown', (e) => {
      down = { x: e.point.x, y: e.point.y }
    })
    map.on('click', (e) => {
      const modo = pickModeRef.current
      if (!modo || !onPickRef.current) return
      if (down) {
        const dist = Math.hypot(e.point.x - down.x, e.point.y - down.y)
        if (dist > 6) return
      }
      onPickRef.current(e.lngLat.lat, e.lngLat.lng)
    })
    map.on('dblclick', (e) => {
      if (pickModeRef.current) return
      const next = Math.min(ZOOM_MAX, map.getZoom() + 2.2)
      map.flyTo({ center: e.lngLat, zoom: next, duration: reduced ? 0 : 900 })
    })

    onUi = (e: Event) => {
      const btn = (e.target as HTMLElement).closest('[data-earth]') as HTMLElement | null
      if (!btn) return
      const act = btn.dataset.earth
      if (act === 'in') map.flyTo({ zoom: Math.min(ZOOM_MAX, map.getZoom() + 1.6), duration: 400 })
      if (act === 'out') map.flyTo({ zoom: Math.max(ZOOM_MIN, map.getZoom() - 1.6), duration: 400 })
      if (act === 'home') visaoEspaco(map, false, reduced)
    }
    root.querySelector('.earth-globe__nav')?.addEventListener('click', onUi)

    resizeObs = new ResizeObserver(() => {
      map.resize()
      if (map.getZoom() <= ZOOM_INICIAL + 0.35) {
        ativarGlobo(map)
        visaoEspaco(map, true, true)
      }
    })
    resizeObs.observe(host)

    return () => {
      disposed = true
      setMapaOk(false)
      resizeObs?.disconnect()
      if (onUi) root.querySelector('.earth-globe__nav')?.removeEventListener('click', onUi)
      markerARef.current?.remove()
      markerBRef.current?.remove()
      map.remove()
      mapRef.current = undefined
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!mapaOk || !map) return

    if (markerARef.current) {
      markerARef.current.remove()
      markerARef.current = undefined
    }
    if (pontoA) {
      markerARef.current = new maplibregl.Marker({ element: criarPinEl('A', '#15803d') })
        .setLngLat([pontoA.lng, pontoA.lat])
        .addTo(map)
    }

    if (markerBRef.current) {
      markerBRef.current.remove()
      markerBRef.current = undefined
    }
    if (pontoB) {
      markerBRef.current = new maplibregl.Marker({ element: criarPinEl('B', '#dc2626') })
        .setLngLat([pontoB.lng, pontoB.lat])
        .addTo(map)
    }
  }, [mapaOk, pontoA, pontoB])

  return (
    <div
      ref={rootRef}
      className={`earth-globe${pickMode ? ' earth-globe--pick' : ''}${mapaOk ? '' : ' earth-globe--boot'}`}
      role="application"
      aria-label="Globo 3D com satélite. Role para entrar no mapa, arraste para girar. Use Ponto A e Ponto B para marcar origem e destino."
    >
      <div className="earth-globe__stars" aria-hidden />
      <div ref={mapEl} className="earth-globe__map" />
      <div className="earth-globe__nav" data-pdf-ignore>
        <button type="button" data-earth="in" title="Entrar no mapa" aria-label="Entrar no mapa">
          +
        </button>
        <button type="button" data-earth="out" title="Afastar" aria-label="Afastar">
          −
        </button>
        <button type="button" data-earth="home" title="Visão do espaço" aria-label="Visão do espaço">
          ⌂
        </button>
      </div>
      <p className="earth-globe__hint">
        Role a roda do mouse para puxar o zoom · arraste para girar o planeta
      </p>
    </div>
  )
}
