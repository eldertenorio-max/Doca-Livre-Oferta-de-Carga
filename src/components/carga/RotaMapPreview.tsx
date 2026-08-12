import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatCurrency } from '../../lib/businessRules'
import { eixosDoVeiculo, estimarCustosRota } from '../../lib/anttFrete'
import { geocodificarConsulta } from '../../lib/geocodeEndereco'
import {
  calcularPedagioNaRota,
  rotaOsrmComGeometria,
} from '../../lib/anttPedagioAberto'

type Props = {
  origem: string
  destino: string
  /** Endereços intermediários (pontos de passagem). */
  waypoints?: string[]
  className?: string
  /** Tipo de veículo da carga — define eixos do pedágio. */
  veiculo?: string
  eixos?: number
}

function pinIcon(label: string, color: string) {
  return L.divIcon({
    className: 'rota-map-pin leaflet-div-icon--clean',
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

function pedagioIcon(valorLabel: string) {
  return L.divIcon({
    className: 'rota-map-pedagio leaflet-div-icon--clean',
    html: `<div style="
      display:flex;flex-direction:column;align-items:center;gap:2px;
      transform:translateY(-4px);
    ">
      <span style="
        display:inline-flex;align-items:center;justify-content:center;
        width:28px;height:28px;border-radius:50%;
        background:#ea580c;color:#fff;font:800 12px/1 system-ui,sans-serif;
        border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);
      ">P</span>
      <span style="
        white-space:nowrap;padding:2px 6px;border-radius:999px;
        background:#fff;color:#9a3412;font:800 10px/1.2 system-ui,sans-serif;
        border:1px solid #fdba74;box-shadow:0 1px 3px rgba(0,0,0,.2);
      ">${valorLabel}</span>
    </div>`,
    iconSize: [72, 48],
    iconAnchor: [36, 40],
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

type MetaRota = {
  km: number
  dur: number
  pedagio: number
  combustivel: number
  custo: number
  eixos: number
  pracas: number
}

export function RotaMapPreview({
  origem,
  destino,
  waypoints = [],
  className = '',
  veiculo,
  eixos: eixosProp,
}: Props) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const reqId = useRef(0)

  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'erro'>('idle')
  const [msg, setMsg] = useState('Informe origem e destino para ver o trajeto')
  const [meta, setMeta] = useState<MetaRota | null>(null)

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
    const vias = waypoints.map((w) => w.trim()).filter((w) => w.length >= 3)
    if (o.length < 5 || d.length < 5) {
      reqId.current += 1
      layer.clearLayers()
      setStatus('idle')
      setMeta(null)
      setMsg('Informe origem e destino para ver o trajeto')
      return
    }

    setStatus('loading')
    setMsg('Calculando trajeto e pedágios…')
    const id = ++reqId.current
    const eixos =
      eixosProp && eixosProp > 0
        ? Math.round(eixosProp)
        : eixosDoVeiculo(veiculo || 'Carreta')

    const timer = window.setTimeout(() => {
      void (async () => {
        const geoResults = await Promise.all([
          geocodificarConsulta(o),
          ...vias.map((w) => geocodificarConsulta(w)),
          geocodificarConsulta(d),
        ])
        if (id !== reqId.current) return

        for (let i = 0; i < geoResults.length; i++) {
          const g = geoResults[i]
          if (g.ok) continue
          layer.clearLayers()
          setStatus('erro')
          setMeta(null)
          const label =
            i === 0
              ? 'Origem'
              : i === geoResults.length - 1
                ? 'Destino'
                : `Ponto ${i}`
          setMsg(`${label}: ${g.erro}`)
          return
        }

        const coordsOk = geoResults.map((g) => {
          if (!g.ok) throw new Error('geo')
          return g.coords
        })
        const origemCoords = coordsOk[0]
        const destinoCoords = coordsOk[coordsOk.length - 1]
        const viaCoords = coordsOk.slice(1, -1)

        const rota = await rotaOsrmComGeometria(origemCoords, destinoCoords, {
          waypoints: viaCoords,
        })
        if (id !== reqId.current) return
        if (!rota?.polyline.length) {
          layer.clearLayers()
          setStatus('erro')
          setMeta(null)
          setMsg('Não foi possível traçar a rota')
          return
        }

        let ped = {
          pedagio: 0,
          combustivel: 0,
          custo: 0,
          pracas: [] as Awaited<ReturnType<typeof calcularPedagioNaRota>>['pracas'],
        }
        try {
          const pedRes = await calcularPedagioNaRota(rota.polyline, eixos)
          const custos = estimarCustosRota(rota.distanciaKm, eixos, rota.duracaoMin)
          const pedagio =
            pedRes.pracas.length > 0 ? pedRes.pedagio : custos.pedagio
          const combustivel = custos.combustivel
          ped = {
            pedagio,
            combustivel,
            custo: Math.round((pedagio + combustivel) * 100) / 100,
            pracas: pedRes.pracas,
          }
        } catch {
          const custos = estimarCustosRota(rota.distanciaKm, eixos, rota.duracaoMin)
          ped = {
            pedagio: custos.pedagio,
            combustivel: custos.combustivel,
            custo: custos.custo_total,
            pracas: [],
          }
        }
        if (id !== reqId.current) return

        layer.clearLayers()
        const latlngs = rota.polyline.map((p) => [p.lat, p.lng] as L.LatLngExpression)
        const line = L.polyline(latlngs, {
          color: '#2563eb',
          weight: 5,
          opacity: 0.9,
        }).addTo(layer)

        L.marker([origemCoords.lat, origemCoords.lng], {
          icon: pinIcon('O', '#16a34a'),
          title: 'Origem',
        }).addTo(layer)

        viaCoords.forEach((c, idx) => {
          L.marker([c.lat, c.lng], {
            icon: pinIcon(String(idx + 1), '#2563eb'),
            title: `Ponto de passagem ${idx + 1}`,
          }).addTo(layer)
        })

        L.marker([destinoCoords.lat, destinoCoords.lng], {
          icon: pinIcon('D', '#dc2626'),
          title: 'Destino',
        }).addTo(layer)

        for (const p of ped.pracas) {
          if (p.lat == null || p.lng == null) continue
          const valorLabel = formatCurrency(p.valor)
          L.marker([p.lat, p.lng], {
            icon: pedagioIcon(valorLabel),
            title: `${p.nome}: ${valorLabel}`,
            zIndexOffset: 200,
          })
            .bindPopup(
              `<strong>${p.nome}</strong><br/>Pedágio: <b>${valorLabel}</b>${
                p.tipo ? `<br/><span style="color:#64748b">${p.tipo}</span>` : ''
              }`,
            )
            .addTo(layer)
        }

        map.fitBounds(line.getBounds(), { padding: [36, 36], maxZoom: 12 })
        window.setTimeout(() => map.invalidateSize(), 60)

        setMeta({
          km: rota.distanciaKm,
          dur: rota.duracaoMin,
          pedagio: ped.pedagio,
          combustivel: ped.combustivel,
          custo: ped.custo,
          eixos,
          pracas: ped.pracas.length,
        })
        setStatus('ok')
        setMsg('')
      })()
    }, 550)

    return () => window.clearTimeout(timer)
  }, [origem, destino, waypoints.join('\u0001'), veiculo, eixosProp])

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
            {status === 'loading' ? 'Calculando trajeto e pedágios…' : msg}
          </p>
        </div>
      )}
      {status === 'ok' && meta && (
        <div className="absolute bottom-2 left-2 z-10 max-w-[min(100%,220px)] rounded-lg bg-white/95 px-2.5 py-2 text-[11px] text-ink shadow-md ring-1 ring-ink/10">
          <p className="text-sm font-extrabold text-blue-700">{formatDur(meta.dur)}</p>
          <p className="font-semibold tabular-nums">{formatKm(meta.km)}</p>
          <p className="mt-0.5 font-bold text-orange-700 tabular-nums">
            {formatCurrency(meta.pedagio)} Pedágio
            {meta.pracas > 0 ? ` · ${meta.pracas} praça${meta.pracas === 1 ? '' : 's'}` : ''}
          </p>
          <p className="font-semibold text-ink/80 tabular-nums">
            {formatCurrency(meta.combustivel)} Comb.
          </p>
          <p className="mt-1 border-t border-ink/10 pt-1 font-extrabold tabular-nums">
            {formatCurrency(meta.custo)} · {meta.eixos} eixos
          </p>
        </div>
      )}
    </div>
  )
}
