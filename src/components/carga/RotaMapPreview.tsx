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

type RotaCoords = { lat: number; lng: number }

export type RotaWaypointInput =
  | string
  | { endereco: string; lat?: number | null; lng?: number | null }

type Props = {
  origem: string
  destino: string
  /** Coordenadas salvas (evita geocode errado / origem=destino). */
  origemCoords?: RotaCoords | null
  destinoCoords?: RotaCoords | null
  /** Endereços intermediários (pontos de passagem), com coords opcionais. */
  waypoints?: RotaWaypointInput[]
  className?: string
  /** Tipo de veículo da carga — define eixos do pedágio. */
  veiculo?: string
  eixos?: number
  /** Consumo (km/l) para o custo de combustível no mapa. */
  consumoKmL?: number
  /** Preço do diesel (R$/L) para o custo de combustível no mapa. */
  precoDiesel?: number
  /** Chamado quando o trajeto OSRM for calculado (km / duração). */
  onRotaCalculada?: (info: { km: number; duracaoMin: number }) => void
  /** Se false, só o trajeto no mapa (sem pedágio / combustível / ANTT). */
  mostrarCustos?: boolean
}

function normWaypoint(w: RotaWaypointInput): {
  endereco: string
  lat: number | null
  lng: number | null
} {
  if (typeof w === 'string') {
    return { endereco: w.trim(), lat: null, lng: null }
  }
  const lat = w.lat != null && Number.isFinite(Number(w.lat)) ? Number(w.lat) : null
  const lng = w.lng != null && Number.isFinite(Number(w.lng)) ? Number(w.lng) : null
  return { endereco: (w.endereco || '').trim(), lat, lng }
}

function coordsOk(c?: RotaCoords | null): c is RotaCoords {
  return Boolean(c && Number.isFinite(c.lat) && Number.isFinite(c.lng))
}

function mesmaPosicao(a: RotaCoords, b: RotaCoords, tol = 0.0002): boolean {
  return Math.abs(a.lat - b.lat) < tol && Math.abs(a.lng - b.lng) < tol
}

async function resolverPonto(
  endereco: string,
  hint?: RotaCoords | null,
): Promise<{ ok: true; coords: RotaCoords } | { ok: false; erro: string }> {
  if (coordsOk(hint)) return { ok: true, coords: hint }
  const g = await geocodificarConsulta(endereco)
  if (!g.ok) return { ok: false, erro: g.erro }
  return { ok: true, coords: g.coords }
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
  origemCoords = null,
  destinoCoords = null,
  waypoints = [],
  className = '',
  veiculo,
  eixos: eixosProp,
  consumoKmL,
  precoDiesel,
  onRotaCalculada,
  mostrarCustos = true,
}: Props) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const reqId = useRef(0)
  const onRotaRef = useRef(onRotaCalculada)
  onRotaRef.current = onRotaCalculada

  const consumoRef = useRef(consumoKmL)
  const precoRef = useRef(precoDiesel)
  consumoRef.current = consumoKmL
  precoRef.current = precoDiesel

  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'erro' | 'circular'>('idle')
  const [msg, setMsg] = useState('Informe origem e destino para ver o trajeto')
  const [meta, setMeta] = useState<MetaRota | null>(null)

  const viasNorm = waypoints
    .map(normWaypoint)
    .filter(
      (w) =>
        w.endereco.length >= 3 ||
        (w.lat != null && w.lng != null),
    )
  const viasKey = viasNorm
    .map((w) => `${w.endereco}|${w.lat ?? ''}|${w.lng ?? ''}`)
    .join('\u0001')
  const coordsKey = `${origemCoords?.lat ?? ''},${origemCoords?.lng ?? ''}|${destinoCoords?.lat ?? ''},${destinoCoords?.lng ?? ''}`

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const el = mapEl.current
    const map = L.map(el, {
      center: [-14.2, -51.9],
      zoom: 4,
      zoomControl: true,
      attributionControl: false,
    })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      crossOrigin: true,
      attribution: '© OpenStreetMap © CARTO',
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
    setMsg(mostrarCustos ? 'Calculando trajeto e pedágios…' : 'Calculando trajeto…')
    const id = ++reqId.current
    const eixos =
      eixosProp && eixosProp > 0
        ? Math.round(eixosProp)
        : eixosDoVeiculo(veiculo || 'Carreta')

    const timer = window.setTimeout(() => {
      void (async () => {
        const geoResults = await Promise.all([
          resolverPonto(o, origemCoords),
          ...viasNorm.map((w) =>
            resolverPonto(
              w.endereco,
              w.lat != null && w.lng != null ? { lat: w.lat, lng: w.lng } : null,
            ),
          ),
          resolverPonto(d, destinoCoords),
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

        const coordsList = geoResults.map((g) => {
          if (!g.ok) throw new Error('geo')
          return g.coords
        })
        const oCoords = coordsList[0]
        const dCoords = coordsList[coordsList.length - 1]
        const viaCoords = coordsList.slice(1, -1)
        const retornoBase = mesmaPosicao(oCoords, dCoords)

        // Rota circular (origem = destino) sem paradas: mostra o ponto, sem erro vermelho
        if (retornoBase && viaCoords.length === 0) {
          layer.clearLayers()
          L.marker([oCoords.lat, oCoords.lng], {
            icon: pinIcon('O/D', '#0f766e'),
            title: 'Origem e destino (retorno à base)',
          }).addTo(layer)
          map.setView([oCoords.lat, oCoords.lng], 12)
          window.setTimeout(() => map.invalidateSize(), 60)
          setMeta(null)
          setStatus('circular')
          setMsg(
            'Rota circular (origem = destino). Adicione os pontos de passagem para traçar o trajeto de ida e volta.',
          )
          return
        }

        const rota = await rotaOsrmComGeometria(oCoords, dCoords, {
          waypoints: viaCoords,
          eixos,
        })
        if (id !== reqId.current) return
        if (!rota?.polyline.length) {
          layer.clearLayers()
          setStatus('erro')
          setMeta(null)
          setMsg(
            'Não foi possível traçar a rota. Verifique os endereços e os pontos de passagem.',
          )
          return
        }

        let ped = {
          pedagio: 0,
          combustivel: 0,
          custo: 0,
          pracas: [] as Awaited<ReturnType<typeof calcularPedagioNaRota>>['pracas'],
        }
        if (mostrarCustos) {
          try {
            const pedRes = await calcularPedagioNaRota(rota.polyline, eixos)
            const custos = estimarCustosRota(rota.distanciaKm, eixos, rota.duracaoMin, {
              consumoKmL: consumoRef.current,
              precoDiesel: precoRef.current,
            })
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
            const custos = estimarCustosRota(rota.distanciaKm, eixos, rota.duracaoMin, {
              consumoKmL: consumoRef.current,
              precoDiesel: precoRef.current,
            })
            ped = {
              pedagio: custos.pedagio,
              combustivel: custos.combustivel,
              custo: custos.custo_total,
              pracas: [],
            }
          }
          if (id !== reqId.current) return
        }

        layer.clearLayers()
        const latlngs = rota.polyline.map((p) => [p.lat, p.lng] as L.LatLngExpression)
        const line = L.polyline(latlngs, {
          color: '#2563eb',
          weight: 5,
          opacity: 0.9,
        }).addTo(layer)

        L.marker([oCoords.lat, oCoords.lng], {
          icon: pinIcon('O', '#16a34a'),
          title: 'Origem',
        }).addTo(layer)

        viaCoords.forEach((c, idx) => {
          L.marker([c.lat, c.lng], {
            icon: pinIcon(String(idx + 1), '#2563eb'),
            title: `Ponto de passagem ${idx + 1}`,
          }).addTo(layer)
        })

        L.marker([dCoords.lat, dCoords.lng], {
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
        onRotaRef.current?.({
          km: rota.distanciaKm,
          duracaoMin: rota.duracaoMin,
        })
      })()
    }, 550)

    return () => window.clearTimeout(timer)
  }, [origem, destino, viasKey, coordsKey, veiculo, eixosProp, mostrarCustos])

  return (
    <div
      className={`rota-map-preview relative z-0 isolate overflow-hidden rounded-lg border border-ink/15 bg-[#f4f6f8] ${className}`}
    >
      <div ref={mapEl} className="absolute inset-0 z-0" />
      {status === 'loading' || status === 'erro' || status === 'idle' ? (
        <div
          data-pdf-ignore
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/75 px-3 text-center"
        >
          <p
            className={`text-xs font-semibold ${
              status === 'erro' ? 'text-red-700' : 'text-ink-muted'
            }`}
          >
            {status === 'loading' ? (mostrarCustos ? 'Calculando trajeto e pedágios…' : 'Calculando trajeto…') : msg}
          </p>
        </div>
      ) : null}
      {status === 'circular' ? (
        <div
          data-pdf-ignore
          className="absolute bottom-2 left-2 right-2 z-10 rounded-lg bg-teal-50/95 px-2.5 py-2 text-[11px] font-semibold text-teal-900 shadow-md ring-1 ring-teal-200"
        >
          {msg}
        </div>
      ) : null}
      <div
        data-pdf-ignore
        className="pointer-events-none absolute bottom-2 right-2 z-20 min-w-[132px] max-w-[min(100%,220px)] rounded-lg bg-white/95 px-2.5 py-2 text-[11px] text-ink shadow-md ring-1 ring-ink/10"
      >
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Total km</p>
        <p className="text-sm font-extrabold tabular-nums text-ink">
          {status === 'ok' && meta ? formatKm(meta.km) : status === 'loading' ? '…' : '—'}
        </p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-ink-muted">
          Tempo em rota
        </p>
        <p className="text-sm font-extrabold tabular-nums text-blue-700">
          {status === 'ok' && meta ? formatDur(meta.dur) : status === 'loading' ? '…' : '—'}
        </p>
        {mostrarCustos && status === 'ok' && meta ? (
          <>
            <p className="mt-1.5 font-bold text-orange-700 tabular-nums">
              {formatCurrency(meta.pedagio)} Pedágio
              {meta.pracas > 0 ? ` · ${meta.pracas} praça${meta.pracas === 1 ? '' : 's'}` : ''}
            </p>
            <p className="font-semibold text-ink/80 tabular-nums">
              {formatCurrency(meta.combustivel)} Comb.
            </p>
            <p className="mt-1 border-t border-ink/10 pt-1 font-extrabold tabular-nums">
              {formatCurrency(meta.custo)} · {meta.eixos} eixos
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}
