import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useData } from '../../context/DataContext'
import { formatCurrency } from '../../lib/businessRules'
import { geocodificarConsulta } from '../../lib/geocodeEndereco'
import {
  agruparPontosPorCoord,
  chaveCoordFrota,
  classificarIconeVeiculo,
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
import { listarFotosVeiculoDisponiveis } from '../../lib/veiculoFotos'
import {
  CARROCERIAS_POR_GRUPO,
  GRUPOS_CARROCERIA,
  parseCarrocerias,
  toggleCarroceria,
} from '../../lib/tiposCarroceria'
import { FrotaGaleriaVeiculoModal } from '../../components/mapa/FrotaGaleriaVeiculoModal'
import '../../styles/cadastro.css'
import '../../styles/mapa-frota.css'

function pontoTemCarroceria(p: PontoFrota, selecionadas: string[]): boolean {
  if (selecionadas.length === 0) return true
  const doPonto = parseCarrocerias(p.tipoCarroceria).map((x) => x.toLowerCase())
  if (doPonto.length === 0) return false
  return selecionadas.some((s) => {
    const q = s.toLowerCase()
    return doPonto.some((x) => x === q || x.includes(q) || q.includes(x))
  })
}

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

/** Digitos para wa.me (BR: adiciona 55 se ainda não tiver). */
function telefoneParaWhatsApp(raw?: string | null): string | null {
  const d = (raw || '').replace(/\D/g, '')
  if (d.length < 10) return null
  if (d.startsWith('55') && d.length >= 12) return d
  return `55${d}`
}

function whatsappDdHtml(telefone?: string | null): string {
  const label = (telefone || '').trim() || '—'
  const digits = telefoneParaWhatsApp(telefone)
  if (!digits) return escapeHtml(label)
  const href = `https://wa.me/${digits}`
  const icon = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`
  return `<a class="frota-ficha__whats" href="${href}" target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp">
    <span class="frota-ficha__whats-ico">${icon}</span>
    <span>${escapeHtml(label)}</span>
  </a>`
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

/** Pin agrupado: vários veículos na mesma coordenada. */
function clusterMarkerHtml(pontos: PontoFrota[]): string {
  const n = pontos.length
  const disponiveis = pontos.filter((p) => p.disponivel)
  const amostra = disponiveis[0] ?? pontos[0]
  const fretes = disponiveis.map((p) => p.freteMinimo).filter((v) => v > 0)
  const freteMin = fretes.length > 0 ? Math.min(...fretes) : amostra.freteMinimo
  const frete = labelFretePin(freteMin)
  const status = disponiveis.length > 0 ? 'ok' : 'off'
  const nomes = pontos
    .slice(0, 4)
    .map((p) => p.placa || p.motoristaNome)
    .join(', ')
  const extra = n > 4 ? ` +${n - 4}` : ''
  return `
    <div class="frota-bubble frota-bubble--${status} frota-bubble--cluster" title="${escapeHtml(
      `${n} veículos neste ponto: ${nomes}${extra}`,
    )}">
      ${frotaIconeHtml(amostra.icone, 'frota-bubble__icon')}
      <span class="frota-bubble__price">${frete}</span>
      <span class="frota-bubble__badge" aria-label="${n} veículos">${n}</span>
    </div>
  `
}

/**
 * Abre pins sobrepostos lado a lado em pixels de tela.
 * gapX/gapY maiores que o bubble (~120×52) para não sobrepor em nenhum zoom.
 */
function posicoesSpiderfy(
  map: L.Map,
  center: L.LatLngExpression,
  count: number,
): L.LatLng[] {
  if (count <= 1) return [L.latLng(center)]
  const origin = map.latLngToLayerPoint(center)
  // iconSize do pin é 120×52 — centro a centro precisa passar disso + folga
  const gapX = 138
  const gapY = 72
  // Até 3: uma fileira; 4–6: duas; acima: três
  const cols =
    count <= 3 ? count : count <= 6 ? Math.ceil(count / 2) : Math.ceil(count / 3)
  const rows = Math.ceil(count / cols)
  const totalW = (cols - 1) * gapX
  const totalH = (rows - 1) * gapY
  // Sobe o bloco para o × do hub ficar livre abaixo
  const baseY = origin.y - 36 - totalH / 2

  return Array.from({ length: count }, (_, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = origin.x - totalW / 2 + col * gapX
    const y = baseY + row * gapY
    return map.layerPointToLatLng(L.point(x, y))
  })
}

function popupHtml(p: PontoFrota): string {
  const status = p.disponivel ? 'ok' : 'off'
  const statusLabel = p.disponivel ? 'Disponível para carregar' : 'Indisponível'
  const avaliacoes =
    p.totalAvaliacoes > 0 ? `${p.totalAvaliacoes} avaliação(ões)` : 'Sem avaliações ainda'
  const avatarNome = p.transportadorNome || p.motoristaNome
  const avatar = p.motoristaFoto
    ? `<button type="button" class="frota-ficha__foto-btn js-frota-foto" data-frota-id="${escapeHtml(p.id)}" title="Ver foto / logo" aria-label="Ver foto / logo">
         <img src="${escapeHtml(p.motoristaFoto)}" alt="" class="frota-ficha__foto" />
       </button>`
    : `<button type="button" class="frota-ficha__foto-btn js-frota-foto" data-frota-id="${escapeHtml(p.id)}" title="Sem logo — envie na edição da transportadora" aria-label="Sem logo">
         <span class="frota-ficha__avatar" aria-hidden>${escapeHtml(iniciaisNome(avatarNome))}</span>
       </button>`
  const marcaModelo =
    [p.veiculoMarca, p.veiculoModelo].filter(Boolean).join(' ') || '—'
  const cnh = p.motoristaCategoriaCnh
    ? `Cat. ${p.motoristaCategoriaCnh}`
    : '—'
  const frete = p.freteMinimo > 0 ? formatCurrency(p.freteMinimo) : '—'
  const local = [p.cidade, p.uf].filter(Boolean).join(' / ') || '—'
  const raio = p.raioKm > 0 ? `${p.raioKm} km` : '—'
  const whatsDd = whatsappDdHtml(p.motoristaTelefone)
  const qtdFotos = listarFotosVeiculoDisponiveis(p.veiculoFotos).length
  const galeriaBtn = `
    <button type="button" class="frota-ficha__galeria-btn js-frota-galeria" data-frota-id="${escapeHtml(p.id)}" title="Ver fotos do veículo" aria-label="Ver fotos do veículo">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2"/>
        <circle cx="8.5" cy="10.5" r="1.5"/>
        <path d="M21 16l-5-5-4 4-2-2-5 5"/>
      </svg>
      <span>${qtdFotos > 0 ? `${qtdFotos} foto${qtdFotos === 1 ? '' : 's'}` : 'Fotos'}</span>
    </button>`

  return `
    <div class="frota-popup" data-frota-id="${escapeHtml(p.id)}">
      <div class="frota-ficha__hero">
        ${avatar}
        <div class="frota-ficha__hero-text">
          <h2>${escapeHtml(p.motoristaNome)}</h2>
          ${starsHtml(p.avaliacao)}
          <button type="button" class="frota-ficha__avaliacoes-btn js-frota-avaliacoes" data-frota-id="${escapeHtml(p.id)}" title="Ver avaliações">
            ${escapeHtml(avaliacoes)}
          </button>
          <span class="frota-ficha__status frota-ficha__status--${status}">${statusLabel}</span>
        </div>
      </div>
      <div class="frota-ficha__topo-grid">
        <dl class="frota-ficha__dl frota-ficha__dl--compact">
          <div><dt>Transportadora</dt><dd>${escapeHtml(p.transportadorNome)}</dd></div>
          <div><dt>Origem</dt><dd>${escapeHtml(local)}</dd></div>
        </dl>
        ${galeriaBtn}
      </div>
      <dl class="frota-ficha__dl">
        <div><dt>Raio de pesquisa</dt><dd>${escapeHtml(raio)}</dd></div>
        <div><dt>WhatsApp</dt><dd>${whatsDd}</dd></div>
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
  onGaleria: (p: PontoFrota) => void,
) {
  if (!popupEl) return
  const bind = (sel: string, fn: () => void) => {
    const el = popupEl.querySelector(sel) as HTMLElement | null
    if (!el) return
    // Impede o Leaflet de engolir o clique / fechar o popup sem abrir o modal
    L.DomEvent.disableClickPropagation(el)
    L.DomEvent.disableScrollPropagation(el)
    el.addEventListener('click', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      fn()
    })
  }
  bind('.js-frota-foto', () => onFoto(p))
  bind('.js-frota-avaliacoes', () => onAvaliacoes(p))
  bind('.js-frota-galeria', () => onGaleria(p))
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

function scrollDoPopup(map: L.Map): number {
  const el = map.getContainer().querySelector('.leaflet-popup-content') as HTMLElement | null
  return el?.scrollTop ?? 0
}

function restaurarScrollPopup(map: L.Map, scrollTop: number) {
  const aplicar = () => {
    const el = map.getContainer().querySelector('.leaflet-popup-content') as HTMLElement | null
    if (el) el.scrollTop = scrollTop
  }
  aplicar()
  window.requestAnimationFrame(aplicar)
}

/** Campos exibidos no pin/popup — evita recriar HTML se nada mudou. */
function pontoUiKey(p: PontoFrota): string {
  const nFotos = listarFotosVeiculoDisponiveis(p.veiculoFotos).length
  return [
    p.id,
    p.lat.toFixed(5),
    p.lng.toFixed(5),
    p.disponivel ? '1' : '0',
    p.motoristaNome,
    p.transportadorNome,
    p.placa,
    p.tipoVeiculo,
    p.icone,
    `f${nFotos}`,
    p.comprimento_m ?? '',
    p.cubagem_m3 ?? '',
    p.freteMinimo,
    p.avaliacao,
    p.totalAvaliacoes,
    p.motoristaFoto ?? '',
    p.motoristaTelefone ?? '',
    p.motoristaCategoriaCnh ?? '',
    p.veiculoMarca ?? '',
    p.veiculoModelo ?? '',
    p.cidade,
    p.uf,
    p.raioKm,
  ].join('|')
}

export function MapaFrotaPage() {
  const { motoristas, veiculos, transportadores } = useData()
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const raioLayerRef = useRef<L.Circle | null>(null)
  const origemMarkerRef = useRef<L.Marker | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const markersUiRef = useRef<Map<string, string>>(new Map())
  const clusterMarkersRef = useRef<Map<string, L.Marker>>(new Map())
  const spiderLegsRef = useRef<L.LayerGroup | null>(null)
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null)
  const expandedClusterRef = useRef<string | null>(null)
  expandedClusterRef.current = expandedCluster
  /** Força recalcular o leque em pixels a cada zoom/pan (evita colar). */
  const [spiderTick, setSpiderTick] = useState(0)
  /** Evita que pan/rebuild feche o popup e limpe a seleção na hora de abrir. */
  const ignorarFecharPopupRef = useRef(false)
  const clicarOrigemRef = useRef(false)
  const [filtro, setFiltro] = useState<'todos' | 'disponiveis' | 'indisponiveis'>('disponiveis')
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const selecionadoRef = useRef<string | null>(null)
  selecionadoRef.current = selecionado
  const chaveFiltroAnteriorRef = useRef('')
  const enquadrouInicialRef = useRef(false)
  const [abaPesquisa, setAbaPesquisa] = useState<'veiculo' | 'transportadora'>('veiculo')
  const [buscaVeiculo, setBuscaVeiculo] = useState('')
  const [buscaTransportadora, setBuscaTransportadora] = useState('')
  const [transportadorFiltroId, setTransportadorFiltroId] = useState('')
  const [carroceriasFiltro, setCarroceriasFiltro] = useState<string[]>([])
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [regiao, setRegiao] = useState<'' | RegiaoBr>('')
  const [raioMin, setRaioMin] = useState<number | ''>('')
  const [raioGeo, setRaioGeo] = useState(RAIO_GEO_DEFAULT_KM)
  const [raioGeoAtivo, setRaioGeoAtivo] = useState(true)
  const [origemRaio, setOrigemRaio] = useState<OrigemRaio | null>(null)
  const [clicarOrigem, setClicarOrigem] = useState(false)
  const [searchParams] = useSearchParams()
  const origemQuery = (searchParams.get('origem') || '').trim()
  const veiculoQuery = (searchParams.get('veiculo') || '').trim()
  const cargaQuery = (searchParams.get('carga') || '').trim()
  const origemQueryAplicadaRef = useRef('')
  const veiculoQueryAplicadoRef = useRef('')
  const [enderecoOrigem, setEnderecoOrigem] = useState('')
  const [coordLat, setCoordLat] = useState('')
  const [coordLng, setCoordLng] = useState('')
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoErro, setGeoErro] = useState('')
  const [tipos, setTipos] = useState<FrotaIconeGrupo[]>([])
  /** Tipo vindo do anúncio do Kanban — só informa; o usuário pode mudar a categoria. */
  const [tipoDoAnuncio, setTipoDoAnuncio] = useState<string | null>(null)
  const [modalFoto, setModalFoto] = useState<PontoFrota | null>(null)
  const [modalGaleria, setModalGaleria] = useState<PontoFrota | null>(null)
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
  const abrirGaleriaRef = useRef<(p: PontoFrota) => void>(() => {})
  const pontosByIdRef = useRef<Map<string, PontoFrota>>(new Map())
  abrirFotoRef.current = (p) => setModalFoto(p)
  abrirGaleriaRef.current = (p) => setModalGaleria(p)
  abrirAvaliacoesRef.current = (p) => setModalAvaliacoes(p)
  clicarOrigemRef.current = clicarOrigem

  const chaveFiltro = useMemo(
    () =>
      JSON.stringify({
        filtro,
        abaPesquisa,
        buscaVeiculo: buscaVeiculo.trim().toLowerCase(),
        buscaTransportadora: buscaTransportadora.trim().toLowerCase(),
        transportadorFiltroId,
        carroceriasFiltro,
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
    [
      filtro,
      abaPesquisa,
      buscaVeiculo,
      buscaTransportadora,
      transportadorFiltroId,
      carroceriasFiltro,
      cidade,
      uf,
      regiao,
      raioMin,
      raioGeo,
      raioGeoAtivo,
      tipos,
      origemRaio,
    ],
  )

  const pontos = useMemo(
    () => montarPontosFrota(motoristas, veiculos, transportadores),
    [motoristas, veiculos, transportadores],
  )

  useEffect(() => {
    const byId = new Map<string, PontoFrota>()
    for (const p of pontos) byId.set(p.id, p)
    pontosByIdRef.current = byId
  }, [pontos])

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

  const opcoesTransportadora = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; qtd: number }>()
    for (const p of pontos) {
      const prev = map.get(p.transportadorId)
      if (prev) prev.qtd += 1
      else map.set(p.transportadorId, { id: p.transportadorId, nome: p.transportadorNome, qtd: 1 })
    }
    return Array.from(map.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR'),
    )
  }, [pontos])

  const filtradosSemTipo = useMemo(() => {
    const qVeic = buscaVeiculo.trim().toLowerCase()
    const qTransp = buscaTransportadora.trim().toLowerCase()
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
      if (!pontoTemCarroceria(p, carroceriasFiltro)) return false
      if (abaPesquisa === 'veiculo') {
        if (qVeic) {
          const blob = [
            p.motoristaNome,
            p.placa,
            p.tipoVeiculo,
            p.tipoCarroceria,
            p.veiculoMarca,
            p.veiculoModelo,
            p.cidade,
            p.uf,
          ]
            .join(' ')
            .toLowerCase()
          if (!blob.includes(qVeic)) return false
        }
      } else {
        if (transportadorFiltroId && p.transportadorId !== transportadorFiltroId) return false
        if (qTransp && !p.transportadorNome.toLowerCase().includes(qTransp)) return false
      }
      return true
    })
  }, [
    pontos,
    filtro,
    cidade,
    uf,
    regiao,
    raioMin,
    raioGeo,
    raioGeoAtivo,
    buscaVeiculo,
    buscaTransportadora,
    transportadorFiltroId,
    carroceriasFiltro,
    abaPesquisa,
    origemRaio,
  ])

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
    Boolean(buscaVeiculo.trim()) ||
    Boolean(buscaTransportadora.trim()) ||
    Boolean(transportadorFiltroId) ||
    Boolean(cidade) ||
    Boolean(uf) ||
    Boolean(regiao) ||
    raioMin !== '' ||
    Boolean(origemRaio) ||
    tipos.length > 0 ||
    carroceriasFiltro.length > 0

  function definirOrigem(lat: number, lng: number, label: string) {
    setOrigemRaio({ lat, lng, label })
    setCoordLat(lat.toFixed(5))
    setCoordLng(lng.toFixed(5))
    setGeoErro('')
    setClicarOrigem(false)
    setRaioGeoAtivo(true)
  }

  async function localizarPorEndereco(endereco?: string) {
    const q = (endereco ?? enderecoOrigem).trim()
    if (!q) {
      setGeoErro('Informe um endereço de origem.')
      return
    }
    setGeoBusy(true)
    setGeoErro('')
    const res = await geocodificarConsulta(q)
    setGeoBusy(false)
    if (!res.ok) {
      setGeoErro(res.erro)
      return
    }
    definirOrigem(res.coords.lat, res.coords.lng, res.display || q)
  }

  // Vindo do Kanban: ?origem=… → busca motoristas a partir do endereço da carga
  useEffect(() => {
    if (!origemQuery || origemQueryAplicadaRef.current === origemQuery) return
    origemQueryAplicadaRef.current = origemQuery
    setEnderecoOrigem(origemQuery)
    setPesquisaAberta(true)
    void localizarPorEndereco(origemQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao mudar o query param
  }, [origemQuery])

  // Vindo do Kanban: ?veiculo=… → começa mostrando só o tipo do anúncio (editável depois)
  useEffect(() => {
    if (!veiculoQuery || veiculoQueryAplicadoRef.current === veiculoQuery) return
    veiculoQueryAplicadoRef.current = veiculoQuery
    const { grupo } = classificarIconeVeiculo(veiculoQuery)
    const label =
      LEGENDA_FROTA.find((x) => x.grupo === grupo)?.label ?? veiculoQuery
    setTipoDoAnuncio(label)
    setPesquisaAberta(true)
    if (grupo !== 'outros') {
      setTipos([grupo])
    } else {
      // Tipo não mapeado: filtra pelo texto do anúncio na busca
      setTipos([])
      setAbaPesquisa('veiculo')
      setBuscaVeiculo(veiculoQuery)
    }
  }, [veiculoQuery])

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
    setBuscaVeiculo('')
    setBuscaTransportadora('')
    setTransportadorFiltroId('')
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
    setCarroceriasFiltro([])
    setTipoDoAnuncio(null)
  }

  function toggleCarroceriaFiltro(item: string) {
    setCarroceriasFiltro((prev) => toggleCarroceria(prev, item))
  }

  const blocoCarroceria = (
    <div className="mapa-frota__carroceria">
      <p className="mapa-frota__tipos-label">Carroceria</p>
      {GRUPOS_CARROCERIA.map((grupo) => (
        <div key={grupo} className="mapa-frota__carroceria-grupo">
          <p className="mapa-frota__carroceria-grupo-title">{grupo}</p>
          <ul className="mapa-frota__carroceria-list">
            {CARROCERIAS_POR_GRUPO[grupo].map((item) => {
              const on = carroceriasFiltro.includes(item)
              return (
                <li key={item}>
                  <label className={`mapa-frota__carroceria-item${on ? ' is-on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleCarroceriaFiltro(item)}
                    />
                    <span>{item}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )

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
      if (clicarOrigemRef.current) {
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
        return
      }
      // Clique no mapa fecha o leque de pins empilhados
      if (expandedClusterRef.current) setExpandedCluster(null)
    })

    // Delegação: sobrevive quando o Leaflet recria o HTML do popup
    const onPopupActionClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null
      if (!target?.closest) return
      const galeria = target.closest('.js-frota-galeria') as HTMLElement | null
      const foto = target.closest('.js-frota-foto') as HTMLElement | null
      const avaliacoes = target.closest('.js-frota-avaliacoes') as HTMLElement | null
      const btn = galeria || foto || avaliacoes
      if (!btn || !map.getContainer().contains(btn)) return
      const id =
        btn.getAttribute('data-frota-id') ||
        btn.closest('[data-frota-id]')?.getAttribute('data-frota-id')
      if (!id) return
      const ponto = pontosByIdRef.current.get(id)
      if (!ponto) return
      ev.preventDefault()
      ev.stopPropagation()
      if (galeria) abrirGaleriaRef.current(ponto)
      else if (foto) abrirFotoRef.current(ponto)
      else abrirAvaliacoesRef.current(ponto)
    }
    map.getContainer().addEventListener('click', onPopupActionClick, true)

    // Mantém o espaçamento em pixels ao zoomar com o leque aberto
    const onViewChange = () => {
      if (expandedClusterRef.current) setSpiderTick((n) => n + 1)
    }
    map.on('zoomend', onViewChange)
    map.on('moveend', onViewChange)

    const t = window.setTimeout(() => map.invalidateSize(), 80)
    return () => {
      window.clearTimeout(t)
      map.getContainer().removeEventListener('click', onPopupActionClick, true)
      map.off('zoomend', onViewChange)
      map.off('moveend', onViewChange)
      map.remove()
      mapRef.current = null
      layerRef.current = null
      raioLayerRef.current = null
      origemMarkerRef.current = null
      markersRef.current.clear()
      markersUiRef.current.clear()
      clusterMarkersRef.current.clear()
      spiderLegsRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getContainer().style.cursor = clicarOrigem ? 'crosshair' : ''
  }, [clicarOrigem])

  // Fecha o leque quando o filtro muda
  useEffect(() => {
    setExpandedCluster(null)
  }, [chaveFiltro])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    const filtrosMudaram = chaveFiltroAnteriorRef.current !== chaveFiltro
    chaveFiltroAnteriorRef.current = chaveFiltro

    const idAberto = selecionadoRef.current
    const scrollAberto = idAberto ? scrollDoPopup(map) : 0
    if (idAberto) ignorarFecharPopupRef.current = true

    if (raioLayerRef.current) {
      map.removeLayer(raioLayerRef.current)
      raioLayerRef.current = null
    }
    if (origemMarkerRef.current) {
      map.removeLayer(origemMarkerRef.current)
      origemMarkerRef.current = null
    }

    if (!spiderLegsRef.current) {
      spiderLegsRef.current = L.layerGroup().addTo(map)
    } else {
      spiderLegsRef.current.clearLayers()
    }
    const legs = spiderLegsRef.current

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

    const grupos = agruparPontosPorCoord(filtrados)
    const expanded = expandedCluster
    const idsVisiveis = new Set<string>()
    const clusterKeysVisiveis = new Set<string>()
    const bounds: L.LatLngExpression[] = []

    function ligarPopup(m: L.Marker, p: PontoFrota) {
      m.off('popupopen')
      m.off('popupclose')
      m.on('popupopen', (e) => {
        const el = e.popup.getElement() ?? undefined
        ligarAcoesPopup(
          el,
          p,
          (pt) => abrirFotoRef.current(pt),
          (pt) => abrirAvaliacoesRef.current(pt),
          (pt) => abrirGaleriaRef.current(pt),
        )
        window.requestAnimationFrame(() => encaixarPopupNoMapa(map, e.popup))
      })
      m.on('popupclose', () => {
        if (ignorarFecharPopupRef.current) return
        setSelecionado((cur) => (cur === p.id ? null : cur))
      })
    }

    function ensureMarker(p: PontoFrota, latlng: L.LatLngExpression): L.Marker {
      const uiKey = `${pontoUiKey(p)}@${L.latLng(latlng).lat.toFixed(6)},${L.latLng(latlng).lng.toFixed(6)}`
      let m = markersRef.current.get(p.id)
      const prevKey = markersUiRef.current.get(p.id)

      if (!m) {
        m = L.marker(latlng, {
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
          m!.openPopup()
          const popup = m!.getPopup()
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
        ligarPopup(m, p)
        m.addTo(layer)
        markersRef.current.set(p.id, m)
        markersUiRef.current.set(p.id, uiKey)
      } else {
        if (!layer.hasLayer(m)) m.addTo(layer)
        if (prevKey !== uiKey) {
          const popupAberto = m.isPopupOpen()
          const scrollKeep = popupAberto ? scrollDoPopup(map) : 0
          m.setLatLng(latlng)
          m.setIcon(makeIcon(p))
          m.setPopupContent(popupHtml(p))
          ligarPopup(m, p)
          markersUiRef.current.set(p.id, uiKey)
          if (popupAberto) {
            // setPopupContent não dispara popupopen — reatacha ações no HTML novo
            const popup = m.getPopup()
            ligarAcoesPopup(
              popup?.getElement() ?? undefined,
              p,
              (pt) => abrirFotoRef.current(pt),
              (pt) => abrirAvaliacoesRef.current(pt),
              (pt) => abrirGaleriaRef.current(pt),
            )
            window.requestAnimationFrame(() => {
              if (popup) encaixarPopupNoMapa(map, popup)
              restaurarScrollPopup(map, scrollKeep)
            })
          }
        } else {
          m.setLatLng(latlng)
        }
      }
      return m
    }

    for (const [key, pontos] of grupos) {
      const center: L.LatLngExpression = [pontos[0].lat, pontos[0].lng]
      bounds.push(center)

      if (pontos.length === 1) {
        idsVisiveis.add(pontos[0].id)
        ensureMarker(pontos[0], center)
        continue
      }

      if (expanded === key) {
        const posicoes = posicoesSpiderfy(map, center, pontos.length)
        pontos.forEach((p, i) => {
          idsVisiveis.add(p.id)
          ensureMarker(p, posicoes[i] ?? L.latLng(center))
          L.polyline([center, posicoes[i] ?? center], {
            color: '#64748b',
            weight: 1.5,
            opacity: 0.55,
            dashArray: '4 4',
            interactive: false,
          }).addTo(legs)
        })
        // Centro clicável para fechar o leque
        clusterKeysVisiveis.add(key)
        let hub = clusterMarkersRef.current.get(key)
        const hubHtml = `<div class="frota-cluster-hub" title="Fechar veículos deste ponto">×</div>`
        if (!hub) {
          hub = L.marker(center, {
            icon: L.divIcon({
              className: 'frota-cluster-hub-wrap',
              html: hubHtml,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            }),
            zIndexOffset: 900,
          })
          hub.on('click', (e) => {
            L.DomEvent.stopPropagation(e.originalEvent)
            setExpandedCluster(null)
          })
          hub.addTo(layer)
          clusterMarkersRef.current.set(key, hub)
        } else {
          hub.setLatLng(center)
          hub.setIcon(
            L.divIcon({
              className: 'frota-cluster-hub-wrap',
              html: hubHtml,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            }),
          )
          if (!layer.hasLayer(hub)) hub.addTo(layer)
        }
        continue
      }

      // Agrupado: um pin com badge; veículos individuais ficam ocultos
      clusterKeysVisiveis.add(key)
      let cm = clusterMarkersRef.current.get(key)
      const clusterIcon = L.divIcon({
        className: 'frota-pin-wrap',
        html: clusterMarkerHtml(pontos),
        iconSize: [120, 52],
        iconAnchor: [60, 52],
      })
      if (!cm) {
        cm = L.marker(center, {
          icon: clusterIcon,
          riseOnHover: true,
          keyboard: true,
          title: `${pontos.length} veículos neste ponto`,
          zIndexOffset: 400,
        })
        cm.on('click', (e) => {
          if (clicarOrigemRef.current) return
          L.DomEvent.stopPropagation(e.originalEvent)
          setSelecionado(null)
          setExpandedCluster(key)
        })
        cm.addTo(layer)
        clusterMarkersRef.current.set(key, cm)
      } else {
        cm.setLatLng(center)
        cm.setIcon(clusterIcon)
        cm.off('click')
        cm.on('click', (e) => {
          if (clicarOrigemRef.current) return
          L.DomEvent.stopPropagation(e.originalEvent)
          setSelecionado(null)
          setExpandedCluster(key)
        })
        if (!layer.hasLayer(cm)) cm.addTo(layer)
      }
    }

    for (const [id, m] of markersRef.current) {
      if (!idsVisiveis.has(id)) {
        layer.removeLayer(m)
        markersRef.current.delete(id)
        markersUiRef.current.delete(id)
      }
    }
    for (const [key, cm] of clusterMarkersRef.current) {
      if (!clusterKeysVisiveis.has(key)) {
        layer.removeLayer(cm)
        clusterMarkersRef.current.delete(key)
      }
    }

    if (idAberto && idsVisiveis.has(idAberto)) {
      const keep = markersRef.current.get(idAberto)
      if (keep) {
        if (!keep.isPopupOpen()) {
          window.setTimeout(() => {
            keep.openPopup()
            const popup = keep.getPopup()
            if (popup) encaixarPopupNoMapa(map, popup)
            restaurarScrollPopup(map, scrollAberto)
            ignorarFecharPopupRef.current = false
          }, 0)
        } else {
          restaurarScrollPopup(map, scrollAberto)
          ignorarFecharPopupRef.current = false
        }
      } else {
        setSelecionado(null)
        ignorarFecharPopupRef.current = false
      }
    } else {
      if (idAberto && !idsVisiveis.has(idAberto)) {
        // Seleção está dentro de um cluster fechado — abre o leque
        const ponto = filtrados.find((p) => p.id === idAberto)
        if (ponto) {
          const key = chaveCoordFrota(ponto.lat, ponto.lng)
          const grupo = grupos.get(key)
          if (grupo && grupo.length > 1 && expanded !== key) {
            window.queueMicrotask(() => setExpandedCluster(key))
          }
        }
      }
      ignorarFecharPopupRef.current = false
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
  }, [filtrados, raioGeo, raioGeoAtivo, origemRaio, chaveFiltro, expandedCluster, spiderTick])

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
                <div className="mapa-frota__tabs" role="tablist" aria-label="Tipo de pesquisa">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={abaPesquisa === 'veiculo'}
                    className={`mapa-frota__tab${abaPesquisa === 'veiculo' ? ' is-on' : ''}`}
                    onClick={() => setAbaPesquisa('veiculo')}
                  >
                    Por veículo
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={abaPesquisa === 'transportadora'}
                    className={`mapa-frota__tab${abaPesquisa === 'transportadora' ? ' is-on' : ''}`}
                    onClick={() => setAbaPesquisa('transportadora')}
                  >
                    Por transportadora
                  </button>
                </div>

                {abaPesquisa === 'veiculo' ? (
                  <div className="mapa-frota__tab-panel" role="tabpanel">
                    <input
                      className="mapa-frota__input"
                      type="search"
                      placeholder="Placa, motorista, tipo…"
                      value={buscaVeiculo}
                      onChange={(e) => setBuscaVeiculo(e.target.value)}
                    />
                    <div className="mapa-frota__tipos">
                      <span className="mapa-frota__tipos-label">Tipos de veículo</span>
                      {tipoDoAnuncio && (
                        <p className="mapa-frota__cats-hint" style={{ marginTop: 4 }}>
                          Anúncio{cargaQuery ? ` #${cargaQuery}` : ''}:{' '}
                          <strong>{tipoDoAnuncio}</strong>
                          {' · '}
                          você pode marcar outras categorias abaixo.
                        </p>
                      )}
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
                                dangerouslySetInnerHTML={{
                                  __html: frotaIconeSvgRaw(item.grupo),
                                }}
                              />
                              <em>{item.label}</em>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    {blocoCarroceria}
                  </div>
                ) : (
                  <div className="mapa-frota__tab-panel" role="tabpanel">
                    <input
                      className="mapa-frota__input"
                      type="search"
                      placeholder="Nome fantasia da transportadora…"
                      value={buscaTransportadora}
                      onChange={(e) => {
                        setBuscaTransportadora(e.target.value)
                        setTransportadorFiltroId('')
                      }}
                    />
                    <label className="mapa-frota__field">
                      <span>Transportadora</span>
                      <select
                        value={transportadorFiltroId}
                        onChange={(e) => {
                          setTransportadorFiltroId(e.target.value)
                          if (e.target.value) setBuscaTransportadora('')
                        }}
                      >
                        <option value="">Todas</option>
                        {opcoesTransportadora.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nome} ({t.qtd})
                          </option>
                        ))}
                      </select>
                    </label>
                    {opcoesTransportadora.length > 0 && (
                      <ul className="mapa-frota__transp-list" aria-label="Transportadoras">
                        {opcoesTransportadora
                          .filter((t) => {
                            const q = buscaTransportadora.trim().toLowerCase()
                            if (!q) return true
                            return t.nome.toLowerCase().includes(q)
                          })
                          .slice(0, 12)
                          .map((t) => {
                            const on = transportadorFiltroId === t.id
                            return (
                              <li key={t.id}>
                                <button
                                  type="button"
                                  className={`mapa-frota__transp-row${on ? ' is-on' : ''}`}
                                  aria-pressed={on}
                                  onClick={() => {
                                    setTransportadorFiltroId(on ? '' : t.id)
                                    setBuscaTransportadora('')
                                  }}
                                >
                                  <span className="mapa-frota__transp-nome">{t.nome}</span>
                                  <strong className="mapa-frota__transp-qtd">{t.qtd}</strong>
                                </button>
                              </li>
                            )
                          })}
                      </ul>
                    )}
                    {blocoCarroceria}
                  </div>
                )}

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
            <div className="mapa-frota__cats-head">
              <p className="mapa-frota__cats-title">Disponíveis no mapa</p>
              <p className="mapa-frota__cats-hint">
                {tipos.length === 1
                  ? `Mostrando só ${
                      LEGENDA_FROTA.find((i) => i.grupo === tipos[0])?.label ?? 'este tipo'
                    } — clique de novo para ver todos`
                  : 'Clique para ver só esse tipo no mapa'}
              </p>
            </div>
            <ul className="mapa-frota__cats-list">
              {contagemPorCategoria.map((item) => {
                const ativo = tipos.length === 1 && tipos[0] === item.grupo
                return (
                  <li key={item.grupo}>
                    <button
                      type="button"
                      className={`mapa-frota__cats-row${ativo ? ' is-on' : ''}`}
                      onClick={(e) => {
                        e.currentTarget.blur()
                        filtrarSoTipo(item.grupo)
                      }}
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
          {!clicarOrigem && tipoDoAnuncio && origemRaio && (
            <div className="mapa-frota__map-banner" role="status">
              Raio a partir da origem da carga
              {cargaQuery ? ` #${cargaQuery}` : ''}: só {tipoDoAnuncio} no início — mude a
              categoria na lista se quiser ver outros.
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

      {modalGaleria ? (
        <FrotaGaleriaVeiculoModal ponto={modalGaleria} onClose={() => setModalGaleria(null)} />
      ) : null}

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
