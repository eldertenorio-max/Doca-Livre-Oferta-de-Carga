import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { LinkRota, LinkSistema } from '../../components/ui/HostLink'
import { isSiteMapaFrota, URL_MAPA_LOGISTICA } from '../../lib/siteOfertaDeCarga'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useData } from '../../context/DataContext'
import { CarroceriaFilterSelect } from '../../components/ui/CarroceriaFilterSelect'
import {
  MapaPubSuggestInput,
  type SugestaoPub,
} from '../../components/ui/MapaPubSuggestInput'
import { LOGO_DOCA_LIVRE_SRC } from '../../lib/brandAssets'
import { geocodificarConsulta } from '../../lib/geocodeEndereco'
import { frotaIconeSvgRaw } from '../../lib/frotaIcones'
import { UF_CENTRO, UFS_BR } from '../../lib/mapaLogisticaIntel'
import { sugerirCidadesComCoords } from '../../lib/municipiosSedes'
import { parseCarrocerias, TIPOS_CARROCERIA } from '../../lib/tiposCarroceria'
import {
  agruparPontosPorCoord,
  distanciaKm,
  frotaIconeHtml,
  labelFretePin,
  LEGENDA_FROTA,
  montarPontosFrota,
  REGIOES_BR,
  regiaoDaUf,
  type FrotaIconeGrupo,
  type PontoFrota,
  type RegiaoBr,
} from '../../lib/mapaFrota'
import {
  consultarEstadoBuscasPublicas,
  estadoBuscasPublicas,
  MAPA_PUBLICO_LIMITE_BUSCAS,
  registrarBuscaPublica,
} from '../../lib/mapaPublicoBuscas'
import '../../styles/mapa-frota.css'
import '../../styles/mapa-publico.css'

const RAIOS_KM = [50, 100, 150, 200, 300, 500] as const
const RAIO_GEO_MIN_KM = 10
const RAIO_GEO_MAX_KM = 500
const RAIO_GEO_DEFAULT_KM = 150

const PLANOS_PUBLICOS = [
  {
    id: 'motorista',
    nome: 'Motorista',
    preco: 'R$ 49',
    periodo: '/mês',
    extra: 'ou R$ 14,90 /semana',
    para: 'Caminhoneiro e transportador',
    itens: ['Mapa ilimitado', 'Ver ofertas de carga', 'Perfil no sistema'],
    destaque: false,
  },
  {
    id: 'start',
    nome: 'Embarcador Start',
    preco: 'R$ 197',
    periodo: '/mês',
    extra: '2 usuários',
    para: 'Empresa pequena',
    itens: ['Publicar cargas', 'Mapa ilimitado', 'WhatsApp e placa da frota'],
    destaque: true,
  },
  {
    id: 'pro',
    nome: 'Embarcador Pro',
    preco: 'R$ 397',
    periodo: '/mês',
    extra: '5 usuários',
    para: 'Operação com time',
    itens: ['Tudo do Start', 'Malha logística', 'Kanban e áreas salvas'],
    destaque: false,
  },
  {
    id: 'empresa',
    nome: 'Empresa',
    preco: 'R$ 890',
    periodo: '/mês',
    extra: 'ou sob consulta',
    para: 'Várias filiais',
    itens: ['10 usuários', 'Usuários extras', 'Prioridade no suporte'],
    destaque: false,
  },
] as const

type OrigemRaio = { lat: number; lng: number; label: string }
type FiltroStatus = 'disponiveis' | 'indisponiveis' | 'todos'

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function labelTipo(p: PontoFrota): string {
  return LEGENDA_FROTA.find((x) => x.grupo === p.icone)?.label || p.tipoVeiculo || 'Veículo'
}

function pontoTemCarroceria(p: PontoFrota, selecionadas: string[]): boolean {
  if (selecionadas.length === 0) return true
  const doPonto = parseCarrocerias(p.tipoCarroceria).map((x) => x.toLowerCase())
  if (doPonto.length === 0) return false
  return selecionadas.some((s) => {
    const q = s.toLowerCase()
    return doPonto.some((x) => x === q || x.includes(q) || q.includes(x))
  })
}

function markerPublicoHtml(p: PontoFrota, qtd = 1): string {
  const frete = labelFretePin(p.freteMinimo)
  const status = p.disponivel ? 'ok' : 'off'
  const badge =
    qtd > 1 ? `<span class="frota-bubble__badge" aria-label="${qtd} veículos">${qtd}</span>` : ''
  const extraClass = qtd > 1 ? ' frota-bubble--cluster' : ''
  return `
    <div class="frota-bubble frota-bubble--${status}${extraClass}" title="${escapeHtml(labelTipo(p))}">
      ${frotaIconeHtml(p.icone, 'frota-bubble__icon')}
      <span class="frota-bubble__price">${escapeHtml(frete)}</span>
      ${badge}
    </div>
  `
}

function popupPublicoHtml(p: PontoFrota, qtd: number): string {
  const local = [p.cidade, p.uf].filter(Boolean).join(' / ') || 'Brasil'
  const extra = qtd > 1 ? ` · ${qtd} veículos neste ponto` : ''
  const frete = labelFretePin(p.freteMinimo)
  return `
    <div class="mapa-pub-popup">
      <p class="mapa-pub-popup__tipo">${escapeHtml(labelTipo(p))}</p>
      <p class="mapa-pub-popup__local">${escapeHtml(local)}${escapeHtml(extra)}</p>
      <p class="mapa-pub-popup__frete">Frete mínimo ${escapeHtml(frete)}</p>
      <p class="mapa-pub-popup__status">${p.disponivel ? 'Disponível para carregar' : 'Indisponível'}</p>
      <p class="mapa-pub-popup__lock">Contato, placa e WhatsApp só para assinante.</p>
      <button type="button" class="mapa-pub-popup__cta js-mapa-pub-assinar">Assinar para ver contato</button>
    </div>
  `
}

export function MapaFrotaPublicoPage() {
  const { motoristas, veiculos, transportadores, cargas, refreshTransportadores, user } =
    useData()
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const raioLayerRef = useRef<L.Circle | null>(null)
  const origemMarkerRef = useRef<L.Marker | null>(null)
  const clicarOrigemRef = useRef(false)
  const chaveFiltroAnteriorRef = useRef('')
  const userRef = useRef(user)
  const cotaBusyRef = useRef(false)
  const definirOrigemRef = useRef<(lat: number, lng: number, label: string) => void | Promise<void>>(
    () => {},
  )

  const [filtro, setFiltro] = useState<FiltroStatus>('disponiveis')
  const [abaPesquisa, setAbaPesquisa] = useState<'veiculo' | 'transportadora'>('veiculo')
  const [digitadoVeiculo, setDigitadoVeiculo] = useState('')
  const [digitadoTransp, setDigitadoTransp] = useState('')
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
  const [enderecoOrigem, setEnderecoOrigem] = useState('')
  const [coordLat, setCoordLat] = useState('')
  const [coordLng, setCoordLng] = useState('')
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoErro, setGeoErro] = useState('')
  const [tipos, setTipos] = useState<FrotaIconeGrupo[]>([])
  const [pesquisaAberta, setPesquisaAberta] = useState(true)
  const [restam, setRestam] = useState(() =>
    user ? MAPA_PUBLICO_LIMITE_BUSCAS : estadoBuscasPublicas().restam,
  )
  const [showPaywall, setShowPaywall] = useState(
    () => !user && estadoBuscasPublicas().esgotado,
  )

  clicarOrigemRef.current = clicarOrigem
  userRef.current = user

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    document.title = 'Mapa da Frota — Doca Livre Oferta de Carga'
    void refreshTransportadores()
  }, [refreshTransportadores])

  useEffect(() => {
    if (user) setRestam(MAPA_PUBLICO_LIMITE_BUSCAS)
  }, [user])

  useEffect(() => {
    if (user) return
    let alive = true
    void consultarEstadoBuscasPublicas().then((estado) => {
      if (!alive) return
      setRestam(estado.restam)
    })
    return () => {
      alive = false
    }
  }, [user])

  useEffect(() => {
    function onAssinar(ev: MouseEvent) {
      const el = ev.target as HTMLElement | null
      if (!el?.closest?.('.js-mapa-pub-assinar')) return
      ev.preventDefault()
      setShowPaywall(true)
    }
    document.addEventListener('click', onAssinar)
    return () => document.removeEventListener('click', onAssinar)
  }, [])

  const pontos = useMemo(
    () => montarPontosFrota(motoristas, veiculos, transportadores, cargas),
    [motoristas, veiculos, transportadores, cargas],
  )

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
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [pontos])

  function sugestoesVeiculo(query: string): SugestaoPub[] {
    const q = query.trim().toLowerCase()
    if (q.length < 1) return []
    const out: SugestaoPub[] = []
    const seen = new Set<string>()
    const add = (item: SugestaoPub) => {
      const k = item.label.toLowerCase()
      if (seen.has(k)) return
      if (!k.includes(q) && !item.hint.toLowerCase().includes(q)) return
      seen.add(k)
      out.push(item)
    }
    for (const item of LEGENDA_FROTA) {
      add({
        key: `tipo-${item.grupo}`,
        label: item.label,
        hint: 'Tipo de veículo',
        kind: 'tipo',
        grupo: item.grupo,
      })
    }
    for (const nome of TIPOS_CARROCERIA) {
      add({
        key: `car-${nome}`,
        label: nome,
        hint: 'Carroceria',
        kind: 'carroceria',
      })
    }
    for (const c of sugerirCidadesComCoords(query, 8)) {
      add({
        key: `cid-${c.label}`,
        label: c.label,
        hint: 'Cidade',
        kind: 'cidade',
        lat: c.lat,
        lng: c.lng,
        cidade: c.primary,
      })
    }
    for (const p of pontos) {
      const label = [p.cidade, p.uf].filter(Boolean).join(' — ')
      if (label) {
        add({
          key: `frota-${label}`,
          label,
          hint: 'Cidade da frota',
          kind: 'cidade',
          cidade: p.cidade,
          uf: p.uf,
          lat: p.lat,
          lng: p.lng,
        })
      }
    }
    for (const uf of UFS_BR) {
      const nome = UF_CENTRO[uf].nome
      add({
        key: `uf-${uf}`,
        label: `${nome} — ${uf}`,
        hint: 'Estado',
        kind: 'uf',
        uf,
        lat: UF_CENTRO[uf].lat,
        lng: UF_CENTRO[uf].lng,
      })
    }
    for (const r of REGIOES_BR) {
      add({
        key: `reg-${r}`,
        label: r,
        hint: 'Região',
        kind: 'regiao',
      })
    }
    return out.slice(0, 10)
  }

  function sugestoesTransportadora(query: string): SugestaoPub[] {
    const q = query.trim().toLowerCase()
    if (q.length < 1) return []
    return opcoesTransportadora
      .filter((t) => t.nome.toLowerCase().includes(q))
      .slice(0, 10)
      .map((t) => ({
        key: `tr-${t.id}`,
        label: t.nome,
        hint: `${t.qtd} veículo${t.qtd === 1 ? '' : 's'}`,
        kind: 'transportadora' as const,
        transportadorId: t.id,
      }))
  }

  function sugestoesEndereco(query: string): SugestaoPub[] {
    return sugerirCidadesComCoords(query, 8).map((c) => ({
      key: `end-cid-${c.label}`,
      label: c.label,
      hint: 'Cidade',
      kind: 'cidade' as const,
      lat: c.lat,
      lng: c.lng,
      cidade: c.primary,
    }))
  }

  const filtradosSemStatus = useMemo(() => {
    const qVeic = buscaVeiculo.trim().toLowerCase()
    const qTransp = buscaTransportadora.trim().toLowerCase()
    return pontos.filter((p) => {
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
          const blob = [p.tipoVeiculo, p.tipoCarroceria, p.veiculoMarca, p.veiculoModelo, p.cidade, p.uf]
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

  const filtradosSemTipo = useMemo(() => {
    return filtradosSemStatus.filter((p) => {
      if (filtro === 'disponiveis' && !p.disponivel) return false
      if (filtro === 'indisponiveis' && p.disponivel) return false
      return true
    })
  }, [filtradosSemStatus, filtro])

  const filtrados = useMemo(() => {
    if (tipos.length === 0) return filtradosSemTipo
    return filtradosSemTipo.filter((p) => tipos.includes(p.icone))
  }, [filtradosSemTipo, tipos])

  const filtradosContagem = useMemo(() => {
    if (tipos.length === 0) return filtradosSemStatus
    return filtradosSemStatus.filter((p) => tipos.includes(p.icone))
  }, [filtradosSemStatus, tipos])

  const contagemPorCategoria = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of LEGENDA_FROTA) map.set(item.grupo, 0)
    for (const p of filtradosSemStatus) {
      if (!p.disponivel) continue
      map.set(p.icone, (map.get(p.icone) ?? 0) + 1)
    }
    return LEGENDA_FROTA.map((item) => ({
      ...item,
      qtd: map.get(item.grupo) ?? 0,
    }))
  }, [filtradosSemStatus])

  const nDisp = filtradosContagem.filter((p) => p.disponivel).length
  const nIndisp = filtradosContagem.length - nDisp
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

  async function consumirBusca(): Promise<boolean> {
    if (userRef.current) return true
    if (cotaBusyRef.current) return false
    cotaBusyRef.current = true
    try {
      const consumo = await registrarBuscaPublica()
      setRestam(consumo.restam)
      if (!consumo.ok) {
        setShowPaywall(true)
        return false
      }
      return true
    } finally {
      cotaBusyRef.current = false
    }
  }

  function aplicarOrigem(lat: number, lng: number, label: string) {
    setOrigemRaio({ lat, lng, label })
    setCoordLat(lat.toFixed(5))
    setCoordLng(lng.toFixed(5))
    setGeoErro('')
    setClicarOrigem(false)
    setRaioGeoAtivo(true)
  }

  async function definirOrigem(lat: number, lng: number, label: string) {
    if (!(await consumirBusca())) return
    aplicarOrigem(lat, lng, label)
  }
  definirOrigemRef.current = definirOrigem

  async function aplicarSugestaoVeiculo(item: SugestaoPub) {
    if (!(await consumirBusca())) return
    setDigitadoVeiculo(item.label)
    if (item.kind === 'tipo' && item.grupo) {
      setTipos([item.grupo as FrotaIconeGrupo])
      setBuscaVeiculo('')
    } else if (item.kind === 'carroceria') {
      setCarroceriasFiltro([item.label])
      setBuscaVeiculo('')
    } else if (item.kind === 'uf' && item.uf) {
      setUf(item.uf)
      const r = regiaoDaUf(item.uf)
      if (r) setRegiao(r)
      setBuscaVeiculo('')
    } else if (item.kind === 'regiao') {
      setRegiao(item.label as RegiaoBr)
      setUf('')
      setBuscaVeiculo('')
    } else if (item.kind === 'cidade') {
      setCidade(item.cidade || item.label)
      if (item.uf) {
        setUf(item.uf)
        const r = regiaoDaUf(item.uf)
        if (r) setRegiao(r)
      }
      setBuscaVeiculo('')
    } else {
      setBuscaVeiculo(item.label)
    }
    if (item.lat != null && item.lng != null) {
      aplicarOrigem(item.lat, item.lng, item.label)
    }
  }

  async function buscarTextoVeiculo(texto: string) {
    const q = texto.trim()
    if (!q) return
    const exato = sugestoesVeiculo(q).find((x) => x.label.toLowerCase() === q.toLowerCase())
    if (exato) {
      await aplicarSugestaoVeiculo(exato)
      return
    }
    if (!(await consumirBusca())) return
    setDigitadoVeiculo(q)
    setBuscaVeiculo(q)
    setGeoBusy(true)
    const res = await geocodificarConsulta(q)
    setGeoBusy(false)
    if (res.ok) aplicarOrigem(res.coords.lat, res.coords.lng, res.display || q)
  }

  async function aplicarSugestaoTransp(item: SugestaoPub) {
    if (!(await consumirBusca())) return
    setDigitadoTransp(item.label)
    setBuscaTransportadora('')
    setTransportadorFiltroId(item.transportadorId || '')
  }

  async function buscarTextoTransp(texto: string) {
    const q = texto.trim()
    if (!q) return
    const hit = sugestoesTransportadora(q)[0]
    if (hit) {
      await aplicarSugestaoTransp(hit)
      return
    }
    if (!(await consumirBusca())) return
    setDigitadoTransp(q)
    setBuscaTransportadora(q)
    setTransportadorFiltroId('')
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
      setGeoErro(res.erro || 'Não achei esse lugar. Tente a cidade e a UF.')
      return
    }
    definirOrigem(res.coords.lat, res.coords.lng, res.display || q)
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

  function limparPesquisaVeiculo() {
    setDigitadoVeiculo('')
    setBuscaVeiculo('')
  }

  function limparPesquisaTransp() {
    setDigitadoTransp('')
    setBuscaTransportadora('')
    setTransportadorFiltroId('')
  }

  function limparFiltros() {
    setDigitadoVeiculo('')
    setDigitadoTransp('')
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
  }

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
      center: [-14.2, -51.9],
      zoom: 4,
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
      void definirOrigemRef.current(
        e.latlng.lat,
        e.latlng.lng,
        `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`,
      )
    })
    const t = window.setTimeout(() => map.invalidateSize(), 80)
    const t2 = window.setTimeout(() => map.invalidateSize(), 320)
    return () => {
      window.clearTimeout(t)
      window.clearTimeout(t2)
      map.remove()
      mapRef.current = null
      layerRef.current = null
      raioLayerRef.current = null
      origemMarkerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    const filtrosMudaram = chaveFiltroAnteriorRef.current !== chaveFiltro
    chaveFiltroAnteriorRef.current = chaveFiltro

    layer.clearLayers()
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
      origemMarkerRef.current = L.marker([origemRaio.lat, origemRaio.lng], {
        icon: origemIcon,
        zIndexOffset: 800,
        interactive: false,
      }).addTo(map)
      if (raioGeoAtivo) {
        raioLayerRef.current = L.circle([origemRaio.lat, origemRaio.lng], {
          radius: raioGeo * 1000,
          color: '#0f172a',
          weight: 1.5,
          fillColor: '#38bdf8',
          fillOpacity: 0.12,
          interactive: false,
        }).addTo(map)
      }
    }

    const grupos = agruparPontosPorCoord(filtrados)
    const bounds: L.LatLngExpression[] = []
    for (const grupo of grupos.values()) {
      const p = grupo[0]
      const qtd = grupo.length
      const m = L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: 'frota-pin-wrap',
          html: markerPublicoHtml(p, qtd),
          iconSize: [120, 52],
          iconAnchor: [60, 52],
        }),
        title: `${labelTipo(p)} · ${p.cidade || ''}`,
      })
      m.bindPopup(popupPublicoHtml(p, qtd), {
        className: 'frota-leaflet-popup mapa-pub-leaflet',
        maxWidth: 280,
        minWidth: 220,
      })
      m.addTo(layer)
      bounds.push([p.lat, p.lng])
    }

    if (!filtrosMudaram) return
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
    } else if (origemRaio) {
      map.setView([origemRaio.lat, origemRaio.lng], 10)
    } else if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [48, 48], maxZoom: 11 })
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 10)
    } else {
      map.setView([-14.2, -51.9], 4)
    }
  }, [filtrados, raioGeo, raioGeoAtivo, origemRaio, chaveFiltro])

  const logado = Boolean(user)
  const blocoCarroceria = (
    <CarroceriaFilterSelect
      value={carroceriasFiltro}
      onChange={setCarroceriasFiltro}
      className="mapa-frota__carroceria"
      label="Carroceria"
    />
  )

  return (
    <div className="mapa-pub">
      <header className="mapa-pub__top">
        <Link to={isSiteMapaFrota() ? '/' : '/mapa'} className="mapa-pub__brand">
          <img src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" />
          <span>
            <strong>Doca Livre</strong>
            <em>Oferta de carga</em>
          </span>
        </Link>
        <div className="mapa-pub__top-actions">
          <LinkRota className="mapa-pub__btn mapa-pub__btn--ghost">Calcular rota</LinkRota>
          {logado ? (
            <Link
              className="mapa-pub__btn mapa-pub__btn--ghost"
              to={user?.role === 'transportador' ? '/transportador' : '/embarcador/mapa-frota'}
            >
              Ir para o sistema
            </Link>
          ) : (
            <>
              <LinkSistema className="mapa-pub__btn mapa-pub__btn--ghost" to="/login">
                Entrar
              </LinkSistema>
              <LinkSistema className="mapa-pub__btn mapa-pub__btn--solid" to="/cadastro-transportador">
                Cadastrar
              </LinkSistema>
            </>
          )}
        </div>
      </header>

      <div className="mapa-frota mapa-pub__shell">
        <header className="mapa-frota__head">
          <div>
            <h1 className="mapa-frota__title">Mapa da Frota</h1>
            <p className="mapa-frota__sub">
              Filtre por cidade, região, raio e tipo. Clique no ponto para ver o veículo.
            </p>
            <p className="mapa-pub__creditos">
              {user
                ? 'Conta logada · buscas ilimitadas'
                : restam > 0
                  ? `${restam} de ${MAPA_PUBLICO_LIMITE_BUSCAS} buscas grátis hoje`
                  : 'As 2 buscas grátis de hoje acabaram'}
            </p>
          </div>
          <div className="mapa-frota__filtros">
            {(
              [
                ['disponiveis', `Disponíveis (${nDisp})`],
                ['indisponiveis', `Indisponíveis (${nIndisp})`],
                ['todos', `Todos (${nDisp + nIndisp})`],
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

        {!user && restam === 0 ? (
          <div className="mapa-pub__cta-esgotado">
            <span>Para continuar buscando hoje e ver contato da frota, assine o Doca Livre.</span>
            <button type="button" onClick={() => setShowPaywall(true)}>
              Assinar para continuar
            </button>
          </div>
        ) : null}

        <div className="mapa-frota__layout">
          <aside className="mapa-frota__lista">
            <div className={`mapa-frota__search${pesquisaAberta ? '' : ' is-collapsed'}`}>
              <button
                type="button"
                className="mapa-frota__search-toggle"
                aria-expanded={pesquisaAberta}
                onClick={() => setPesquisaAberta((aberta) => !aberta)}
              >
                <span className="mapa-frota__cats-title">Pesquisar</span>
                {filtrosAtivos ? (
                  <span className="mapa-frota__search-badge" title="Filtros ativos">
                    filtros
                  </span>
                ) : null}
                {!pesquisaAberta ? (
                  <span className="mapa-frota__search-resumo">
                    {filtrados.length} ponto{filtrados.length === 1 ? '' : 's'}
                  </span>
                ) : null}
                <span
                  className={`mapa-frota__search-chevron${pesquisaAberta ? ' is-open' : ''}`}
                  aria-hidden
                >
                  ▾
                </span>
              </button>

              {pesquisaAberta ? (
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
                      <div className="mapa-frota__row mapa-pub__busca-row">
                        <MapaPubSuggestInput
                          value={digitadoVeiculo}
                          onChange={setDigitadoVeiculo}
                          onPick={aplicarSugestaoVeiculo}
                          onSubmit={(v) => void buscarTextoVeiculo(v)}
                          localSuggestions={sugestoesVeiculo}
                          placeholder="Tipo, cidade, carroceria, UF…"
                          disabled={!user && restam === 0}
                        />
                        <button
                          type="button"
                          className="mapa-frota__mini-btn"
                          disabled={geoBusy || !digitadoVeiculo.trim()}
                          onClick={() => void buscarTextoVeiculo(digitadoVeiculo)}
                        >
                          {geoBusy ? '…' : 'OK'}
                        </button>
                        <button
                          type="button"
                          className="mapa-frota__mini-btn mapa-frota__mini-btn--ghost"
                          disabled={!digitadoVeiculo.trim() && !buscaVeiculo.trim()}
                          onClick={limparPesquisaVeiculo}
                        >
                          Limpar
                        </button>
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
                      <div className="mapa-frota__row mapa-pub__busca-row">
                        <MapaPubSuggestInput
                          value={digitadoTransp}
                          onChange={setDigitadoTransp}
                          onPick={aplicarSugestaoTransp}
                          onSubmit={buscarTextoTransp}
                          localSuggestions={sugestoesTransportadora}
                          placeholder="Nome fantasia da transportadora…"
                          disabled={!user && restam === 0}
                          fetchRemote={false}
                        />
                        <button
                          type="button"
                          className="mapa-frota__mini-btn"
                          disabled={!digitadoTransp.trim()}
                          onClick={() => buscarTextoTransp(digitadoTransp)}
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          className="mapa-frota__mini-btn mapa-frota__mini-btn--ghost"
                          disabled={
                            !digitadoTransp.trim() &&
                            !buscaTransportadora.trim() &&
                            !transportadorFiltroId
                          }
                          onClick={limparPesquisaTransp}
                        >
                          Limpar
                        </button>
                      </div>
                      <label className="mapa-frota__field">
                        <span>Transportadora</span>
                        <select
                          value={transportadorFiltroId}
                          onChange={(e) => {
                            const id = e.target.value
                            if (!id) {
                              setTransportadorFiltroId('')
                              return
                            }
                            const t = opcoesTransportadora.find((x) => x.id === id)
                            if (t) {
                              void aplicarSugestaoTransp({
                                key: t.id,
                                label: t.nome,
                                hint: `${t.qtd} veículo${t.qtd === 1 ? '' : 's'}`,
                                kind: 'transportadora',
                                transportadorId: t.id,
                              })
                            }
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
                      {opcoesTransportadora.length > 0 ? (
                        <ul className="mapa-frota__transp-list" aria-label="Transportadoras">
                          {opcoesTransportadora
                            .filter((t) => {
                              const q = digitadoTransp.trim().toLowerCase()
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
                                      if (on) {
                                        setTransportadorFiltroId('')
                                        return
                                      }
                                      void aplicarSugestaoTransp({
                                        key: t.id,
                                        label: t.nome,
                                        hint: `${t.qtd} veículo${t.qtd === 1 ? '' : 's'}`,
                                        kind: 'transportadora',
                                        transportadorId: t.id,
                                      })
                                    }}
                                  >
                                    <span className="mapa-frota__transp-nome">{t.nome}</span>
                                    <strong className="mapa-frota__transp-qtd">{t.qtd}</strong>
                                  </button>
                                </li>
                              )
                            })}
                        </ul>
                      ) : null}
                      {blocoCarroceria}
                    </div>
                  )}

                  <button
                    type="button"
                    className="mapa-frota__clear mapa-frota__clear--wide"
                    onClick={limparFiltros}
                    disabled={!filtrosAtivos}
                  >
                    Limpar filtro
                  </button>

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
                      onClick={() => {
                        if (!user && restam === 0) {
                          setShowPaywall(true)
                          return
                        }
                        setClicarOrigem((v) => !v)
                      }}
                    >
                      {clicarOrigem ? 'Clique no mapa agora…' : 'Definir origem no mapa'}
                    </button>

                    <label className="mapa-frota__field mapa-pub__endereco">
                      <span>Endereço</span>
                      <div className="mapa-frota__row">
                        <MapaPubSuggestInput
                          value={enderecoOrigem}
                          onChange={(v) => {
                            setEnderecoOrigem(v)
                            setGeoErro('')
                          }}
                          onPick={(item) => {
                            setEnderecoOrigem(item.label)
                            if (item.lat != null && item.lng != null) {
                              definirOrigem(item.lat, item.lng, item.label)
                            } else {
                              void localizarPorEndereco(item.label)
                            }
                          }}
                          onSubmit={(v) => void localizarPorEndereco(v)}
                          localSuggestions={sugestoesEndereco}
                          minChars={2}
                          placeholder="Rua, cidade, CEP…"
                          disabled={!user && restam === 0}
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

                    {origemRaio ? (
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
                    ) : null}

                    {geoErro ? <p className="mapa-frota__geo-erro">{geoErro}</p> : null}

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

                  <button
                    type="button"
                    className="mapa-frota__clear mapa-frota__clear--wide"
                    onClick={limparFiltros}
                    disabled={!filtrosAtivos}
                  >
                    Limpar filtro
                  </button>
                  <p className="mapa-frota__result">
                    {filtrados.length} ponto{filtrados.length === 1 ? '' : 's'} no mapa
                  </p>
                </div>
              ) : null}
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

            {filtrados.length === 0 ? (
              <p className="mapa-frota__empty">
                Nenhum ponto com esses filtros. Ajuste cidade, região, raio ou tipo.
              </p>
            ) : null}
          </aside>

          <div className="mapa-frota__map-wrap">
            {clicarOrigem ? (
              <div className="mapa-frota__map-banner" role="status">
                Clique no mapa para definir a origem da busca em raio
              </div>
            ) : null}
            <div
              ref={mapEl}
              className="mapa-frota__map"
              role="application"
              aria-label="Mapa público da frota"
            />
            <div className="mapa-pub__map-links">
              <img className="mapa-pub__map-logo" src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" />
              <a
                className="mapa-pub__pill"
                href={URL_MAPA_LOGISTICA}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>Mapa da</span>
                <strong>Logística</strong>
              </a>
              <LinkRota className="mapa-pub__pill">
                <span>Calcular</span>
                <strong>rota</strong>
              </LinkRota>
            </div>
          </div>
        </div>
      </div>

      {showPaywall ? (
        <div className="mapa-pub-modal" role="dialog" aria-modal="true" aria-labelledby="mapa-pub-pay-title">
          <div className="mapa-pub-modal__card mapa-pub-modal__card--planos">
            <h2 id="mapa-pub-pay-title">Escolha um plano</h2>
            <p>
              As {MAPA_PUBLICO_LIMITE_BUSCAS} buscas grátis de hoje acabaram. Amanhã você tem mais
              duas, ou assine para buscar sem limite.
            </p>
            <div className="mapa-pub-planos">
              {PLANOS_PUBLICOS.map((plano) => (
                <article
                  key={plano.id}
                  className={`mapa-pub-plano${plano.destaque ? ' is-destaque' : ''}`}
                >
                  {plano.destaque ? <span className="mapa-pub-plano__tag">Mais escolhido</span> : null}
                  <h3>{plano.nome}</h3>
                  <p className="mapa-pub-plano__para">{plano.para}</p>
                  <p className="mapa-pub-plano__preco">
                    <strong>{plano.preco}</strong>
                    <small>{plano.periodo}</small>
                  </p>
                  <p className="mapa-pub-plano__extra">{plano.extra}</p>
                  <ul>
                    {plano.itens.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <LinkSistema
                    className="mapa-pub__btn mapa-pub__btn--solid"
                    to={`/cadastro-transportador?plano=${plano.id}`}
                  >
                    Assinar {plano.nome}
                  </LinkSistema>
                </article>
              ))}
            </div>
            <div className="mapa-pub-modal__acoes">
              <LinkSistema className="mapa-pub__btn mapa-pub__btn--ghost" to="/login">
                Já tenho conta
              </LinkSistema>
              <button type="button" className="mapa-pub-modal__fechar" onClick={() => setShowPaywall(false)}>
                Continuar só olhando o mapa
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
