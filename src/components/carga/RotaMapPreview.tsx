import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { geocodificarConsulta } from '../../lib/geocodeEndereco'
import { rotaOsrmComGeometria } from '../../lib/anttPedagioAberto'

type Props = {
  origem: string
  destino: string
  className?: string
}

function pinIcon(label: string, color: string) {
  return L.divIcon({
    className: 'rota-map-pin',
    html: `<span style="
      display:inline-flex;align-items:center;justify-content:center;
      width:26px;height:26px;border-radius:50%;
      background:${color};color:#fff;font:800 11px/1 system-ui,sans-serif;
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);
    ">${label}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function formatKm(km: number) {
  return `${km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}

function formatDur(min: number) {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h <= 0) return `${m} min`
  return `${h} h ${m.toString().padStart(2, '0')} min`
}

export function RotaMapPreview({ origem, destino, className = '' }: Props) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const reqId = useRef(0)

  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'erro'>('idle')
  const [msg, setMsg] = useState('Informe origem e destino para ver o trajeto')
  const [meta, setMeta] = useState<{ km: number; dur: number } | null>(null)

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
      maxZoom: 18,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

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
      layerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    const o = origem.trim()
    const d = destino.trim()
    if (o.length < 5 || d.length < 5) {
      reqId.current += 1
      layer.clearLayers()
      setStatus('idle')
      setMeta(null)
      setMsg('Informe origem e destino para ver o trajeto')
      return
    }

    setStatus('loading')
    setMsg('Calculando trajeto…')
    const id = ++reqId.current

    const timer = window.setTimeout(() => {
      void (async () => {
        const [geoO, geoD] = await Promise.all([
          geocodificarConsulta(o),
          geocodificarConsulta(d),
        ])
        if (id !== reqId.current) return
        if (!geoO.ok) {
          layer.clearLayers()
          setStatus('erro')
          setMeta(null)
          setMsg(`Origem: ${geoO.erro}`)
          return
        }
        if (!geoD.ok) {
          layer.clearLayers()
          setStatus('erro')
          setMeta(null)
          setMsg(`Destino: ${geoD.erro}`)
          return
        }

        const rota = await rotaOsrmComGeometria(geoO.coords, geoD.coords)
        if (id !== reqId.current) return
        if (!rota?.polyline.length) {
          layer.clearLayers()
          setStatus('erro')
          setMeta(null)
          setMsg('Não foi possível traçar a rota')
          return
        }

        layer.clearLayers()
        const latlngs = rota.polyline.map((p) => [p.lat, p.lng] as L.LatLngExpression)
        const line = L.polyline(latlngs, {
          color: '#111',
          weight: 4,
          opacity: 0.9,
        }).addTo(layer)

        L.marker([geoO.coords.lat, geoO.coords.lng], {
          icon: pinIcon('O', '#16a34a'),
          title: 'Origem',
        }).addTo(layer)

        L.marker([geoD.coords.lat, geoD.coords.lng], {
          icon: pinIcon('D', '#dc2626'),
          title: 'Destino',
        }).addTo(layer)

        map.fitBounds(line.getBounds(), { padding: [28, 28], maxZoom: 12 })
        window.setTimeout(() => map.invalidateSize(), 60)

        setMeta({ km: rota.distanciaKm, dur: rota.duracaoMin })
        setStatus('ok')
        setMsg('')
      })()
    }, 550)

    return () => window.clearTimeout(timer)
  }, [origem, destino])

  return (
    <div
      className={`rota-map-preview relative overflow-hidden rounded-lg border border-ink/15 bg-[#f4f6f8] ${className}`}
    >
      <div ref={mapEl} className="absolute inset-0 z-0" />
      {status !== 'ok' && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/75 px-3 text-center">
          <p
            className={`text-xs font-semibold ${
              status === 'erro' ? 'text-red-700' : 'text-ink-muted'
            }`}
          >
            {status === 'loading' ? 'Calculando trajeto…' : msg}
          </p>
        </div>
      )}
      {status === 'ok' && meta && (
        <div className="absolute bottom-2 left-2 z-10 rounded-md bg-white/95 px-2 py-1 text-[10px] font-bold text-ink shadow-sm ring-1 ring-ink/10">
          {formatKm(meta.km)} · {formatDur(meta.dur)}
        </div>
      )}
    </div>
  )
}
