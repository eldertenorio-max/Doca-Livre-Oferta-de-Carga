import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Props = {
  lat: number | null
  lng: number | null
  /** Raio em km (círculo opcional). */
  raioKm?: number | null
  className?: string
  /** Clique no mapa define novas coordenadas. */
  onPick?: (lat: number, lng: number) => void
  height?: number
}

function pinIcon() {
  return L.divIcon({
    className: 'ponto-map-pin',
    html: `<span style="
      display:inline-flex;align-items:center;justify-content:center;
      width:28px;height:28px;border-radius:50%;
      background:#ea580c;color:#fff;font:800 12px/1 system-ui,sans-serif;
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);
    ">●</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

export function PontoMapPreview({
  lat,
  lng,
  raioKm,
  className = '',
  onPick,
  height = 240,
}: Props) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const tinhaPin = useRef(false)
  const raioAnterior = useRef<number | null>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const el = mapEl.current
    const map = L.map(el, {
      center: [-14.2, -51.9],
      zoom: 4,
      zoomControl: true,
      attributionControl: false,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map

    map.on('click', (e: L.LeafletMouseEvent) => {
      onPickRef.current?.(e.latlng.lat, e.latlng.lng)
    })

    const refresh = () => map.invalidateSize({ animate: false })
    const t1 = window.setTimeout(refresh, 80)
    const t2 = window.setTimeout(refresh, 320)
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => refresh())
        : null
    ro?.observe(el.parentElement ?? el)

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      ro?.disconnect()
      map.remove()
      mapRef.current = null
      markerRef.current = null
      circleRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const ok =
      lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)

    if (!ok) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current)
        markerRef.current = null
      }
      if (circleRef.current) {
        map.removeLayer(circleRef.current)
        circleRef.current = null
      }
      tinhaPin.current = false
      raioAnterior.current = null
      map.setView([-14.2, -51.9], 4)
      return
    }

    const ll: L.LatLngExpression = [lat, lng]
    if (markerRef.current) {
      markerRef.current.setLatLng(ll)
    } else {
      markerRef.current = L.marker(ll, {
        icon: pinIcon(),
        draggable: Boolean(onPickRef.current),
      }).addTo(map)
      markerRef.current.on('dragend', () => {
        const p = markerRef.current?.getLatLng()
        if (p) onPickRef.current?.(p.lat, p.lng)
      })
    }

    const raioMudou = raioAnterior.current !== (raioKm ?? null)
    raioAnterior.current = raioKm ?? null

    if (raioKm != null && raioKm > 0) {
      if (circleRef.current) {
        circleRef.current.setLatLng(ll)
        circleRef.current.setRadius(raioKm * 1000)
      } else {
        circleRef.current = L.circle(ll, {
          radius: raioKm * 1000,
          color: '#ea580c',
          weight: 2,
          fillColor: '#fb923c',
          fillOpacity: 0.12,
        }).addTo(map)
      }
      if (!tinhaPin.current || raioMudou) {
        map.fitBounds(circleRef.current.getBounds(), { padding: [28, 28], maxZoom: 12 })
      } else {
        map.panTo(ll)
      }
    } else {
      if (circleRef.current) {
        map.removeLayer(circleRef.current)
        circleRef.current = null
      }
      if (!tinhaPin.current) map.setView(ll, 15)
      else map.panTo(ll)
    }

    tinhaPin.current = true
    window.setTimeout(() => map.invalidateSize({ animate: false }), 60)
  }, [lat, lng, raioKm])

  return (
    <div className={`ponto-map-preview ${className}`.trim()}>
      <div
        ref={mapEl}
        className="ponto-map-preview__map"
        style={{ height }}
        role="img"
        aria-label="Mapa da origem"
      />
      {onPick ? (
        <p className="ponto-map-preview__hint">
          Clique no mapa ou arraste o pin para ajustar a localização.
        </p>
      ) : null}
    </div>
  )
}
