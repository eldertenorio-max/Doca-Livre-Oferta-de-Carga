import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useData } from '../../context/DataContext'
import { formatCurrency } from '../../lib/businessRules'
import {
  distanciaKm,
  iniciaisNome,
  labelFretePin,
  LEGENDA_FROTA,
  montarPontosFrota,
  REGIOES_BR,
  regiaoDaUf,
  type FrotaIconeGrupo,
  type PontoFrota,
  type RegiaoBr,
} from '../../lib/mapaFrota'
import '../../styles/mapa-frota.css'

const RAIOS_KM = [50, 100, 150, 200, 300, 500] as const

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
  const local = [p.cidade, p.uf].filter(Boolean).join(' / ') || '—'
  const raio = p.raioKm > 0 ? `${p.raioKm} km` : '—'

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
        <div><dt>Origem</dt><dd>${escapeHtml(local)}</dd></div>
        <div><dt>Raio de pesquisa</dt><dd>${escapeHtml(raio)}</dd></div>
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
    iconSize: [120, 52],
    iconAnchor: [60, 52],
    popupAnchor: [0, 6],
  })
}

function encaixarPopupNoMapa(map: L.Map, popup: L.Popup) {
  const el = popup.getElement()
  const container = map.getContainer()
  if (!el) return

  const pad = 14
  const cr = container.getBoundingClientRect()
  const er = el.getBoundingClientRect()
  const content = el.querySelector('.leaflet-popup-content') as HTMLElement | null

  const maxH = Math.max(160, cr.bottom - er.top - pad - 8)
  if (content) content.style.maxHeight = `${maxH}px`

  const er2 = el.getBoundingClientRect()
  let dx = 0
  let dy = 0
  if (er2.bottom > cr.bottom - pad) dy += er2.bottom - (cr.bottom - pad)
  if (er2.top < cr.top + pad) dy -= cr.top + pad - er2.top
  if (er2.right > cr.right - pad) dx += er2.right - (cr.right - pad)
  if (er2.left < cr.left + pad) dx -= cr.left + pad - er2.left
  if (dx || dy) map.panBy([dx, dy], { animate: false })
}

export function MapaFrotaPage() {
  const { motoristas, veiculos, transportadores } = useData()
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const raioLayerRef = useRef<L.Circle | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  /** Evita que pan/rebuild feche o popup e limpe a seleção na hora de abrir. */
  const ignorarFecharPopupRef = useRef(false)
  const [filtro, setFiltro] = useState<'todos' | 'disponiveis' | 'indisponiveis'>('disponiveis')
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const selecionadoRef = useRef<string | null>(null)
  selecionadoRef.current = selecionado
  const [busca, setBusca] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [regiao, setRegiao] = useState<'' | RegiaoBr>('')
  const [raioMin, setRaioMin] = useState<number | ''>('')
  const [raioGeo, setRaioGeo] = useState<number | ''>('')
  const [tipos, setTipos] = useState<FrotaIconeGrupo[]>([])

  const pontos = useMemo(
    () => montarPontosFrota(motoristas, veiculos, transportadores),
    [motoristas, veiculos, transportadores],
  )

  const opcoesCidade = useMemo(() => {
    const set = new Set<string>()
    for (const p of pontos) if (p.cidade) set.add(p.cidade)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [pontos])

  const opcoesUf = useMemo(() => {
    const set = new Set<string>()
    for (const p of pontos) if (p.uf) set.add(p.uf)
    return Array.from(set).sort()
  }, [pontos])

  const centroBusca = useMemo(() => {
    if (!cidade && !uf && !regiao) return null
    const base = pontos.filter((p) => {
      if (cidade && p.cidade.toLowerCase() !== cidade.toLowerCase()) return false
      if (uf && p.uf !== uf) return false
      if (regiao && regiaoDaUf(p.uf) !== regiao) return false
      return true
    })
    if (base.length === 0) return null
    const lat = base.reduce((s, p) => s + p.lat, 0) / base.length
    const lng = base.reduce((s, p) => s + p.lng, 0) / base.length
    return { lat, lng }
  }, [pontos, cidade, uf, regiao])

  const filtradosSemTipo = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return pontos.filter((p) => {
      if (filtro === 'disponiveis' && !p.disponivel) return false
      if (filtro === 'indisponiveis' && p.disponivel) return false
      if (cidade && p.cidade.toLowerCase() !== cidade.toLowerCase()) return false
      if (uf && p.uf !== uf) return false
      if (regiao && regiaoDaUf(p.uf) !== regiao) return false
      if (raioMin !== '' && !(p.raioKm >= raioMin)) return false
      if (raioGeo !== '' && centroBusca) {
        if (distanciaKm(centroBusca.lat, centroBusca.lng, p.lat, p.lng) > raioGeo) return false
      }
      if (q) {
        const blob = [
          p.motoristaNome,
          p.transportadorNome,
          p.placa,
          p.tipoVeiculo,
          p.cidade,
          p.uf,
        ]
          .join(' ')
          .toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [pontos, filtro, cidade, uf, regiao, raioMin, raioGeo, busca, centroBusca])

  const filtrados = useMemo(() => {
    if (tipos.length === 0) return filtradosSemTipo
    return filtradosSemTipo.filter((p) => tipos.includes(p.icone))
  }, [filtradosSemTipo, tipos])

  const contagemPorCategoria = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of LEGENDA_FROTA) map.set(item.grupo, 0)
    for (const p of filtradosSemTipo) {
      if (!p.disponivel) continue
      map.set(p.icone, (map.get(p.icone) ?? 0) + 1)
    }
    return LEGENDA_FROTA.map((item) => ({
      ...item,
      qtd: map.get(item.grupo) ?? 0,
    }))
  }, [filtradosSemTipo])

  const nDisp = pontos.filter((p) => p.disponivel).length
  const nIndisp = pontos.length - nDisp
  const filtrosAtivos =
    Boolean(busca.trim()) ||
    Boolean(cidade) ||
    Boolean(uf) ||
    Boolean(regiao) ||
    raioMin !== '' ||
    raioGeo !== '' ||
    tipos.length > 0

  function limparFiltros() {
    setBusca('')
    setCidade('')
    setUf('')
    setRegiao('')
    setRaioMin('')
    setRaioGeo('')
    setTipos([])
  }

  /** Clique na categoria: mostra só aquele tipo; clica de novo libera. */
  function filtrarSoTipo(grupo: FrotaIconeGrupo) {
    setTipos((prev) => (prev.length === 1 && prev[0] === grupo ? [] : [grupo]))
  }

  function toggleTipo(grupo: FrotaIconeGrupo) {
    setTipos((prev) =>
      prev.includes(grupo) ? prev.filter((g) => g !== grupo) : [...prev, grupo],
    )
  }

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
      raioLayerRef.current = null
      markersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    markersRef.current.clear()

    if (raioLayerRef.current) {
      map.removeLayer(raioLayerRef.current)
      raioLayerRef.current = null
    }
    if (raioGeo !== '' && centroBusca) {
      const circle = L.circle([centroBusca.lat, centroBusca.lng], {
        radius: raioGeo * 1000,
        color: '#0f172a',
        weight: 1.5,
        fillColor: '#38bdf8',
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(map)
      raioLayerRef.current = circle
    }

    const bounds: L.LatLngExpression[] = []
    for (const p of filtrados) {
      const m = L.marker([p.lat, p.lng], {
        icon: makeIcon(p),
        riseOnHover: true,
        keyboard: true,
        title: p.motoristaNome,
      })
      m.bindPopup(popupHtml(p), {
        className: 'frota-leaflet-popup frota-leaflet-popup--below',
        maxWidth: 320,
        minWidth: 260,
        offset: L.point(0, 8),
        autoPan: false,
        closeButton: true,
        closeOnClick: true,
      })
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e.originalEvent)
        ignorarFecharPopupRef.current = true
        setSelecionado(p.id)
        m.openPopup()
        const popup = m.getPopup()
        if (popup) {
          window.requestAnimationFrame(() => {
            encaixarPopupNoMapa(map, popup)
            window.setTimeout(() => {
              ignorarFecharPopupRef.current = false
            }, 100)
          })
        } else {
          ignorarFecharPopupRef.current = false
        }
      })
      m.on('popupopen', (e) => {
        window.requestAnimationFrame(() => encaixarPopupNoMapa(map, e.popup))
      })
      m.on('popupclose', () => {
        if (ignorarFecharPopupRef.current) return
        setSelecionado((cur) => (cur === p.id ? null : cur))
      })
      m.addTo(layer)
      markersRef.current.set(p.id, m)
      bounds.push([p.lat, p.lng])
    }

    // Reabre o popup se o filtro reconstruiu os markers com o mesmo id selecionado
    const idSel = selecionadoRef.current
    if (idSel) {
      const keep = markersRef.current.get(idSel)
      if (keep) {
        ignorarFecharPopupRef.current = true
        window.setTimeout(() => {
          keep.openPopup()
          const popup = keep.getPopup()
          if (popup) encaixarPopupNoMapa(map, popup)
          ignorarFecharPopupRef.current = false
        }, 0)
      } else {
        setSelecionado(null)
      }
    }

    if (raioLayerRef.current) {
      const b = raioLayerRef.current.getBounds()
      if (bounds.length > 0) {
        map.fitBounds(b.extend(L.latLngBounds(bounds as L.LatLngTuple[])), {
          padding: [40, 40],
          maxZoom: 11,
        })
      } else {
        map.fitBounds(b, { padding: [40, 40], maxZoom: 10 })
      }
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 10)
    } else if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [48, 48], maxZoom: 11 })
    }
  }, [filtrados, raioGeo, centroBusca])

  return (
    <div className="mapa-frota animate-fade-up">
      <header className="mapa-frota__head">
        <div>
          <h1 className="mapa-frota__title">Mapa da Frota</h1>
          <p className="mapa-frota__sub">
            Filtre por cidade, região, raio e tipo. Clique no ponto para ver o motorista.
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
          <div className="mapa-frota__search">
            <p className="mapa-frota__cats-title">Pesquisar</p>
            <input
              className="mapa-frota__input"
              type="search"
              placeholder="Nome, placa, transportadora…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />

            <label className="mapa-frota__field">
              <span>Cidade</span>
              <select value={cidade} onChange={(e) => setCidade(e.target.value)}>
                <option value="">Todas</option>
                {opcoesCidade.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="mapa-frota__field">
              <span>UF</span>
              <select
                value={uf}
                onChange={(e) => {
                  setUf(e.target.value)
                  if (e.target.value) {
                    const r = regiaoDaUf(e.target.value)
                    if (r) setRegiao(r)
                  }
                }}
              >
                <option value="">Todas</option>
                {opcoesUf.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>

            <label className="mapa-frota__field">
              <span>Região</span>
              <select
                value={regiao}
                onChange={(e) => {
                  setRegiao(e.target.value as '' | RegiaoBr)
                  if (e.target.value) setUf('')
                }}
              >
                <option value="">Todas</option>
                {REGIOES_BR.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            <label className="mapa-frota__field">
              <span>Raio cadastrado (mín.)</span>
              <select
                value={raioMin === '' ? '' : String(raioMin)}
                onChange={(e) => setRaioMin(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Todos</option>
                {RAIOS_KM.map((r) => (
                  <option key={r} value={r}>
                    ≥ {r} km
                  </option>
                ))}
              </select>
            </label>

            <label className="mapa-frota__field">
              <span>Busca em raio no mapa</span>
              <select
                value={raioGeo === '' ? '' : String(raioGeo)}
                onChange={(e) => setRaioGeo(e.target.value ? Number(e.target.value) : '')}
                disabled={!cidade && !uf && !regiao}
                title={
                  !cidade && !uf && !regiao
                    ? 'Selecione cidade, UF ou região para usar o raio no mapa'
                    : undefined
                }
              >
                <option value="">Desligado</option>
                {RAIOS_KM.map((r) => (
                  <option key={r} value={r}>
                    Até {r} km do filtro
                  </option>
                ))}
              </select>
            </label>

            <div className="mapa-frota__tipos">
              <span className="mapa-frota__tipos-label">Tipos de veículo</span>
              <div className="mapa-frota__tipos-grid">
                {LEGENDA_FROTA.map((item) => {
                  const on = tipos.includes(item.grupo)
                  return (
                    <button
                      key={item.grupo}
                      type="button"
                      className={`mapa-frota__tipo-chip${on ? ' is-on' : ''}`}
                      aria-pressed={on}
                      title={item.label}
                      onClick={() => toggleTipo(item.grupo)}
                    >
                      <span aria-hidden>{item.emoji}</span>
                      <em>{item.label}</em>
                    </button>
                  )
                })}
              </div>
            </div>

            {filtrosAtivos && (
              <button type="button" className="mapa-frota__clear" onClick={limparFiltros}>
                Limpar filtros
              </button>
            )}
            <p className="mapa-frota__result">
              {filtrados.length} ponto{filtrados.length === 1 ? '' : 's'} no mapa
            </p>
          </div>

          <div className="mapa-frota__cats" aria-label="Quantidade disponível por categoria">
            <p className="mapa-frota__cats-title">Disponíveis no mapa</p>
            <p className="mapa-frota__cats-hint">Clique para ver só esse tipo no mapa</p>
            <ul className="mapa-frota__cats-list">
              {contagemPorCategoria.map((item) => {
                const ativo = tipos.length === 1 && tipos[0] === item.grupo
                return (
                  <li key={item.grupo}>
                    <button
                      type="button"
                      className={`mapa-frota__cats-row${ativo ? ' is-on' : ''}`}
                      onClick={() => filtrarSoTipo(item.grupo)}
                      aria-pressed={ativo}
                      title={
                        ativo
                          ? `Mostrando só ${item.label} — clique para ver todos`
                          : `Mostrar só ${item.label} no mapa`
                      }
                    >
                      <span className="mapa-frota__cats-ico" aria-hidden>
                        {item.emoji}
                      </span>
                      <span className="mapa-frota__cats-label">{item.label}</span>
                      <strong className="mapa-frota__cats-qtd">{item.qtd}</strong>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          {filtrados.length === 0 && (
            <p className="mapa-frota__empty">
              Nenhum ponto com esses filtros. Ajuste cidade, região, raio ou tipo.
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
