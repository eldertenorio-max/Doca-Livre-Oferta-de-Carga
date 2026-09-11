import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../../styles/earth-globe.css'

type Coord = { lat: number; lng: number }

export type EarthGlobePick = 'A' | 'B'

const SATELITE_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
]

const CENTRO_INICIAL: [number, number] = [-48, -14]
const ZOOM_INICIAL = 1.35
const ZOOM_MIN = 0.6
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
            satelite: {
              type: 'raster',
              tiles: SATELITE_TILES,
              tileSize: 256,
              maxzoom: 19,
              attribution: 'Esri, Maxar, Earthstar Geographics',
            },
          },
          layers: [{ id: 'satelite', type: 'raster', source: 'satelite' }],
          sky: {
            'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
          },
          light: { anchor: 'map', position: [1.5, 90, 80] },
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
      })
    } catch (e) {
      console.error('[EarthGlobe] falha ao criar mapa', e)
      onErrorRef.current?.()
      return
    }
    mapRef.current = map

    const checarDesenho = () => {
      if (disposed) return
      try {
        const canvas = map.getCanvas()
        const gl = (canvas.getContext('webgl2') ||
          canvas.getContext('webgl')) as WebGLRenderingContext | null
        if (!gl) return
        const w = gl.drawingBufferWidth
        const h = gl.drawingBufferHeight
        if (!w || !h) return
        const pontos: Array<[number, number]> = [
          [Math.floor(w / 2), Math.floor(h / 2)],
          [Math.floor(w * 0.3), Math.floor(h * 0.4)],
          [Math.floor(w * 0.7), Math.floor(h * 0.4)],
        ]
        const pixel = new Uint8Array(4)
        const tudoPreto = pontos.every(([x, y]) => {
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
          return pixel[0] <= 3 && pixel[1] <= 4 && pixel[2] <= 10
        })
        if (tudoPreto) {
          console.error('[EarthGlobe] globo não desenhou nada (canvas preto) — usando mapa 2D')
          onErrorRef.current?.()
        }
      } catch (e) {
        console.error('[EarthGlobe] falha ao checar canvas', e)
      }
    }

    map.on('error', (e) => {
      console.error('[EarthGlobe] erro do mapa', e?.error || e)
    })

    map.on('load', () => {
      if (disposed) return
      setMapaOk(true)
      onReadyRef.current?.()
      window.setTimeout(checarDesenho, 1400)
    })

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
      if (act === 'home')
        map.flyTo({
          center: CENTRO_INICIAL,
          zoom: ZOOM_INICIAL,
          bearing: 0,
          pitch: 0,
          duration: reduced ? 0 : 1000,
        })
    }
    root.querySelector('.earth-globe__nav')?.addEventListener('click', onUi)

    resizeObs = new ResizeObserver(() => map.resize())
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
        Role a roda do mouse para puxar o zoom · arraste para girar · + entra no mapa
      </p>
    </div>
  )
}
