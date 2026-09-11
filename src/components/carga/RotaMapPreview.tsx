import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatCurrency } from '../../lib/businessRules'
import { eixosDoVeiculo, estimarCustosRota, type PreferenciaRota } from '../../lib/anttFrete'
import { geocodificarConsulta } from '../../lib/geocodeEndereco'
import { EarthGlobe } from '../ui/EarthGlobe'
import {
  calcularPedagioNaRota,
  rotaOsrmComGeometria,
} from '../../lib/anttPedagioAberto'
import '../../styles/earth-globe.css'

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
  /**
   * Se false, o OSRM só roda quando `calcularId` aumenta
   * (botão "Calcular trajeto").
   */
  autoCalcular?: boolean
  /** Incrementar para disparar o cálculo (quando autoCalcular=false). */
  calcularId?: number
  /** Incrementar ao clicar em Calcular para mergulhar o globo no mapa. */
  entrarId?: number
  /** Se true, mostra km/tempo (e custos) num resumo abaixo do mapa, em vez do cartão flutuante. */
  resumoAbaixo?: boolean
  /** Mesma preferência da calculadora (QualP / Rotas Brasil). */
  preferencia?: PreferenciaRota
  /** Clique no mapa para origem (A) ou destino (B). */
  pickMode?: 'A' | 'B' | null
  onPickModeChange?: (mode: 'A' | 'B' | null) => void
  onPickPonto?: (ponto: 'A' | 'B', lat: number, lng: number) => void
  /** Esconde o cartão flutuante de km/custo (quando o resultado já está ao lado). */
  esconderCartao?: boolean
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

function escHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )
}

function pinTeardrop(letra: string, fill: string, size = 34) {
  const h = Math.round(size * 1.28)
  const letraEsc = escHtml(letra)
  return L.divIcon({
    className: 'rota-map-pin leaflet-div-icon--clean',
    html: `<div class="rota-map-pin__wrap" style="width:${size}px;height:${h}px">
      <svg viewBox="0 0 32 42" width="${size}" height="${h}" aria-hidden="true">
        <path d="M16 2C8.8 2 3 8 3 15.6c0 9.8 13 23.6 13 23.6s13-13.8 13-23.6C29 8 23.2 2 16 2z"
          fill="${fill}" stroke="#fff" stroke-width="2"/>
        <circle cx="16" cy="15.4" r="7.2" fill="#fff"/>
        <text x="16" y="19.4" text-anchor="middle" font-size="10.5" font-weight="800"
          font-family="system-ui,sans-serif" fill="${fill}">${letraEsc}</text>
      </svg>
    </div>`,
    iconSize: [size, h],
    iconAnchor: [size / 2, h - 2],
    popupAnchor: [0, -h + 8],
  })
}

function origemIcon() {
  return pinTeardrop('A', '#15803d', 36)
}

function destinoIcon() {
  return pinTeardrop('B', '#dc2626', 36)
}

function viaIcon(n: number) {
  return pinTeardrop(String(n), '#2563eb', 28)
}

function baseODestinoIcon() {
  return pinTeardrop('AB', '#0f766e', 36)
}

function nomeCurtoPraca(nome: string) {
  const limpo = nome.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
  return limpo.length > 22 ? `${limpo.slice(0, 20)}…` : limpo || 'Pedágio'
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function kmAtePontoNaRota(
  p: { lat: number; lng: number },
  line: Array<{ lat: number; lng: number }>,
): number {
  if (line.length < 2) return 0
  let melhor = { dist: Infinity, km: 0 }
  let acc = 0
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]
    const b = line[i + 1]
    const seg = haversineKm(a, b)
    const dLat = b.lat - a.lat
    const dLng = b.lng - a.lng
    const len2 = dLat * dLat + dLng * dLng
    const t =
      len2 === 0
        ? 0
        : Math.max(0, Math.min(1, ((p.lat - a.lat) * dLat + (p.lng - a.lng) * dLng) / len2))
    const proj = { lat: a.lat + t * dLat, lng: a.lng + t * dLng }
    const d = haversineKm(p, proj)
    const km = acc + seg * t
    if (d < melhor.dist) melhor = { dist: d, km }
    acc += seg
  }
  return melhor.km
}

function pedagioIcon(opts: {
  nome: string
  valorLabel: string
  extra?: string
  freeFlow?: boolean
  ordem?: number
}) {
  const nome = escHtml(nomeCurtoPraca(opts.nome))
  const extra = opts.extra ? escHtml(opts.extra) : ''
  const badge = opts.freeFlow ? '<i>Free Flow</i>' : ''
  const ordem = opts.ordem ? `<b>${opts.ordem}ª</b>` : ''
  return L.divIcon({
    className: 'rota-map-pedagio leaflet-div-icon--clean',
    html: `<div class="rota-map-pedagio__wrap">
      <span class="rota-map-pedagio__pin" aria-hidden="true">
        <svg viewBox="0 0 28 28" width="28" height="28">
          <rect x="2" y="8" width="24" height="16" rx="2" fill="#ea580c" stroke="#fff" stroke-width="2"/>
          <path d="M6 8V6a8 8 0 0 1 16 0v2" fill="none" stroke="#fff" stroke-width="2"/>
          <text x="14" y="20" text-anchor="middle" font-size="9" font-weight="800"
            font-family="system-ui,sans-serif" fill="#fff">P</text>
        </svg>
      </span>
      <span class="rota-map-pedagio__card">
        ${ordem}<em>${nome}</em>
        <strong>${escHtml(opts.valorLabel)}</strong>
        ${extra ? `<small>${extra}</small>` : ''}
        ${badge}
      </span>
    </div>`,
    iconSize: [160, 72],
    iconAnchor: [20, 68],
    popupAnchor: [60, -58],
  })
}

function popupPraca(opts: {
  nome: string
  valor: number
  valorCarro?: number
  eixos: number
  tipo?: string
  rodovia?: string
  uf?: string
  concessionaria?: string
  freeFlow?: boolean
  fonte?: string
  ordem?: number
  totalPracas?: number
  kmAte?: number
  minAte?: number
  lat: number
  lng: number
}) {
  const porEixo = opts.eixos > 0 ? opts.valor / opts.eixos : opts.valor
  const waze = `https://www.waze.com/ul?ll=${opts.lat},${opts.lng}&navigate=yes`
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${opts.lat},${opts.lng}`
  const ordemTxt =
    opts.ordem && opts.totalPracas
      ? `${opts.ordem}ª de ${opts.totalPracas} praças`
      : opts.ordem
        ? `${opts.ordem}ª praça`
        : ''
  const linhas = [
    `<p class="rota-map-popup__tit">${escHtml(opts.nome)}</p>`,
    ordemTxt ? `<p><b>Ordem</b> ${escHtml(ordemTxt)}</p>` : '',
    opts.kmAte != null
      ? `<p><b>Até a praça</b> ${escHtml(formatKm(opts.kmAte))}${
          opts.minAte != null ? ` · ${escHtml(formatDur(opts.minAte))}` : ''
        }</p>`
      : '',
    opts.rodovia || opts.uf
      ? `<p><b>Rodovia</b> ${escHtml([opts.rodovia, opts.uf].filter(Boolean).join(' · '))}</p>`
      : '',
    opts.concessionaria
      ? `<p><b>Concessionária</b> ${escHtml(opts.concessionaria)}</p>`
      : '',
    opts.valorCarro != null
      ? `<p><b>Carro (cat. 1)</b> ${escHtml(formatCurrency(opts.valorCarro))}</p>`
      : '',
    `<p><b>Seu veículo</b> ${escHtml(formatCurrency(opts.valor))} · ${opts.eixos} eixo${opts.eixos === 1 ? '' : 's'}</p>`,
    `<p><b>Por eixo</b> ${escHtml(formatCurrency(porEixo))}</p>`,
    opts.tipo ? `<p><b>Tipo</b> ${escHtml(opts.tipo)}</p>` : '',
    opts.fonte ? `<p><b>Fonte</b> ${escHtml(opts.fonte)}</p>` : '',
    opts.freeFlow ? `<p class="rota-map-popup__ff">Free Flow</p>` : '',
    `<p class="rota-map-popup__nav">
      <a href="${waze}" target="_blank" rel="noopener noreferrer">Waze</a>
      <a href="${maps}" target="_blank" rel="noopener noreferrer">Google Maps</a>
    </p>`,
  ]
  return `<div class="rota-map-popup">${linhas.filter(Boolean).join('')}</div>`
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
  autoCalcular = true,
  calcularId = 0,
  entrarId = 0,
  resumoAbaixo = false,
  preferencia = 'eficiente',
  pickMode = null,
  onPickModeChange,
  onPickPonto,
  esconderCartao = false,
}: Props) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const reqId = useRef(0)
  const onRotaRef = useRef(onRotaCalculada)
  onRotaRef.current = onRotaCalculada
  const pickModeRef = useRef(pickMode)
  pickModeRef.current = pickMode
  const onPickPontoRef = useRef(onPickPonto)
  onPickPontoRef.current = onPickPonto

  const consumoRef = useRef(consumoKmL)
  const precoRef = useRef(precoDiesel)
  consumoRef.current = consumoKmL
  precoRef.current = precoDiesel

  const lastManualId = useRef(0)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'erro' | 'circular'>('idle')
  const [mergulhoId, setMergulhoId] = useState(0)
  const [entradaFim, setEntradaFim] = useState(false)
  const [globeSaindo, setGlobeSaindo] = useState(false)
  const [globeVisivel, setGlobeVisivel] = useState(true)
  const showGlobe = globeVisivel
  const [globeReady, setGlobeReady] = useState(false)
  const [msg, setMsg] = useState(
    autoCalcular
      ? 'Informe origem e destino para ver o trajeto'
      : 'Adicione as cidades e clique em Calcular trajeto',
  )
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
      minZoom: 3,
      zoomControl: true,
      attributionControl: false,
      worldCopyJump: false,
      maxBounds: [
        [-85, -180],
        [85, 180],
      ],
      maxBoundsViscosity: 1,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Tiles © Esri',
      },
    ).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    map.on('click', (e: L.LeafletMouseEvent) => {
      const modo = pickModeRef.current
      if (!modo || !onPickPontoRef.current) return
      onPickPontoRef.current(modo, e.latlng.lat, e.latlng.lng)
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
      layerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    const o = origem.trim()
    const d = destino.trim()
    const msgIdle = autoCalcular
      ? 'Informe origem e destino para ver o trajeto'
      : 'Adicione as cidades e clique em Calcular trajeto'

    if (!autoCalcular && calcularId < 1) {
      lastManualId.current = 0
      reqId.current += 1
      layer.clearLayers()
      setStatus('idle')
      setMeta(null)
      setMsg(msgIdle)
      return
    }
    if (!autoCalcular && calcularId === lastManualId.current) {
      return
    }
    if (!autoCalcular) lastManualId.current = calcularId

    if (o.length < 5 || d.length < 5) {
      reqId.current += 1
      layer.clearLayers()
      setStatus('idle')
      setMeta(null)
      setMsg(msgIdle)
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
            icon: baseODestinoIcon(),
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
          preferencia,
          evitarPedagios: preferencia === 'evitar_pedagio',
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
            const pedRes = await calcularPedagioNaRota(rota.polyline, eixos, {
              distanciaKm: rota.distanciaKm,
              duracaoMin: rota.duracaoMin,
            })
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
        L.polyline(latlngs, {
          color: '#fff',
          weight: 10,
          opacity: 0.95,
          lineJoin: 'round',
          lineCap: 'round',
        }).addTo(layer)
        const line = L.polyline(latlngs, {
          color: '#1d4ed8',
          weight: 5.5,
          opacity: 1,
          lineJoin: 'round',
          lineCap: 'round',
        }).addTo(layer)

        L.marker([oCoords.lat, oCoords.lng], {
          icon: origemIcon(),
          title: `Origem: ${o}`,
        })
          .bindPopup(`<div class="rota-map-popup"><p class="rota-map-popup__tit">Origem</p><p>${escHtml(o)}</p></div>`, {
            className: 'rota-map-popup-wrap',
            maxWidth: 280,
          })
          .addTo(layer)

        viaCoords.forEach((c, idx) => {
          const viaNome = viasNorm[idx]?.endereco || `Ponto ${idx + 1}`
          L.marker([c.lat, c.lng], {
            icon: viaIcon(idx + 1),
            title: `Passagem ${idx + 1}: ${viaNome}`,
          })
            .bindPopup(
              `<div class="rota-map-popup"><p class="rota-map-popup__tit">Passagem ${idx + 1}</p><p>${escHtml(viaNome)}</p></div>`,
              { className: 'rota-map-popup-wrap', maxWidth: 280 },
            )
            .addTo(layer)
        })

        L.marker([dCoords.lat, dCoords.lng], {
          icon: destinoIcon(),
          title: `Destino: ${d}`,
        })
          .bindPopup(`<div class="rota-map-popup"><p class="rota-map-popup__tit">Destino</p><p>${escHtml(d)}</p></div>`, {
            className: 'rota-map-popup-wrap',
            maxWidth: 280,
          })
          .addTo(layer)

        const pracasMapa = [...ped.pracas]
          .filter((p) => p.lat != null && p.lng != null)
          .sort((a, b) => (a.ordem ?? a.km_ate ?? 0) - (b.ordem ?? b.km_ate ?? 0))
        const totalPracas = pracasMapa.length

        for (const p of pracasMapa) {
          const lat = p.lat!
          const lng = p.lng!
          const valorLabel = formatCurrency(p.valor)
          const kmAte =
            p.km_ate != null
              ? p.km_ate
              : kmAtePontoNaRota({ lat, lng }, rota.polyline)
          const minAte =
            p.min_ate != null
              ? p.min_ate
              : rota.distanciaKm > 0
                ? Math.max(1, Math.round((kmAte / rota.distanciaKm) * rota.duracaoMin))
                : undefined
          const ordem = p.ordem ?? 0
          const extraParts = [
            p.rodovia && p.uf ? `${p.rodovia}/${p.uf}` : p.rodovia || p.uf || '',
            kmAte != null ? `em ${formatKm(kmAte)}` : '',
          ].filter(Boolean)
          L.marker([lat, lng], {
            icon: pedagioIcon({
              nome: p.nome,
              valorLabel,
              extra: extraParts.join(' · ') || undefined,
              freeFlow: Boolean(p.free_flow),
              ordem: ordem || undefined,
            }),
            title: `${ordem ? `${ordem}ª · ` : ''}${p.nome}: ${valorLabel}`,
            zIndexOffset: 200,
          })
            .bindPopup(
              popupPraca({
                nome: p.nome,
                valor: p.valor,
                valorCarro: p.valor_carro,
                eixos,
                tipo: p.tipo,
                rodovia: p.rodovia,
                uf: p.uf,
                concessionaria: p.concessionaria,
                freeFlow: Boolean(p.free_flow),
                fonte: p.fonte,
                ordem: ordem || undefined,
                totalPracas,
                kmAte,
                minAte,
                lat,
                lng,
              }),
              { className: 'rota-map-popup-wrap', maxWidth: 300 },
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
  }, [
    origem,
    destino,
    viasKey,
    coordsKey,
    veiculo,
    eixosProp,
    mostrarCustos,
    autoCalcular,
    calcularId,
    preferencia,
  ])

  useEffect(() => {
    if (status === 'idle' && entrarId < 1) {
      setMergulhoId(0)
      setEntradaFim(false)
      setGlobeSaindo(false)
      setGlobeVisivel(true)
    }
  }, [status, entrarId])

  useEffect(() => {
    if (entrarId < 1) return
    setGlobeVisivel(true)
    setGlobeSaindo(false)
    setEntradaFim(false)
    setMergulhoId(entrarId)
  }, [entrarId])

  useEffect(() => {
    if (status === 'loading' && globeVisivel && mergulhoId < 1) {
      setEntradaFim(false)
      setMergulhoId((n) => n + 1)
    }
    if (status === 'erro') setEntradaFim(true)
  }, [status, globeVisivel, mergulhoId])

  useEffect(() => {
    if (mergulhoId < 1 || entradaFim) return
    const t = window.setTimeout(() => setEntradaFim(true), 4500)
    return () => window.clearTimeout(t)
  }, [mergulhoId, entradaFim])

  useEffect(() => {
    const mapaPronto = status === 'ok' || status === 'circular' || status === 'erro'
    if (!mapaPronto || !entradaFim || !globeVisivel) return
    setGlobeSaindo(true)
    const t = window.setTimeout(() => {
      setGlobeVisivel(false)
      setGlobeReady(false)
    }, 680)
    return () => window.clearTimeout(t)
  }, [status, entradaFim, globeVisivel])

  useEffect(() => {
    if (!showGlobe) setGlobeReady(false)
  }, [showGlobe])

  return (
    <div className="h-full min-h-[360px] w-full">
      <div
        className={`rota-map-preview relative z-0 overflow-hidden rounded-lg border border-ink/15 bg-[#02040a] ${showGlobe && globeReady && !globeSaindo ? 'rota-map-preview--globe' : ''} ${pickMode ? 'is-picking' : ''} ${className}`}
      >
        <div ref={mapEl} className="rota-map-preview__map" />
        {showGlobe ? (
          <EarthGlobe
            pickMode={pickMode}
            pontoA={coordsOk(origemCoords) ? origemCoords : null}
            pontoB={coordsOk(destinoCoords) ? destinoCoords : null}
            entrarId={mergulhoId}
            saindo={globeSaindo}
            onEntradaFim={() => setEntradaFim(true)}
            onReady={() => setGlobeReady(true)}
            onError={() => {
              setGlobeReady(false)
              setEntradaFim(true)
            }}
            onPick={(lat, lng) => {
              const modo = pickModeRef.current
              if (!modo) return
              onPickPontoRef.current?.(modo, lat, lng)
            }}
          />
        ) : null}
        {onPickPonto ? (
          <div className="rota-map-pick" data-pdf-ignore>
            <button
              type="button"
              className={pickMode === 'A' ? 'is-on' : ''}
              title="Marcar origem (ponto A) no mapa"
              onClick={() => onPickModeChange?.(pickMode === 'A' ? null : 'A')}
            >
              Ponto A
            </button>
            <button
              type="button"
              className={pickMode === 'B' ? 'is-on' : ''}
              title="Marcar destino (ponto B) no mapa"
              onClick={() => onPickModeChange?.(pickMode === 'B' ? null : 'B')}
            >
              Ponto B
            </button>
            {pickMode ? (
              <p className="rota-map-pick__hint">Clique no mapa para marcar o ponto {pickMode}</p>
            ) : null}
          </div>
        ) : null}
        {status === 'erro' ? (
          <div
            data-pdf-ignore
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/75 px-3 text-center"
          >
            <p className="text-xs font-semibold text-red-700">{msg}</p>
          </div>
        ) : null}
        {status === 'loading' || (mergulhoId > 0 && globeVisivel && !globeSaindo && status === 'idle') ? (
          <div
            data-pdf-ignore
            className="pointer-events-none absolute bottom-3 left-2 right-2 z-10 rounded-lg bg-black/45 px-3 py-2 text-center text-[11px] font-semibold text-white shadow-md"
          >
            {status === 'loading'
              ? mostrarCustos
                ? 'Calculando trajeto e pedágios…'
                : 'Calculando trajeto…'
              : 'Entrando no mapa…'}
          </div>
        ) : null}
        {status === 'idle' && !autoCalcular && !pickMode && mergulhoId < 1 ? (
          <div
            data-pdf-ignore
            className="pointer-events-none absolute left-2 right-2 top-2 z-10 rounded-lg bg-black/50 px-3 py-2 text-center text-[11px] font-semibold text-white shadow-md"
          >
            {msg}
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
        {!resumoAbaixo && !showGlobe && !esconderCartao && (
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
        )}
      </div>
      {resumoAbaixo && (
        <div className="mt-2 flex flex-wrap items-stretch gap-2">
          <div className="flex-1 min-w-[120px] rounded-lg border border-ink/15 bg-white px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
              Total km
            </p>
            <p className="text-base font-extrabold tabular-nums text-ink">
              {status === 'ok' && meta ? formatKm(meta.km) : status === 'loading' ? '…' : '—'}
            </p>
          </div>
          <div className="flex-1 min-w-[120px] rounded-lg border border-ink/15 bg-white px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
              Tempo em rota
            </p>
            <p className="text-base font-extrabold tabular-nums text-blue-700">
              {status === 'ok' && meta ? formatDur(meta.dur) : status === 'loading' ? '…' : '—'}
            </p>
          </div>
          {mostrarCustos && (
            <>
              <div className="flex-1 min-w-[140px] rounded-lg border border-ink/15 bg-white px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                  Pedágio
                </p>
                <p className="text-base font-extrabold tabular-nums text-orange-700">
                  {status === 'ok' && meta ? formatCurrency(meta.pedagio) : status === 'loading' ? '…' : '—'}
                  {status === 'ok' && meta && meta.pracas > 0
                    ? ` · ${meta.pracas} praça${meta.pracas === 1 ? '' : 's'}`
                    : ''}
                </p>
              </div>
              <div className="flex-1 min-w-[140px] rounded-lg border border-ink/15 bg-white px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                  Custo total
                </p>
                <p className="text-base font-extrabold tabular-nums text-ink">
                  {status === 'ok' && meta ? formatCurrency(meta.custo) : status === 'loading' ? '…' : '—'}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
