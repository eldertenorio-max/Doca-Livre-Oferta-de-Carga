import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useData } from '../../context/DataContext'
import { formatCurrency } from '../../lib/businessRules'
import { labelFreteCurto, montarPontosFrota, type PontoFrota } from '../../lib/mapaFrota'
import '../../styles/mapa-frota.css'

function markerHtml(p: PontoFrota): string {
  const frete = labelFreteCurto(p.freteMinimo)
  const status = p.disponivel ? 'ok' : 'off'
  return `
    <div class="frota-pin frota-pin--${status} frota-pin--${p.icone}" title="${p.motoristaNome}">
      <span class="frota-pin__frete">${frete}</span>
      <span class="frota-pin__icon" aria-hidden="true">${p.emoji}</span>
    </div>
  `
}

function makeIcon(p: PontoFrota) {
  return L.divIcon({
    className: 'frota-pin-wrap',
    html: markerHtml(p),
    iconSize: [96, 48],
    iconAnchor: [48, 44],
    popupAnchor: [0, -40],
  })
}

export function MapaFrotaPage() {
  const { motoristas, veiculos, transportadores } = useData()
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'disponiveis' | 'indisponiveis'>('disponiveis')
  const [selecionado, setSelecionado] = useState<string | null>(null)

  const pontos = useMemo(
    () => montarPontosFrota(motoristas, veiculos, transportadores),
    [motoristas, veiculos, transportadores],
  )

  const filtrados = useMemo(() => {
    if (filtro === 'disponiveis') return pontos.filter((p) => p.disponivel)
    if (filtro === 'indisponiveis') return pontos.filter((p) => !p.disponivel)
    return pontos
  }, [pontos, filtro])

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = L.map(mapEl.current, {
      center: [-23.5, -46.6],
      zoom: 6,
      zoomControl: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const t = window.setTimeout(() => map.invalidateSize(), 80)
    return () => {
      window.clearTimeout(t)
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()

    const bounds: L.LatLngExpression[] = []
    for (const p of filtrados) {
      const m = L.marker([p.lat, p.lng], { icon: makeIcon(p) })
      m.bindPopup(
        `<strong>${p.motoristaNome}</strong><br/>
         ${p.transportadorNome}<br/>
         ${p.tipoVeiculo} · ${p.placa}<br/>
         Frete mín.: <strong>${p.freteMinimo > 0 ? formatCurrency(p.freteMinimo) : '—'}</strong><br/>
         <span style="color:${p.disponivel ? '#166534' : '#991b1b'}">${
           p.disponivel ? 'Disponível para carregar' : 'Indisponível'
         }</span>`,
      )
      m.on('click', () => setSelecionado(p.id))
      m.addTo(layer)
      bounds.push([p.lat, p.lng])
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 10)
    } else if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [48, 48], maxZoom: 11 })
    }
  }, [filtrados])

  useEffect(() => {
    if (!selecionado) return
    const p = filtrados.find((x) => x.id === selecionado)
    if (!p || !mapRef.current) return
    mapRef.current.setView([p.lat, p.lng], Math.max(mapRef.current.getZoom(), 9), {
      animate: true,
    })
  }, [selecionado, filtrados])

  const nDisp = pontos.filter((p) => p.disponivel).length
  const nIndisp = pontos.length - nDisp

  return (
    <div className="mapa-frota animate-fade-up">
      <header className="mapa-frota__head">
        <div>
          <h1 className="mapa-frota__title">Mapa da Frota</h1>
          <p className="mapa-frota__sub">
            Motoristas na origem cadastrada · ícone por tipo de veículo · frete mínimo ao lado do
            ponto.
          </p>
        </div>
        <div className="mapa-frota__filtros">
          {(
            [
              ['disponiveis', `Disponíveis (${nDisp})`],
              ['indisponiveis', `Indisponíveis (${nIndisp})`],
              ['todos', `Todos (${pontos.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`mapa-frota__chip${filtro === id ? ' is-active' : ''}`}
              onClick={() => setFiltro(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="mapa-frota__layout">
        <aside className="mapa-frota__lista">
          {filtrados.length === 0 ? (
            <p className="mapa-frota__empty">
              Nenhum ponto para exibir. Cadastre origem (coordenadas) no transportador, vincule
              motorista ao veículo e marque como disponível.
            </p>
          ) : (
            <ul>
              {filtrados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`mapa-frota__item${selecionado === p.id ? ' is-selected' : ''}`}
                    onClick={() => setSelecionado(p.id)}
                  >
                    <span className="mapa-frota__item-ico" aria-hidden>
                      {p.emoji}
                    </span>
                    <span className="mapa-frota__item-body">
                      <strong>{p.motoristaNome}</strong>
                      <span>
                        {p.tipoVeiculo} · {p.placa}
                      </span>
                      <span className="mapa-frota__item-meta">
                        {p.transportadorNome} ·{' '}
                        {p.freteMinimo > 0 ? formatCurrency(p.freteMinimo) : 'sem frete mín.'}
                      </span>
                    </span>
                    <span
                      className={`mapa-frota__dot mapa-frota__dot--${p.disponivel ? 'ok' : 'off'}`}
                      title={p.disponivel ? 'Disponível' : 'Indisponível'}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <div className="mapa-frota__map-wrap">
          <div ref={mapEl} className="mapa-frota__map" />
          <div className="mapa-frota__legend" aria-hidden>
            <span>🚐 Van</span>
            <span>🚛 Carreta</span>
            <span>🛻 Truck</span>
            <span>🚚 Bitrem</span>
          </div>
        </div>
      </div>
    </div>
  )
}
