import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useData } from '../../context/DataContext'
import { formatCurrency } from '../../lib/businessRules'
import {
  iniciaisNome,
  labelFretePin,
  LEGENDA_FROTA,
  montarPontosFrota,
  type PontoFrota,
} from '../../lib/mapaFrota'
import '../../styles/mapa-frota.css'

function markerHtml(p: PontoFrota): string {
  const frete = labelFretePin(p.freteMinimo)
  const status = p.disponivel ? 'ok' : 'off'
  return `
    <div class="frota-bubble frota-bubble--${status}" title="${escapeHtml(p.motoristaNome)}">
      <span class="frota-bubble__icon" aria-hidden="true">${p.emoji}</span>
      <span class="frota-bubble__price">${frete}</span>
    </div>
  `
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function makeIcon(p: PontoFrota) {
  return L.divIcon({
    className: 'frota-pin-wrap',
    html: markerHtml(p),
    iconSize: [110, 44],
    iconAnchor: [55, 44],
    popupAnchor: [0, -40],
  })
}

function Stars({ nota }: { nota: number }) {
  const full = Math.floor(nota)
  const half = nota - full >= 0.4
  return (
    <span className="frota-stars" aria-label={`${nota} de 5 estrelas`}>
      {Array.from({ length: 5 }, (_, i) => {
        const filled = i < full || (i === full && half)
        return (
          <span key={i} className={filled ? 'is-on' : ''}>
            ★
          </span>
        )
      })}
      <em>{nota.toFixed(1).replace('.', ',')}</em>
    </span>
  )
}

function FichaMotorista({
  ponto,
  onClose,
}: {
  ponto: PontoFrota
  onClose: () => void
}) {
  return (
    <aside className="frota-ficha" role="dialog" aria-label={`Motorista ${ponto.motoristaNome}`}>
      <button type="button" className="frota-ficha__close" onClick={onClose} aria-label="Fechar">
        ×
      </button>
      <div className="frota-ficha__hero">
        {ponto.motoristaFoto ? (
          <img src={ponto.motoristaFoto} alt="" className="frota-ficha__foto" />
        ) : (
          <span className="frota-ficha__avatar" aria-hidden>
            {iniciaisNome(ponto.motoristaNome)}
          </span>
        )}
        <div className="frota-ficha__hero-text">
          <h2>{ponto.motoristaNome}</h2>
          <Stars nota={ponto.avaliacao} />
          <p className="frota-ficha__avaliacoes">
            {ponto.totalAvaliacoes > 0
              ? `${ponto.totalAvaliacoes} avaliação(ões)`
              : 'Sem avaliações ainda'}
          </p>
          <span
            className={`frota-ficha__status frota-ficha__status--${ponto.disponivel ? 'ok' : 'off'}`}
          >
            {ponto.disponivel ? 'Disponível para carregar' : 'Indisponível'}
          </span>
        </div>
      </div>

      <dl className="frota-ficha__dl">
        <div>
          <dt>Transportadora</dt>
          <dd>{ponto.transportadorNome}</dd>
        </div>
        <div>
          <dt>Telefone</dt>
          <dd>{ponto.motoristaTelefone || '—'}</dd>
        </div>
        <div>
          <dt>CNH</dt>
          <dd>
            {ponto.motoristaCnh || '—'}
            {ponto.motoristaCategoriaCnh ? ` · Cat. ${ponto.motoristaCategoriaCnh}` : ''}
          </dd>
        </div>
        <div>
          <dt>Veículo</dt>
          <dd>
            <span className="frota-ficha__veiculo">
              <span aria-hidden>{ponto.emoji}</span>
              {ponto.tipoVeiculo}
            </span>
          </dd>
        </div>
        <div>
          <dt>Placa</dt>
          <dd>{ponto.placa}</dd>
        </div>
        <div>
          <dt>Marca / modelo</dt>
          <dd>
            {[ponto.veiculoMarca, ponto.veiculoModelo].filter(Boolean).join(' ') || '—'}
          </dd>
        </div>
        <div>
          <dt>Frete mínimo</dt>
          <dd className="frota-ficha__frete">
            {ponto.freteMinimo > 0 ? formatCurrency(ponto.freteMinimo) : '—'}
          </dd>
        </div>
      </dl>
    </aside>
  )
}

export function MapaFrotaPage() {
  const { motoristas, veiculos, transportadores } = useData()
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
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

  const pontoAberto = selecionado ? filtrados.find((p) => p.id === selecionado) ?? null : null

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
      markersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    markersRef.current.clear()

    const bounds: L.LatLngExpression[] = []
    for (const p of filtrados) {
      const m = L.marker([p.lat, p.lng], { icon: makeIcon(p) })
      m.on('click', () => setSelecionado(p.id))
      m.addTo(layer)
      markersRef.current.set(p.id, m)
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
    mapRef.current.setView([p.lat, p.lng], Math.max(mapRef.current.getZoom(), 10), {
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
            Bolhas com ícone do veículo e frete mínimo. Clique para ver motorista, veículo e
            avaliação.
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
                        ★ {p.avaliacao.toFixed(1).replace('.', ',')} ·{' '}
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
          {pontoAberto && (
            <FichaMotorista ponto={pontoAberto} onClose={() => setSelecionado(null)} />
          )}
          <div className="mapa-frota__legend" aria-label="Categorias de veículo">
            {LEGENDA_FROTA.map((item) => (
              <span key={item.grupo}>
                {item.emoji} {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
