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

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function starsHtml(nota: number): string {
  const full = Math.floor(nota)
  const half = nota - full >= 0.4
  const stars = Array.from({ length: 5 }, (_, i) => {
    const on = i < full || (i === full && half)
    return `<span class="${on ? 'is-on' : ''}">★</span>`
  }).join('')
  return `<span class="frota-stars" aria-label="${nota} de 5 estrelas">${stars}<em>${nota
    .toFixed(1)
    .replace('.', ',')}</em></span>`
}

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

function popupHtml(p: PontoFrota): string {
  const status = p.disponivel ? 'ok' : 'off'
  const statusLabel = p.disponivel ? 'Disponível para carregar' : 'Indisponível'
  const avaliacoes =
    p.totalAvaliacoes > 0 ? `${p.totalAvaliacoes} avaliação(ões)` : 'Sem avaliações ainda'
  const avatar = p.motoristaFoto
    ? `<img src="${escapeHtml(p.motoristaFoto)}" alt="" class="frota-ficha__foto" />`
    : `<span class="frota-ficha__avatar" aria-hidden>${escapeHtml(iniciaisNome(p.motoristaNome))}</span>`
  const marcaModelo =
    [p.veiculoMarca, p.veiculoModelo].filter(Boolean).join(' ') || '—'
  const cnh = [
    p.motoristaCnh || '—',
    p.motoristaCategoriaCnh ? `Cat. ${p.motoristaCategoriaCnh}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const frete = p.freteMinimo > 0 ? formatCurrency(p.freteMinimo) : '—'

  return `
    <div class="frota-popup">
      <div class="frota-ficha__hero">
        ${avatar}
        <div class="frota-ficha__hero-text">
          <h2>${escapeHtml(p.motoristaNome)}</h2>
          ${starsHtml(p.avaliacao)}
          <p class="frota-ficha__avaliacoes">${escapeHtml(avaliacoes)}</p>
          <span class="frota-ficha__status frota-ficha__status--${status}">${statusLabel}</span>
        </div>
      </div>
      <dl class="frota-ficha__dl">
        <div><dt>Transportadora</dt><dd>${escapeHtml(p.transportadorNome)}</dd></div>
        <div><dt>Telefone</dt><dd>${escapeHtml(p.motoristaTelefone || '—')}</dd></div>
        <div><dt>CNH</dt><dd>${escapeHtml(cnh)}</dd></div>
        <div>
          <dt>Veículo</dt>
          <dd><span class="frota-ficha__veiculo"><span aria-hidden>${p.emoji}</span>${escapeHtml(p.tipoVeiculo)}</span></dd>
        </div>
        <div><dt>Placa</dt><dd>${escapeHtml(p.placa)}</dd></div>
        <div><dt>Marca / modelo</dt><dd>${escapeHtml(marcaModelo)}</dd></div>
        <div><dt>Frete mínimo</dt><dd class="frota-ficha__frete">${escapeHtml(frete)}</dd></div>
      </dl>
    </div>
  `
}

function makeIcon(p: PontoFrota) {
  return L.divIcon({
    className: 'frota-pin-wrap',
    html: markerHtml(p),
    iconSize: [110, 44],
    iconAnchor: [55, 44],
    // Âncora na base da bolha; o CSS --below coloca o card embaixo
    popupAnchor: [0, 4],
  })
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
      m.bindPopup(popupHtml(p), {
        className: 'frota-leaflet-popup frota-leaflet-popup--below',
        maxWidth: 320,
        minWidth: 260,
        offset: L.point(0, 8),
        autoPan: true,
        autoPanPadding: L.point(48, 48),
        autoPanPaddingTopLeft: L.point(24, 24),
        autoPanPaddingBottomRight: L.point(24, 72),
        closeButton: true,
      })
      m.on('click', () => setSelecionado(p.id))
      m.on('popupclose', () => {
        setSelecionado((cur) => (cur === p.id ? null : cur))
      })
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
    const map = mapRef.current
    if (!map) return
    if (!selecionado) {
      map.closePopup()
      return
    }
    const marker = markersRef.current.get(selecionado)
    const p = filtrados.find((x) => x.id === selecionado)
    if (!marker || !p) return
    const zoom = Math.max(map.getZoom(), 10)
    // Deixa o pin mais alto na tela para o popup caber embaixo
    const pt = map.project([p.lat, p.lng], zoom)
    const shifted = map.unproject([pt.x, pt.y - 120], zoom)
    map.setView(shifted, zoom, { animate: true })
    window.setTimeout(() => marker.openPopup(), 180)
  }, [selecionado, filtrados])

  const nDisp = pontos.filter((p) => p.disponivel).length
  const nIndisp = pontos.length - nDisp

  const contagemPorCategoria = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of LEGENDA_FROTA) map.set(item.grupo, 0)
    for (const p of pontos) {
      if (!p.disponivel) continue
      map.set(p.icone, (map.get(p.icone) ?? 0) + 1)
    }
    return LEGENDA_FROTA.map((item) => ({
      ...item,
      qtd: map.get(item.grupo) ?? 0,
    }))
  }, [pontos])

  return (
    <div className="mapa-frota animate-fade-up">
      <header className="mapa-frota__head">
        <div>
          <h1 className="mapa-frota__title">Mapa da Frota</h1>
          <p className="mapa-frota__sub">
            Bolhas com ícone do veículo e frete mínimo. Clique no ponto para ver o motorista ao
            lado.
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
          <div className="mapa-frota__cats" aria-label="Quantidade disponível por categoria">
            <p className="mapa-frota__cats-title">Disponíveis no mapa</p>
            <ul className="mapa-frota__cats-list">
              {contagemPorCategoria.map((item) => (
                <li key={item.grupo}>
                  <span className="mapa-frota__cats-ico" aria-hidden>
                    {item.emoji}
                  </span>
                  <span className="mapa-frota__cats-label">{item.label}</span>
                  <strong className="mapa-frota__cats-qtd">{item.qtd}</strong>
                </li>
              ))}
            </ul>
          </div>
          {filtrados.length === 0 && (
            <p className="mapa-frota__empty">
              Nenhum ponto para exibir. Cadastre origem (coordenadas) no transportador, vincule
              motorista ao veículo e marque como disponível.
            </p>
          )}
        </aside>
        <div className="mapa-frota__map-wrap">
          <div ref={mapEl} className="mapa-frota__map" />
        </div>
      </div>
    </div>
  )
}
