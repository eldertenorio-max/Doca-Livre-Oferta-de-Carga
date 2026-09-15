import { useEffect, useRef, useState } from 'react'
import type { Map as MlMap, Marker as MlMarker } from 'maplibre-gl'
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
/** Tamanho travado da visão inicial (planeta grande, com um pouco de espaço). */
const ZOOM_INICIAL = 2.45
const ZOOM_MIN = 2.2
const ZOOM_MAX = 19

export type EarthGlobeVia = Coord & { n: number; label?: string }

type Props = {
  pickMode?: EarthGlobePick | null
  onPick?: (lat: number, lng: number) => void
  pontoA?: Coord | null
  pontoB?: Coord | null
  labelA?: string
  labelB?: string
  vias?: EarthGlobeVia[]
  /** Incrementa para mergulhar do espaço até o mapa. 0 = volta à órbita. */
  entrarId?: number
  saindo?: boolean
  onEntradaFim?: () => void
  onReady?: () => void
  onError?: () => void
}

function pontosAlvo(
  a?: Coord | null,
  b?: Coord | null,
  vias?: EarthGlobeVia[],
): Coord[] {
  const pts: Coord[] = []
  if (a) pts.push(a)
  if (b) pts.push(b)
  for (const v of vias ?? []) {
    if (Number.isFinite(v.lat) && Number.isFinite(v.lng)) pts.push(v)
  }
  return pts
}

function centroAlvo(pts: Coord[]): [number, number] {
  if (pts.length === 0) return CENTRO_INICIAL
  const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length
  const lng = pts.reduce((s, p) => s + p.lng, 0) / pts.length
  return [lng, lat]
}

function zoomAlvo(pts: Coord[]): number {
  if (pts.length === 0) return ZOOM_INICIAL
  if (pts.length === 1) return 7.6
  let span = 0
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      span = Math.max(
        span,
        Math.abs(pts[i].lat - pts[j].lat),
        Math.abs(pts[i].lng - pts[j].lng),
      )
    }
  }
  if (span > 18) return 4.8
  if (span > 8) return 5.8
  if (span > 3) return 6.8
  if (span > 1) return 8
  return 9.2
}

function escHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )
}

function criarPinEl(letra: string, cor: string, nome?: string) {
  const el = document.createElement('div')
  el.className = 'earth-globe__pin'
  const ref = (nome || '').trim() || letra
  el.setAttribute('title', ref)
  el.setAttribute('aria-label', ref)
  el.innerHTML = `<span class="earth-globe__pin-tip">${escHtml(ref)}</span>
    <svg viewBox="0 0 32 42" width="30" height="39" aria-hidden="true">
    <path d="M16 2C8.8 2 3 8 3 15.6c0 9.8 13 23.6 13 23.6s13-13.8 13-23.6C29 8 23.2 2 16 2z"
      fill="${cor}" stroke="#fff" stroke-width="2"/>
    <circle cx="16" cy="15.4" r="7.2" fill="#fff"/>
    <text x="16" y="19.4" text-anchor="middle" font-size="10.5" font-weight="800"
      font-family="system-ui,sans-serif" fill="${cor}">${escHtml(letra)}</text>
  </svg>`
  return el
}

function ativarGlobo(map: MlMap) {
  map.setProjection({ type: 'globe' })
}

function apiMapLibre(mod: typeof import('maplibre-gl')) {
  const n = mod as typeof import('maplibre-gl') & { default?: typeof import('maplibre-gl') }
  return n.Map ? n : n.default ?? n
}

function visaoEspaco(map: MlMap, imediato: boolean, reduced: boolean) {
  const pose = {
    center: CENTRO_INICIAL,
    zoom: ZOOM_INICIAL,
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
  labelA = '',
  labelB = '',
  vias = [],
  entrarId = 0,
  saindo = false,
  onEntradaFim,
  onReady,
  onError,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | undefined>(undefined)
  const markerARef = useRef<MlMarker | undefined>(undefined)
  const markerBRef = useRef<MlMarker | undefined>(undefined)
  const markersViaRef = useRef<MlMarker[]>([])
  const libRef = useRef<typeof import('maplibre-gl') | undefined>(undefined)
  const pickModeRef = useRef(pickMode)
  const onPickRef = useRef(onPick)
  pickModeRef.current = pickMode
  onPickRef.current = onPick
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  onReadyRef.current = onReady
  onErrorRef.current = onError
  const onEntradaFimRef = useRef(onEntradaFim)
  onEntradaFimRef.current = onEntradaFim
  const pontoARef = useRef(pontoA)
  const pontoBRef = useRef(pontoB)
  const viasRef = useRef(vias)
  pontoARef.current = pontoA
  pontoBRef.current = pontoB
  viasRef.current = vias
  const saindoRef = useRef(saindo)
  saindoRef.current = saindo
  const [mapaOk, setMapaOk] = useState(false)
  const [entrando, setEntrando] = useState(false)
  const viasKey = vias.map((v) => `${v.n}:${v.lat}:${v.lng}:${v.label ?? ''}`).join('|')

  function alvoAtual(): { center: [number, number]; zoom: number } {
    const pts = pontosAlvo(pontoARef.current, pontoBRef.current, viasRef.current)
    return { center: centroAlvo(pts), zoom: zoomAlvo(pts) }
  }

  useEffect(() => {
    const host = mapEl.current
    const root = rootRef.current
    if (!host || !root) return
    let disposed = false
    let resizeObs: ResizeObserver | undefined
    let onUi: ((e: Event) => void) | undefined
    let down: { x: number; y: number } | undefined
    let map: MlMap | undefined

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    void (async () => {
      let maplibre: typeof import('maplibre-gl')
      try {
        maplibre = apiMapLibre(await import('maplibre-gl'))
      } catch (e) {
        console.error('[EarthGlobe] falha ao carregar mapa', e)
        if (!disposed) onErrorRef.current?.()
        return
      }
      if (disposed) return
      libRef.current = maplibre

      try {
        map = new maplibre.Map({
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
        if (!disposed) onErrorRef.current?.()
        return
      }
      if (disposed) {
        map.remove()
        return
      }
      mapRef.current = map

      const pronto = () => {
        if (disposed || !map) return
        ativarGlobo(map)
        visaoEspaco(map, true, reduced)
        map.resize()
        setMapaOk(true)
        onReadyRef.current?.()
      }

      map.on('style.load', () => {
        if (disposed || !map) return
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
        if (pickModeRef.current || !map) return
        const next = Math.min(ZOOM_MAX, map.getZoom() + 2.2)
        map.flyTo({ center: e.lngLat, zoom: next, duration: reduced ? 0 : 900 })
      })

      onUi = (e: Event) => {
        if (!map) return
        const btn = (e.target as HTMLElement).closest('[data-earth]') as HTMLElement | null
        if (!btn) return
        const act = btn.dataset.earth
        if (act === 'in') map.flyTo({ zoom: Math.min(ZOOM_MAX, map.getZoom() + 1.6), duration: 400 })
        if (act === 'out') map.flyTo({ zoom: Math.max(ZOOM_MIN, map.getZoom() - 1.6), duration: 400 })
        if (act === 'home') visaoEspaco(map, false, reduced)
      }
      root.querySelector('.earth-globe__nav')?.addEventListener('click', onUi)

      resizeObs = new ResizeObserver(() => {
        map?.resize()
      })
      resizeObs.observe(host)
    })()

    return () => {
      disposed = true
      setMapaOk(false)
      resizeObs?.disconnect()
      if (onUi) root.querySelector('.earth-globe__nav')?.removeEventListener('click', onUi)
      markerARef.current?.remove()
      markerBRef.current?.remove()
      markersViaRef.current.forEach((m) => m.remove())
      markersViaRef.current = []
      mapRef.current?.remove()
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
      const Marker = libRef.current?.Marker
      if (!Marker) return
      markerARef.current = new Marker({ element: criarPinEl('A', '#15803d', labelA || 'Origem') })
        .setLngLat([pontoA.lng, pontoA.lat])
        .addTo(map)
    }

    if (markerBRef.current) {
      markerBRef.current.remove()
      markerBRef.current = undefined
    }
    if (pontoB) {
      const Marker = libRef.current?.Marker
      if (!Marker) return
      markerBRef.current = new Marker({ element: criarPinEl('B', '#dc2626', labelB || 'Destino') })
        .setLngLat([pontoB.lng, pontoB.lat])
        .addTo(map)
    }

    markersViaRef.current.forEach((m) => m.remove())
    markersViaRef.current = []
    for (const via of vias) {
      const Marker = libRef.current?.Marker
      if (!Marker) break
      if (!Number.isFinite(via.lat) || !Number.isFinite(via.lng)) continue
      const m = new Marker({
        element: criarPinEl(String(via.n), '#2563eb', via.label || `Passagem ${via.n}`),
      })
        .setLngLat([via.lng, via.lat])
        .addTo(map)
      markersViaRef.current.push(m)
    }
  }, [mapaOk, pontoA, pontoB, labelA, labelB, viasKey])

  useEffect(() => {
    const map = mapRef.current
    if (!mapaOk || !map) return

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (entrarId < 1) {
      setEntrando(false)
      visaoEspaco(map, true, reduced)
      return
    }

    let cancelado = false
    setEntrando(true)
    try {
      map.scrollZoom.disable()
    } catch {
      /* ignore */
    }

    const esperar = (ms: number) =>
      new Promise<void>((resolve) => {
        let ok = false
        const fim = () => {
          if (ok) return
          ok = true
          map.off('moveend', fim)
          window.clearTimeout(t)
          resolve()
        }
        const t = window.setTimeout(fim, ms + 120)
        map.once('moveend', fim)
      })

    const ir = async (
      opts: { zoom?: number; pitch?: number; bearing?: number; duration: number },
    ) => {
      if (cancelado || saindoRef.current) return
      const { center, zoom } = alvoAtual()
      map.stop()
      map.easeTo({
        center,
        zoom: opts.zoom ?? zoom,
        pitch: opts.pitch,
        bearing: opts.bearing,
        duration: reduced ? 0 : opts.duration,
        easing: (t) => t * (2 - t),
        essential: true,
      })
      await esperar(reduced ? 20 : opts.duration)
    }

    void (async () => {
      const { center, zoom } = alvoAtual()
      if (reduced) {
        map.jumpTo({ center, zoom, pitch: 0, bearing: 0 })
        onEntradaFimRef.current?.()
        setEntrando(false)
        return
      }

      // Já começa a andar sozinho: espaço → continente → trecho da rota.
      await ir({ zoom: 3.05, pitch: 16, bearing: 22, duration: 700 })
      await ir({ zoom: 4.35, pitch: 28, bearing: -10, duration: 900 })
      await ir({ zoom: 5.7, pitch: 42, bearing: 14, duration: 1100 })
      await ir({ zoom, pitch: 38, bearing: -6, duration: 1200 })

      let lado = 1
      while (!cancelado && !saindoRef.current) {
        const z = alvoAtual().zoom
        lado *= -1
        await ir({
          zoom: z + (lado > 0 ? 0.18 : 0),
          pitch: 36 + (lado > 0 ? 8 : 0),
          bearing: (map.getBearing() + lado * 16 + 360) % 360,
          duration: 1700,
        })
      }

      if (cancelado) return
      map.stop()
      map.easeTo({ pitch: 0, bearing: 0, duration: 420, essential: true })
      await esperar(450)
      try {
        map.scrollZoom.enable()
      } catch {
        /* ignore */
      }
      setEntrando(false)
      onEntradaFimRef.current?.()
    })()

    return () => {
      cancelado = true
      map.stop()
    }
  }, [entrarId, mapaOk])

  useEffect(() => {
    if (!saindo) return
    const map = mapRef.current
    if (!map || !mapaOk) return
    map.stop()
    map.easeTo({ pitch: 0, bearing: 0, duration: 380, essential: true })
  }, [saindo, mapaOk])

  return (
    <div
      ref={rootRef}
      className={`earth-globe${pickMode ? ' earth-globe--pick' : ''}${mapaOk ? '' : ' earth-globe--boot'}${entrando ? ' earth-globe--entrando' : ''}${saindo ? ' earth-globe--saindo' : ''}`}
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
