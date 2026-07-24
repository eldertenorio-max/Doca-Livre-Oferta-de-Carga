import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useData } from '../../context/DataContext'
import { formatCurrency } from '../../lib/businessRules'
import { geocodificarConsulta } from '../../lib/geocodeEndereco'
import {
  distanciaKm,
  frotaIconeHtml,
  iniciaisNome,
  labelFretePin,
  LEGENDA_FROTA,
  listarAvaliacoesDemo,
  montarPontosFrota,
  REGIOES_BR,
  regiaoDaUf,
  type FrotaIconeGrupo,
  type PontoFrota,
  type RegiaoBr,
} from '../../lib/mapaFrota'
import { frotaIconeSvgRaw } from '../../lib/frotaIcones'
import '../../styles/cadastro.css'
import '../../styles/mapa-frota.css'

const RAIOS_KM = [50, 100, 150, 200, 300, 500] as const
const RAIO_GEO_MIN_KM = 10
const RAIO_GEO_MAX_KM = 500
const RAIO_GEO_DEFAULT_KM = 100

type OrigemRaio = { lat: number; lng: number; label: string }

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
      ${frotaIconeHtml(p.icone, 'frota-bubble__icon')}
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
    ? `<button type="button" class="frota-ficha__foto-btn js-frota-foto" title="Ver foto de perfil" aria-label="Ver foto de perfil">
         <img src="${escapeHtml(p.motoristaFoto)}" alt="" class="frota-ficha__foto" />
       </button>`
    : `<button type="button" class="frota-ficha__foto-btn js-frota-foto" title="Ver perfil" aria-label="Ver perfil">
         <span class="frota-ficha__avatar" aria-hidden>${escapeHtml(iniciaisNome(p.motoristaNome))}</span>
       </button>`
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
          <button type="button" class="frota-ficha__avaliacoes-btn js-frota-avaliacoes" title="Ver avaliações">
            ${escapeHtml(avaliacoes)}
          </button>
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
          <dd><span class="frota-ficha__veiculo">${frotaIconeHtml(p.icone, 'frota-ficha__veiculo-ico')}${escapeHtml(p.tipoVeiculo)}</span></dd>
        </div>
        <div><dt>Placa</dt><dd>${escapeHtml(p.placa)}</dd></div>
        <div><dt>Marca / modelo</dt><dd>${escapeHtml(marcaModelo)}</dd></div>
        <div><dt>Frete mínimo</dt><dd class="frota-ficha__frete">${escapeHtml(frete)}</dd></div>
      </dl>
    </div>
  `
}

function ligarAcoesPopup(
  popupEl: HTMLElement | undefined,
  p: PontoFrota,
  onFoto: (p: PontoFrota) => void,
  onAvaliacoes: (p: PontoFrota) => void,
) {
  if (!popupEl) return
  popupEl.querySelector('.js-frota-foto')?.addEventListener('click', (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    onFoto(p)
  })
  popupEl.querySelector('.js-frota-avaliacoes')?.addEventListener('click', (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    onAvaliacoes(p)
  })
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

  // Só limita altura — não mexe no zoom/posição do mapa (usuário navega livre)
  const maxH = Math.max(140, Math.min(380, cr.bottom - Math.max(er.top, cr.top) - pad - 8))
  if (content) content.style.maxHeight = `${maxH}px`

  void map
}

export function MapaFrotaPage() {
  const { motoristas, veiculos, transportadores } = useData()
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const raioLayerRef = useRef<L.Circle | null>(null)
  const origemMarkerRef = useRef<L.Marker | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  /** Evita que pan/rebuild feche o popup e limpe a seleção na hora de abrir. */
  const ignorarFecharPopupRef = useRef(false)
  const clicarOrigemRef = useRef(false)
  const [filtro, setFiltro] = useState<'todos' | 'disponiveis' | 'indisponiveis'>('disponiveis')
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const selecionadoRef = useRef<string | null>(null)
  selecionadoRef.current = selecionado
  const chaveFiltroAnteriorRef = useRef('')
  const enquadrouInicialRef = useRef(false)
  const [busca, setBusca] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [regiao, setRegiao] = useState<'' | RegiaoBr>('')
  const [raioMin, setRaioMin] = useState<number | ''>('')
  const [raioGeo, setRaioGeo] = useState(RAIO_GEO_DEFAULT_KM)
  const [raioGeoAtivo, setRaioGeoAtivo] = useState(true)
  const [origemRaio, setOrigemRaio] = useState<OrigemRaio | null>(null)
  const [clicarOrigem, setClicarOrigem] = useState(false)
  const [enderecoOrigem, setEnderecoOrigem] = useState('')
  const [coordLat, setCoordLat] = useState('')
  const [coordLng, setCoordLng] = useState('')
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoErro, setGeoErro] = useState('')
  const [tipos, setTipos] = useState<FrotaIconeGrupo[]>([])
  const [modalFoto, setModalFoto] = useState<PontoFrota | null>(null)
  const [modalAvaliacoes, setModalAvaliacoes] = useState<PontoFrota | null>(null)
  const [pesquisaAberta, setPesquisaAberta] = useState(() => {
    try {
      return sessionStorage.getItem('doca-livre-mapa-frota-pesquisa') !== '0'
    } catch {
      return true
    }
  })
  const abrirFotoRef = useRef<(p: PontoFrota) => void>(() => {})
  const abrirAvaliacoesRef = useRef<(p: PontoFrota) => void>(() => {})
  abrirFotoRef.current = (p) => setModalFoto(p)
  abrirAvaliacoesRef.current = (p) => setModalAvaliacoes(p)
  clicarOrigemRef.current = clicarOrigem

  const chaveFiltro = useMemo(
    () =>
      JSON.stringify({
        filtro,
        busca: busca.trim().toLowerCase(),
        cidade,
        uf,
        regiao,
        raioMin,
        raioGeo,
        raioGeoAtivo,
        tipos,
        origem: origemRaio
          ? { lat: origemRaio.lat.toFixed(5), lng: origemRaio.lng.toFixed(5) }
          : null,
      }),
    [filtro, busca, cidade, uf, regiao, raioMin, raioGeo, raioGeoAtivo, tipos, origemRaio],
  )

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

  const filtradosSemTipo = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return pontos.filter((p) => {
      if (filtro === 'disponiveis' && !p.disponivel) return false
      if (filtro === 'indisponiveis' && p.disponivel) return false
      if (cidade && p.cidade.toLowerCase() !== cidade.toLowerCase()) return false
      if (uf && p.uf !== uf) return false
      if (regiao && regiaoDaUf(p.uf) !== regiao) return false
      if (raioMin !== '' && !(p.raioKm >= raioMin)) return false
      if (raioGeoAtivo && origemRaio) {
        if (distanciaKm(origemRaio.lat, origemRaio.lng, p.lat, p.lng) > raioGeo) return false
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
  }, [pontos, filtro, cidade, uf, regiao, raioMin, raioGeo, raioGeoAtivo, busca, origemRaio])

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
    Boolean(origemRaio) ||
    tipos.length > 0

  function definirOrigem(lat: number, lng: number, label: string) {
    setOrigemRaio({ lat, lng, label })
    setCoordLat(lat.toFixed(5))
    setCoordLng(lng.toFixed(5))
    setGeoErro('')
    setClicarOrigem(false)
    setRaioGeoAtivo(true)
  }

  async function localizarPorEndereco() {
    setGeoBusy(true)
    setGeoErro('')
    const res = await geocodificarConsulta(enderecoOrigem)
    setGeoBusy(false)
    if (!res.ok) {
      setGeoErro(res.erro)
      return
    }
    definirOrigem(res.coords.lat, res.coords.lng, res.display || enderecoOrigem.trim())
  }

  function localizarPorCoordenadas() {
    setGeoErro('')
    const lat = Number(String(coordLat).replace(',', '.'))
    const lng = Number(String(coordLng).replace(',', '.'))
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setGeoErro('Informe latitude e longitude válidas.')
      return
    }
    if (lat < -35 || lat > 6 || lng < -75 || lng > -30) {
      setGeoErro('Coordenadas fora do Brasil. Confira lat/lng.')
      return
    }
    definirOrigem(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`)
  }

  function limparFiltros() {
    setBusca('')
    setCidade('')
    setUf('')
    setRegiao('')
    setRaioMin('')
    setRaioGeo(RAIO_GEO_DEFAULT_KM)
    setRaioGeoAtivo(true)
    setOrigemRaio(null)
    setClicarOrigem(false)
    setEnderecoOrigem('')
    setCoordLat('')
    setCoordLng('')
    setGeoErro('')
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

    map.on('click', (e) => {
      if (!clicarOrigemRef.current) return
      L.DomEvent.stopPropagation(e.originalEvent)
      const { lat, lng } = e.latlng
      setOrigemRaio({
        lat,
        lng,
        label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      })
      setCoordLat(lat.toFixed(5))
      setCoordLng(lng.toFixed(5))
      setGeoErro('')
      setClicarOrigem(false)
      setRaioGeoAtivo(true)
    })

    const t = window.setTimeout(() => map.invalidateSize(), 80)
    return () => {
      window.clearTimeout(t)
      map.remove()
      mapRef.current = null
      layerRef.current = null
      raioLayerRef.current = null
      origemMarkerRef.current = null
      markersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getContainer().style.cursor = clicarOrigem ? 'crosshair' : ''
  }, [clicarOrigem])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    const filtrosMudaram = chaveFiltroAnteriorRef.current !== chaveFiltro
    chaveFiltroAnteriorRef.current = chaveFiltro

    const idAberto = selecionadoRef.current
    if (idAberto) ignorarFecharPopupRef.current = true

    layer.clearLayers()
    markersRef.current.clear()

    if (raioLayerRef.current) {
      map.removeLayer(raioLayerRef.current)
      raioLayerRef.current = null
    }
    if (origemMarkerRef.current) {
      map.removeLayer(origemMarkerRef.current)
      origemMarkerRef.current = null
    }

    if (origemRaio) {
      const origemIcon = L.divIcon({
        className: 'frota-origem-wrap',
        html: `<div class="frota-origem-pin" title="Origem da busca">◎</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })
      const om = L.marker([origemRaio.lat, origemRaio.lng], {
        icon: origemIcon,
        zIndexOffset: 800,
        interactive: false,
      }).addTo(map)
      origemMarkerRef.current = om

      if (raioGeoAtivo) {
        const circle = L.circle([origemRaio.lat, origemRaio.lng], {
          radius: raioGeo * 1000,
          color: '#0f172a',
          weight: 1.5,
          fillColor: '#38bdf8',
          fillOpacity: 0.12,
          interactive: false,
        }).addTo(map)
        raioLayerRef.current = circle
      }
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
        if (clicarOrigemRef.current) return
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
        const el = e.popup.getElement() ?? undefined
        ligarAcoesPopup(
          el,
          p,
          (pt) => abrirFotoRef.current(pt),
          (pt) => abrirAvaliacoesRef.current(pt),
        )
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

    if (idAberto) {
      const keep = markersRef.current.get(idAberto)
      if (keep) {
        window.setTimeout(() => {
          keep.openPopup()
          const popup = keep.getPopup()
          if (popup) encaixarPopupNoMapa(map, popup)
          ignorarFecharPopupRef.current = false
        }, 0)
      } else {
        setSelecionado(null)
        ignorarFecharPopupRef.current = false
      }
    }

    const deveEnquadrar = filtrosMudaram || !enquadrouInicialRef.current
    if (deveEnquadrar) {
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
        enquadrouInicialRef.current = true
      } else if (origemRaio) {
        map.setView([origemRaio.lat, origemRaio.lng], 10)
        enquadrouInicialRef.current = true
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 10)
        enquadrouInicialRef.current = true
      } else if (bounds.length > 1) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [48, 48], maxZoom: 11 })
        enquadrouInicialRef.current = true
      }
    }
  }, [filtrados, raioGeo, raioGeoAtivo, origemRaio, chaveFiltro])

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
          <div className={`mapa-frota__search${pesquisaAberta ? '' : ' is-collapsed'}`}>
            <button
              type="button"
              className="mapa-frota__search-toggle"
              aria-expanded={pesquisaAberta}
              onClick={() => {
                setPesquisaAberta((aberta) => {
                  const next = !aberta
                  try {
                    sessionStorage.setItem('doca-livre-mapa-frota-pesquisa', next ? '1' : '0')
                  } catch {
                    /* ignore */
                  }
                  return next
                })
              }}
            >
              <span className="mapa-frota__cats-title">Pesquisar</span>
              {filtrosAtivos && (
                <span className="mapa-frota__search-badge" title="Filtros ativos">
                  filtros
                </span>
              )}
              {!pesquisaAberta && (
                <span className="mapa-frota__search-resumo">
                  {filtrados.length} ponto{filtrados.length === 1 ? '' : 's'}
                </span>
              )}
              <span
                className={`mapa-frota__search-chevron${pesquisaAberta ? ' is-open' : ''}`}
                aria-hidden
              >
                ▾
              </span>
            </button>

            {pesquisaAberta && (
              <div className="mapa-frota__search-body">
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

            <div className="mapa-frota__raio-box">
              <p className="mapa-frota__cats-title">Busca em raio no mapa</p>
              <p className="mapa-frota__cats-hint">
                Defina a origem (clique, endereço ou coordenada) e o raio em km.
              </p>

              <button
                type="button"
                className={`mapa-frota__origem-btn${clicarOrigem ? ' is-on' : ''}`}
                aria-pressed={clicarOrigem}
                onClick={() => setClicarOrigem((v) => !v)}
              >
                {clicarOrigem ? 'Clique no mapa agora…' : 'Definir origem no mapa'}
              </button>

              <label className="mapa-frota__field">
                <span>Endereço</span>
                <div className="mapa-frota__row">
                  <input
                    className="mapa-frota__input"
                    type="text"
                    placeholder="Rua, cidade, CEP…"
                    value={enderecoOrigem}
                    onChange={(e) => setEnderecoOrigem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void localizarPorEndereco()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="mapa-frota__mini-btn"
                    disabled={geoBusy || !enderecoOrigem.trim()}
                    onClick={() => void localizarPorEndereco()}
                  >
                    {geoBusy ? '…' : 'OK'}
                  </button>
                </div>
              </label>

              <label className="mapa-frota__field">
                <span>Coordenadas</span>
                <div className="mapa-frota__row">
                  <input
                    className="mapa-frota__input"
                    type="text"
                    inputMode="decimal"
                    placeholder="Lat"
                    value={coordLat}
                    onChange={(e) => setCoordLat(e.target.value)}
                  />
                  <input
                    className="mapa-frota__input"
                    type="text"
                    inputMode="decimal"
                    placeholder="Lng"
                    value={coordLng}
                    onChange={(e) => setCoordLng(e.target.value)}
                  />
                  <button
                    type="button"
                    className="mapa-frota__mini-btn"
                    onClick={localizarPorCoordenadas}
                  >
                    OK
                  </button>
                </div>
              </label>

              {origemRaio && (
                <p className="mapa-frota__origem-ok">
                  Origem: {origemRaio.label}
                  <button
                    type="button"
                    className="mapa-frota__link-clear"
                    onClick={() => {
                      setOrigemRaio(null)
                      setClicarOrigem(false)
                    }}
                  >
                    limpar
                  </button>
                </p>
              )}

              {geoErro && <p className="mapa-frota__geo-erro">{geoErro}</p>}

              <div
                className={`mapa-frota__raio-slider raio-pesquisa${!origemRaio ? ' is-disabled' : ''}`}
              >
                <div className="mapa-frota__raio-slider-head">
                  <span>Raio a partir da origem</span>
                  <button
                    type="button"
                    className="mapa-frota__link-clear"
                    disabled={!origemRaio}
                    onClick={() => setRaioGeoAtivo((v) => !v)}
                  >
                    {raioGeoAtivo ? 'desligar' : 'ligar'}
                  </button>
                </div>
                <p className="raio-pesquisa__hint">
                  {!origemRaio
                    ? 'Defina a origem primeiro para aplicar o raio no mapa.'
                    : raioGeoAtivo
                      ? 'Arraste para filtrar os pontos dentro da distância.'
                      : 'Raio desligado — todos os pontos dos outros filtros aparecem.'}
                </p>
                <div className="raio-pesquisa__value">
                  <strong>{raioGeo}</strong>
                  <span>km</span>
                </div>
                <input
                  type="range"
                  className="raio-pesquisa__slider"
                  min={RAIO_GEO_MIN_KM}
                  max={RAIO_GEO_MAX_KM}
                  step={5}
                  value={raioGeo}
                  disabled={!origemRaio || !raioGeoAtivo}
                  onChange={(e) => {
                    setRaioGeo(Number(e.target.value))
                    setRaioGeoAtivo(true)
                  }}
                  aria-label="Raio a partir da origem em quilômetros"
                  style={
                    {
                      '--raio-pct': `${((raioGeo - RAIO_GEO_MIN_KM) / (RAIO_GEO_MAX_KM - RAIO_GEO_MIN_KM)) * 100}%`,
                    } as CSSProperties
                  }
                />
                <div className="raio-pesquisa__scale">
                  <span>{RAIO_GEO_MIN_KM} km</span>
                  <span>{RAIO_GEO_MAX_KM} km</span>
                </div>
              </div>
            </div>

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
                      <span
                        aria-hidden
                        className="frota-veiculo-ico frota-veiculo-ico--chip"
                        dangerouslySetInnerHTML={{ __html: frotaIconeSvgRaw(item.grupo) }}
                      />
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
            )}
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
                      <span
                        className="mapa-frota__cats-ico frota-veiculo-ico"
                        aria-hidden
                        dangerouslySetInnerHTML={{ __html: frotaIconeSvgRaw(item.grupo) }}
                      />
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
          {clicarOrigem && (
            <div className="mapa-frota__map-banner" role="status">
              Clique no mapa para definir a origem da busca em raio
            </div>
          )}
          <div ref={mapEl} className="mapa-frota__map" />
        </div>
      </div>

      {modalFoto && (
        <div
          className="frota-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Foto de ${modalFoto.motoristaNome}`}
          onClick={() => setModalFoto(null)}
        >
          <div className="frota-modal__panel frota-modal__panel--foto" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="frota-modal__close"
              aria-label="Fechar"
              onClick={() => setModalFoto(null)}
            >
              ×
            </button>
            <p className="frota-modal__nome">{modalFoto.motoristaNome}</p>
            {modalFoto.motoristaFoto ? (
              <img
                src={modalFoto.motoristaFoto}
                alt={`Foto de ${modalFoto.motoristaNome}`}
                className="frota-modal__img"
              />
            ) : (
              <div className="frota-modal__avatar-lg" aria-hidden>
                {iniciaisNome(modalFoto.motoristaNome)}
              </div>
            )}
          </div>
        </div>
      )}

      {modalAvaliacoes && (
        <div
          className="frota-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Avaliações de ${modalAvaliacoes.motoristaNome}`}
          onClick={() => setModalAvaliacoes(null)}
        >
          <div className="frota-modal__panel" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="frota-modal__close"
              aria-label="Fechar"
              onClick={() => setModalAvaliacoes(null)}
            >
              ×
            </button>
            <h2 className="frota-modal__title">Avaliações</h2>
            <p className="frota-modal__sub">
              {modalAvaliacoes.motoristaNome}
              {modalAvaliacoes.avaliacao > 0
                ? ` · ${modalAvaliacoes.avaliacao.toFixed(1).replace('.', ',')} ★`
                : ''}
              {modalAvaliacoes.totalAvaliacoes > 0
                ? ` · ${modalAvaliacoes.totalAvaliacoes} no total`
                : ''}
            </p>
            <ul className="frota-avaliacoes-list">
              {listarAvaliacoesDemo(
                modalAvaliacoes.motoristaId,
                modalAvaliacoes.avaliacao,
                modalAvaliacoes.totalAvaliacoes,
              ).map((av) => (
                <li key={av.id} className="frota-avaliacoes-list__item">
                  <div className="frota-avaliacoes-list__head">
                    <strong>{av.autor}</strong>
                    <span>{av.data}</span>
                  </div>
                  <div
                    className="frota-avaliacoes-list__stars"
                    aria-label={`${av.nota} de 5`}
                  >
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i} className={i < Math.round(av.nota) ? 'is-on' : ''}>
                        ★
                      </span>
                    ))}
                    <em>{av.nota.toFixed(1).replace('.', ',')}</em>
                  </div>
                  <p>{av.texto}</p>
                </li>
              ))}
              {modalAvaliacoes.totalAvaliacoes === 0 && (
                <li className="frota-avaliacoes-list__empty">Ainda sem avaliações.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
