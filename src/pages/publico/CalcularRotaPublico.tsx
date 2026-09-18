import { useEffect, useId, useRef, useState, Fragment, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpDown,
  Ban,
  Bike,
  Bus,
  Car,
  Check,
  ChevronDown,
  ChevronUp,
  Fuel,
  Gauge,
  GripVertical,
  LogIn,
  MapPin,
  Plus,
  RotateCcw,
  Route,
  Calculator,
  Timer,
  Truck,
  Wallet,
  X,
  Zap,
} from 'lucide-react'
import { formatCurrency } from '../../lib/businessRules'
import {
  calcularRotaOperacional,
  CATEGORIAS_ANTT,
  consumoPadraoKmL,
  eixosDoVeiculo,
  PRECO_DIESEL_SUGERIDO,
  type AnttCalculo,
  type PreferenciaRota,
} from '../../lib/anttFrete'
import { TIPOS_VEICULO } from '../../lib/tiposVeiculo'
import { LOGO_DOCA_LIVRE_SRC } from '../../lib/brandAssets'
import { LinkSistema, LinkMapaFrota, LinkMapaLogistica, LinkFreteMinimo } from '../../components/ui/HostLink'
import { isSiteOfertaDeCarga } from '../../lib/siteOfertaDeCarga'
import { lerPerfilLocal } from '../../lib/perfilLocal'
import { AddressSuggestInput } from '../../components/ui/AddressSuggestInput'
import { VeiculoSuggestInput } from '../../components/ui/VeiculoSuggestInput'
import { MapaFrotaAjuda } from '../../components/mapa/MapaFrotaAjuda'
import { RotaResultadoAcoes, RotaFaleConosco } from '../../components/carga/RotaResultadoAcoes'
import { RotaMapErroBoundary } from '../../components/carga/RotaMapErroBoundary'
import { RotaPaywallModal } from '../../components/carga/RotaPaywallModal'
import { RotaPresenteModal } from '../../components/carga/RotaPresenteModal'
import { RotaPublicoLoginModal } from '../../components/carga/RotaPublicoLogin'
import { useRotaPublicoAuth } from '../../lib/rotaPublicoAuth'
import type { SugestaoEndereco } from '../../lib/geocodeEndereco'
import { geocodificarConsulta, labelPorCoordenadas } from '../../lib/geocodeEndereco'
import {
  aplicarPontoNoMapa,
  novoIdVia,
  rotuloMarcarPontos,
  type AlvoRotaMarca,
} from '../../lib/rotaMarcarMapa'
import {
  consultarEstadoCalculosPublicos,
  estadoCalculosPublicos,
  isRotaPublicoIlimitado,
  registrarCalculoPublico,
  ROTA_PUBLICO_LIMITE_CALCULOS,
  type EstadoCalculosPublicos,
} from '../../lib/rotaPublicoCalculos'
import {
  marcarPresenteRotaVisto,
  presenteJaVistoLocal,
} from '../../lib/rotaPublicoCreditos'
import { lerRotaDaUrl, sincronizarBarraEndereco } from '../../lib/rotaShareUrl'
import {
  excluirRotaNesteAparelho,
  listarRotasNesteAparelho,
  type RotaSalvaLocal,
} from '../../lib/rotaResultadoAcoes'
import { RotaMapPreview } from '../../components/carga/RotaMapPreview'
import '../../styles/mapa-frota.css'
import '../../styles/mapa-publico.css'
import '../../styles/rota-publico.css'

type Coord = { lat: number; lng: number }
type Via = { id: string; endereco: string; lat?: number | null; lng?: number | null }

const PREFS: Array<[PreferenciaRota, string, typeof Zap]> = [
  ['eficiente', 'Rota eficiente', Zap],
  ['curta', 'Rota curta', Timer],
  ['evitar_pedagio', 'Evitar pedágios', Ban],
]

type TipoVeiculoUi = 'caminhao' | 'carro' | 'onibus' | 'moto'

const VEICULOS: Array<{
  id: TipoVeiculoUi
  eixos: number
  tipoCatalogo: string
  label: string
  Icon: typeof Truck
}> = [
  { id: 'caminhao', eixos: 6, tipoCatalogo: 'Carreta LS', label: 'Caminhão', Icon: Truck },
  { id: 'carro', eixos: 2, tipoCatalogo: 'Fiorino', label: 'Carro', Icon: Car },
  { id: 'onibus', eixos: 3, tipoCatalogo: 'Ônibus', label: 'Ônibus', Icon: Bus },
  { id: 'moto', eixos: 2, tipoCatalogo: 'Moto', label: 'Moto', Icon: Bike },
]

function iconeDoCatalogo(tipo: string): TipoVeiculoUi {
  const t = tipo.trim().toLowerCase()
  if (/moto|motocicleta|scooter/.test(t)) return 'moto'
  if (/[oô]nibus|\bbus\b/.test(t)) return 'onibus'
  if (t === 'fiorino' || t === 'carro' || /autom[oó]vel|passeio/.test(t)) return 'carro'
  return 'caminhao'
}

function tipoCatalogoExato(nome: string): boolean {
  const q = nome.trim().toLowerCase()
  return TIPOS_VEICULO.some((t) => t.toLowerCase() === q)
}

function parseNumBr(raw: string, fallback: number): number {
  const n = Number(String(raw).trim().replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function fmtConsumo(n: number): string {
  return String(n).replace('.', ',')
}

function fmtDiesel(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const COTA_ILIMITADA: EstadoCalculosPublicos = {
  usadas: 0,
  restamGratis: ROTA_PUBLICO_LIMITE_CALCULOS,
  creditos: 0,
  restam: ROTA_PUBLICO_LIMITE_CALCULOS,
  esgotado: false,
}

function rotuloCotaPublica(ilimitado: boolean, cota: EstadoCalculosPublicos) {
  if (ilimitado) return 'Ilimitado'
  if (cota.restamGratis > 0) return `${cota.restamGratis} de ${ROTA_PUBLICO_LIMITE_CALCULOS} grátis`
  if (cota.creditos > 0) return `${cota.creditos} crédito${cota.creditos === 1 ? '' : 's'}`
  return 'Sem créditos — compre mais'
}

const PREF_LABEL: Record<PreferenciaRota, string> = {
  eficiente: 'Rota eficiente',
  curta: 'Rota curta',
  evitar_pedagio: 'Evitar pedágios',
}

type ResultadoSnap = {
  origem: string
  destino: string
  vias: { endereco: string; lat?: number | null; lng?: number | null }[]
  origemCoords: Coord | null
  destinoCoords: Coord | null
  tipoVeiculo: string
  classe: string
  eixos: number
  idaEVolta: boolean
  preferencia: PreferenciaRota
}

function novaVia(): Via {
  return { id: novoIdVia(), endereco: '' }
}

export function CalcularRotaPublicoPage({ modoSistema = false }: { modoSistema?: boolean } = {}) {
  const user = lerPerfilLocal()
  const formId = useId()
  const reqId = useRef(0)
  const userRef = useRef(user)
  const cotaBusyRef = useRef(false)
  const paywallEsgotadoMostrado = useRef(false)
  const paywallAuto = useRef(false)
  userRef.current = user

  const [origem, setOrigem] = useState('')
  const [destino, setDestino] = useState('')
  const [origemCoords, setOrigemCoords] = useState<Coord | null>(null)
  const [destinoCoords, setDestinoCoords] = useState<Coord | null>(null)
  const [pickMode, setPickMode] = useState<string | null>(null)
  const pickBusy = useRef(false)
  const hidratouUrl = useRef(false)
  const [vias, setVias] = useState<Via[]>([])
  const [tipoVeiculo, setTipoVeiculo] = useState<TipoVeiculoUi>('caminhao')
  const [tipoVeiculoNome, setTipoVeiculoNome] = useState('Carreta LS')
  const [categoriaCargaId, setCategoriaCargaId] = useState<number | ''>('')
  const [eixos, setEixos] = useState(6)
  const [eixosTick, setEixosTick] = useState(0)
  const [eixosDir, setEixosDir] = useState<'up' | 'down'>('up')
  const [consumo, setConsumo] = useState(() => fmtConsumo(consumoPadraoKmL(6)))
  const [precoDiesel, setPrecoDiesel] = useState(() => fmtDiesel(PRECO_DIESEL_SUGERIDO))
  const [idaEVolta, setIdaEVolta] = useState(false)
  const [preferencia, setPreferencia] = useState<PreferenciaRota>('eficiente')
  const [formAberto, setFormAberto] = useState(true)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [calc, setCalc] = useState<AnttCalculo | null>(null)
  const [mapId, setMapId] = useState(0)
  const [entrarId, setEntrarId] = useState(0)
  const ilimitado = modoSistema || Boolean(user) || isRotaPublicoIlimitado()
  const googleAuth = useRotaPublicoAuth()
  const [cota, setCota] = useState<EstadoCalculosPublicos>(() =>
    ilimitado ? COTA_ILIMITADA : estadoCalculosPublicos(),
  )
  const [cotaPronta, setCotaPronta] = useState(() => ilimitado)
  const [showPaywall, setShowPaywall] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [presente, setPresente] = useState<{ creditos: number; ids: string[] } | null>(null)
  const [showResultado, setShowResultado] = useState(false)
  const [snap, setSnap] = useState<ResultadoSnap | null>(null)
  const [rotasSalvas, setRotasSalvas] = useState<RotaSalvaLocal[]>(() => listarRotasNesteAparelho())
  const [draggingViaId, setDraggingViaId] = useState<string | null>(null)
  const [overStop, setOverStop] = useState<string | null>(null)
  const dragViaRef = useRef<string | null>(null)
  const overStopRef = useRef<string | null>(null)
  const stopsRef = useRef({
    origem: '',
    destino: '',
    origemCoords: null as Coord | null,
    destinoCoords: null as Coord | null,
    vias: [] as Via[],
  })
  stopsRef.current = { origem, destino, origemCoords, destinoCoords, vias }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    document.title = modoSistema ? 'Calcular rota' : 'Calcular rota — Oferta de Carga'
  }, [modoSistema])

  useEffect(() => {
    if (ilimitado) setCota(COTA_ILIMITADA)
  }, [ilimitado])

  useEffect(() => {
    let alive = true
    async function checar() {
      const estado = await consultarEstadoCalculosPublicos()
      if (!alive) return
      if (!ilimitado) setCota(estado)
      setCotaPronta(true)
      const n = estado.presente || 0
      const ids = estado.presenteIds || []
      if (n > 0 && ids.length > 0 && !presenteJaVistoLocal(ids)) {
        setPresente({ creditos: n, ids })
      }
    }
    if (ilimitado && !googleAuth.conta) return
    void checar()
    const onVis = () => {
      if (document.visibilityState === 'visible') void checar()
    }
    document.addEventListener('visibilitychange', onVis)
    const t = window.setInterval(() => {
      if (googleAuth.conta) void checar()
    }, 45000)
    const fallback = window.setTimeout(() => {
      if (alive) setCotaPronta(true)
    }, 4000)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(t)
      window.clearTimeout(fallback)
    }
  }, [ilimitado, googleAuth.conta?.id])

  function abrirPaywall() {
    paywallAuto.current = false
    setShowPaywall(true)
  }

  useEffect(() => {
    if (ilimitado) return
    if (cota.restam > 0) {
      if (paywallAuto.current) {
        paywallAuto.current = false
        setShowPaywall(false)
      }
      paywallEsgotadoMostrado.current = false
      return
    }
    if (!cotaPronta || paywallEsgotadoMostrado.current) return
    paywallEsgotadoMostrado.current = true
    paywallAuto.current = true
    setShowPaywall(true)
  }, [ilimitado, cota.restam, cotaPronta])

  useEffect(() => {
    setConsumo(fmtConsumo(consumoPadraoKmL(eixos)))
  }, [eixos])

  function pickOrigem(sug: SugestaoEndereco) {
    setOrigem(sug.label)
    if (Number.isFinite(sug.lat) && Number.isFinite(sug.lng)) {
      setOrigemCoords({ lat: sug.lat, lng: sug.lng })
    }
  }

  function pickDestino(sug: SugestaoEndereco) {
    setDestino(sug.label)
    if (Number.isFinite(sug.lat) && Number.isFinite(sug.lng)) {
      setDestinoCoords({ lat: sug.lat, lng: sug.lng })
    }
  }

  function armarCampo(alvo: AlvoRotaMarca) {
    setPickMode(alvo === 'auto' ? null : alvo)
    setShowResultado(false)
    setFormAberto(true)
  }

  function iniciarMarcacaoNoMapa() {
    setShowResultado(false)
    setFormAberto(true)
    setPickMode(null)
  }

  function aplicarEstadoRota(estado: {
    origem: string
    destino: string
    origemCoords: Coord | null
    destinoCoords: Coord | null
    vias: Via[]
  }) {
    setOrigem(estado.origem)
    setDestino(estado.destino)
    setOrigemCoords(estado.origemCoords)
    setDestinoCoords(estado.destinoCoords)
    setVias(estado.vias)
  }

  async function marcarPontoNoMapa(ponto: string, lat: number, lng: number, origemCli: 'click' | 'drag' = 'click') {
    if (pickBusy.current) return
    pickBusy.current = true
    try {
      const label = await labelPorCoordenadas(lat, lng)
      const r = aplicarPontoNoMapa(stopsRef.current, {
        alvo: (ponto || 'auto') as AlvoRotaMarca,
        label,
        lat,
        lng,
        novaViaId: novoIdVia,
        arrastar: origemCli === 'drag',
      })
      aplicarEstadoRota(r.estado)
      setPickMode(r.proximoAlvo === 'auto' ? null : r.proximoAlvo)
      if (r.calcular) {
        void calcular({
          origem: r.estado.origem,
          destino: r.estado.destino,
          origemCoords: r.estado.origemCoords,
          destinoCoords: r.estado.destinoCoords,
          vias: r.estado.vias,
        })
      }
    } finally {
      pickBusy.current = false
    }
  }

  function recalcularSequencia(estado: {
    origem: string
    destino: string
    origemCoords: Coord | null
    destinoCoords: Coord | null
    vias: Via[]
  }) {
    if (estado.origem.trim().length < 3 || estado.destino.trim().length < 3) return
    void calcular({
      origem: estado.origem,
      destino: estado.destino,
      origemCoords: estado.origemCoords,
      destinoCoords: estado.destinoCoords,
      vias: estado.vias,
      pularCota: mapId > 0,
      pularMergulho: true,
    })
  }

  function trocarPontos() {
    const o = destino
    const d = origem
    const oC = destinoCoords
    const dC = origemCoords
    setOrigem(o)
    setDestino(d)
    setOrigemCoords(oC)
    setDestinoCoords(dC)
    recalcularSequencia({
      origem: o,
      destino: d,
      origemCoords: oC,
      destinoCoords: dC,
      vias,
    })
  }

  function coordsStop(lat: number | null | undefined, lng: number | null | undefined): Coord | null {
    if (lat == null || lng == null) return null
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  }

  function alvoSobPonteiro(clientY: number) {
    const nodes = document.querySelectorAll<HTMLElement>('[data-rota-stop]')
    const seen = new Map<string, DOMRect>()
    nodes.forEach((n) => {
      const k = n.getAttribute('data-rota-stop')
      if (!k) return
      const r = n.getBoundingClientRect()
      const prev = seen.get(k)
      if (!prev || r.height > prev.height) seen.set(k, r)
    })
    let best: string | null = null
    let bestDist = Infinity
    for (const [k, r] of seen) {
      const mid = r.top + r.height / 2
      const dist = Math.abs(mid - clientY)
      if (dist < bestDist) {
        bestDist = dist
        best = k
      }
    }
    return best
  }

  function moverViaPara(viaId: string, alvo: string) {
    if (!viaId || viaId === alvo) return
    const s = stopsRef.current
    const lista = [
      {
        key: 'A',
        endereco: s.origem,
        lat: s.origemCoords?.lat ?? null,
        lng: s.origemCoords?.lng ?? null,
      },
      ...s.vias.map((v) => ({
        key: v.id,
        endereco: v.endereco,
        lat: v.lat ?? null,
        lng: v.lng ?? null,
      })),
      {
        key: 'B',
        endereco: s.destino,
        lat: s.destinoCoords?.lat ?? null,
        lng: s.destinoCoords?.lng ?? null,
      },
    ]
    const from = lista.findIndex((x) => x.key === viaId)
    const to = lista.findIndex((x) => x.key === alvo)
    if (from < 0 || to < 0) return
    const next = [...lista]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    if (next.length < 2) return
    const first = next[0]
    const last = next[next.length - 1]
    const middle = next.slice(1, -1)
    const oC = coordsStop(first.lat, first.lng)
    const dC = coordsStop(last.lat, last.lng)
    const novasVias = middle.map((p) => ({
      id: p.key === 'A' || p.key === 'B' ? novaVia().id : p.key,
      endereco: p.endereco,
      lat: p.lat,
      lng: p.lng,
    }))
    setOrigem(first.endereco)
    setOrigemCoords(oC)
    setDestino(last.endereco)
    setDestinoCoords(dC)
    setVias(novasVias)
    recalcularSequencia({
      origem: first.endereco,
      destino: last.endereco,
      origemCoords: oC,
      destinoCoords: dC,
      vias: novasVias,
    })
  }

  function iniciarArrasteVia(e: ReactPointerEvent<HTMLElement>, viaId: string) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragViaRef.current = viaId
    overStopRef.current = viaId
    setDraggingViaId(viaId)
    setOverStop(viaId)
  }

  function moverArrasteVia(e: ReactPointerEvent<HTMLElement>) {
    if (!dragViaRef.current) return
    const alvo = alvoSobPonteiro(e.clientY)
    if (!alvo) return
    overStopRef.current = alvo
    setOverStop(alvo)
  }

  function soltarArrasteVia() {
    const from = dragViaRef.current
    const to = overStopRef.current
    dragViaRef.current = null
    overStopRef.current = null
    setDraggingViaId(null)
    setOverStop(null)
    if (from && to) moverViaPara(from, to)
  }

  function mudarEixos(proximo: number) {
    const n = Math.min(9, Math.max(2, proximo))
    if (n === eixos) return
    setEixosDir(n > eixos ? 'up' : 'down')
    setEixos(n)
    setEixosTick((t) => t + 1)
  }

  function escolherVeiculo(tipo: TipoVeiculoUi) {
    const item = VEICULOS.find((v) => v.id === tipo)
    if (!item) return
    setTipoVeiculo(tipo)
    setTipoVeiculoNome(item.tipoCatalogo)
    mudarEixos(item.eixos)
  }

  function escolherTipoCatalogo(nome: string) {
    setTipoVeiculoNome(nome)
    const t = nome.trim().toLowerCase()
    const doCatalogo = tipoCatalogoExato(nome)
    const classeExtra = t === 'ônibus' || t === 'onibus' || t === 'moto' || t === 'carro'
    if (!doCatalogo && !classeExtra) return
    setTipoVeiculo(iconeDoCatalogo(nome))
    if (doCatalogo) {
      mudarEixos(eixosDoVeiculo(nome))
      return
    }
    if (t === 'ônibus' || t === 'onibus') mudarEixos(3)
    else mudarEixos(2)
  }

  function limparRota() {
    setOrigem('')
    setDestino('')
    setOrigemCoords(null)
    setDestinoCoords(null)
    setVias([])
    setCalc(null)
    setErro('')
    setMapId(0)
    setShowResultado(false)
    setSnap(null)
    setPickMode(null)
    setEntrarId(0)
  }

  async function consumirCalculo(): Promise<boolean> {
    if (modoSistema || userRef.current || isRotaPublicoIlimitado()) return true
    if (cotaBusyRef.current) return false
    cotaBusyRef.current = true
    try {
      const consumoCota = await registrarCalculoPublico()
      setCota(consumoCota)
      if (!consumoCota.ok) {
        if ((consumoCota.creditos || 0) > 0 || consumoCota.motivo === 'ritmo') {
          setErro('Não foi possível usar 1 crédito agora. Clique em Calcular de novo.')
          return false
        }
        abrirPaywall()
        return false
      }
      return true
    } finally {
      cotaBusyRef.current = false
    }
  }

  async function calcular(opts?: {
    origem?: string
    destino?: string
    origemCoords?: Coord | null
    destinoCoords?: Coord | null
    vias?: Via[]
    eixos?: number
    consumoKmL?: number | null
    precoDiesel?: number | null
    idaEVolta?: boolean
    preferencia?: PreferenciaRota
    categoriaId?: number | null
    pularCota?: boolean
    pularMergulho?: boolean
  }) {
    const oTxt = (opts?.origem ?? origem).trim()
    const dTxt = (opts?.destino ?? destino).trim()
    const oHint = opts?.origemCoords !== undefined ? opts.origemCoords : origemCoords
    const dHint = opts?.destinoCoords !== undefined ? opts.destinoCoords : destinoCoords
    const ex = opts?.eixos ?? eixos
    const volta = opts?.idaEVolta ?? idaEVolta
    const pref = opts?.preferencia ?? preferencia
    const cat = opts?.categoriaId !== undefined ? opts.categoriaId : categoriaCargaId === '' ? null : categoriaCargaId
    const consKmL = opts?.consumoKmL ?? parseNumBr(consumo, consumoPadraoKmL(ex))
    const diesel = opts?.precoDiesel ?? parseNumBr(precoDiesel, PRECO_DIESEL_SUGERIDO)
    const listaVias = opts?.vias ?? vias
    if (oTxt.length < 3 || dTxt.length < 3) {
      setErro('Informe origem e destino.')
      return
    }
    setErro('')
    if (!opts?.pularMergulho) setEntrarId((n) => n + 1)
    setMapId((n) => n + 1)
    void (async () => {
      if (!oHint) {
        const g = await geocodificarConsulta(oTxt)
        if (g.ok) setOrigemCoords(g.coords)
      }
      if (!dHint) {
        const g = await geocodificarConsulta(dTxt)
        if (g.ok) setDestinoCoords(g.coords)
      }
    })()
    if (!opts?.pularCota && !(await consumirCalculo())) {
      setEntrarId(0)
      setMapId(0)
      return
    }
    const id = ++reqId.current
    setBusy(true)
    const waypoints = listaVias
      .map((v) => ({
        endereco: v.endereco.trim(),
        lat: v.lat,
        lng: v.lng,
      }))
      .filter(
        (v) =>
          v.endereco.length >= 3 ||
          (v.lat != null && v.lng != null && Number.isFinite(v.lat) && Number.isFinite(v.lng)),
      )
    const res = await Promise.race([
      calcularRotaOperacional({
        origem: oTxt,
        destino: dTxt,
        eixos: ex,
        consumoKmL: consKmL,
        precoDiesel: diesel,
        idaEVolta: volta,
        preferencia: pref,
        categoriaId: cat,
        waypoints,
        origemCoords: oHint,
        destinoCoords: dHint,
      }),
      new Promise<{ ok: false; erro: string }>((resolve) => {
        window.setTimeout(
          () => resolve({ ok: false, erro: 'O cálculo demorou demais. Tente de novo.' }),
          25000,
        )
      }),
    ])
    if (id !== reqId.current) return
    setBusy(false)
    if (!res.ok) {
      setErro(res.erro)
      setCalc(null)
      setShowResultado(false)
      setSnap(null)
      setEntrarId(0)
      setMapId(0)
      return
    }
    setCalc(res.data)
    setSnap({
      origem: oTxt,
      destino: dTxt,
      vias: waypoints.filter((v) => v.endereco.trim()),
      origemCoords: oHint,
      destinoCoords: dHint,
      tipoVeiculo: tipoVeiculoNome.trim() || VEICULOS.find((v) => v.id === tipoVeiculo)?.label || '—',
      classe: VEICULOS.find((v) => v.id === tipoVeiculo)?.label ?? '',
      eixos: ex,
      idaEVolta: volta,
      preferencia: pref,
    })
    setShowResultado(true)
    setFormAberto(false)
    if (!modoSistema) {
      sincronizarBarraEndereco({
        origem: oTxt,
        destino: dTxt,
        vias: waypoints,
        origemCoords: oHint,
        destinoCoords: dHint,
        tipoVeiculo: tipoVeiculoNome.trim() || undefined,
        idaEVolta: volta,
        preferencia: pref,
        eixos: ex,
        categoriaId: cat,
        consumoKmL: consKmL,
        precoDiesel: diesel,
      })
    }
  }

  useEffect(() => {
    if (hidratouUrl.current) return
    const dados = lerRotaDaUrl()
    if (!dados) return
    hidratouUrl.current = true
    setOrigem(dados.origem)
    setDestino(dados.destino)
    setOrigemCoords(dados.origemCoords ?? null)
    setDestinoCoords(dados.destinoCoords ?? null)
    if (dados.vias && dados.vias.length > 0) {
      setVias(
        dados.vias.map((v) => ({
          ...novaVia(),
          endereco: v.endereco,
          lat: v.lat ?? null,
          lng: v.lng ?? null,
        })),
      )
    }
    if (dados.tipoVeiculo) {
      setTipoVeiculoNome(dados.tipoVeiculo)
      setTipoVeiculo(iconeDoCatalogo(dados.tipoVeiculo))
    }
    if (dados.eixos) {
      setEixos(dados.eixos)
    }
    if (dados.categoriaId) setCategoriaCargaId(dados.categoriaId)
    if (dados.idaEVolta) setIdaEVolta(true)
    if (
      dados.preferencia === 'eficiente' ||
      dados.preferencia === 'curta' ||
      dados.preferencia === 'evitar_pedagio'
    ) {
      setPreferencia(dados.preferencia)
    }
    if (dados.consumoKmL) setConsumo(fmtConsumo(dados.consumoKmL))
    if (dados.precoDiesel) setPrecoDiesel(fmtDiesel(dados.precoDiesel))
    void calcular({
      origem: dados.origem,
      destino: dados.destino,
      origemCoords: dados.origemCoords ?? null,
      destinoCoords: dados.destinoCoords ?? null,
      vias: (dados.vias ?? []).map((v) => ({
        id: novaVia().id,
        endereco: v.endereco,
        lat: v.lat ?? null,
        lng: v.lng ?? null,
      })),
      eixos: dados.eixos,
      consumoKmL: dados.consumoKmL,
      precoDiesel: dados.precoDiesel,
      idaEVolta: dados.idaEVolta,
      preferencia:
        dados.preferencia === 'curta' || dados.preferencia === 'evitar_pedagio'
          ? dados.preferencia
          : 'eficiente',
      categoriaId: dados.categoriaId ?? null,
      pularCota: true,
    })
    // Só na abertura do link compartilhado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function abrirRotaSalva(r: RotaSalvaLocal) {
    setOrigem(r.origem)
    setDestino(r.destino)
    setOrigemCoords(r.origemCoords ?? null)
    setDestinoCoords(r.destinoCoords ?? null)
    setVias(
      (r.vias ?? [])
        .filter((v) => (v.endereco || '').trim())
        .map((v) => ({
          ...novaVia(),
          endereco: v.endereco,
          lat: v.lat ?? null,
          lng: v.lng ?? null,
        })),
    )
    if (r.tipoVeiculo) {
      setTipoVeiculoNome(r.tipoVeiculo)
      setTipoVeiculo(iconeDoCatalogo(r.tipoVeiculo))
    }
    if (r.eixos) setEixos(r.eixos)
    if (r.categoriaId) setCategoriaCargaId(r.categoriaId)
    if (r.idaEVolta != null) setIdaEVolta(Boolean(r.idaEVolta))
    if (
      r.preferencia === 'eficiente' ||
      r.preferencia === 'curta' ||
      r.preferencia === 'evitar_pedagio'
    ) {
      setPreferencia(r.preferencia)
    }
    if (r.consumoKmL) setConsumo(fmtConsumo(r.consumoKmL))
    if (r.precoDiesel) setPrecoDiesel(fmtDiesel(r.precoDiesel))
    setFormAberto(false)
    void calcular({
      origem: r.origem,
      destino: r.destino,
      origemCoords: r.origemCoords ?? null,
      destinoCoords: r.destinoCoords ?? null,
      vias: (r.vias ?? []).map((v) => ({
        id: novaVia().id,
        endereco: v.endereco,
        lat: v.lat ?? null,
        lng: v.lng ?? null,
      })),
      eixos: r.eixos,
      consumoKmL: r.consumoKmL,
      precoDiesel: r.precoDiesel,
      idaEVolta: r.idaEVolta,
      preferencia:
        r.preferencia === 'curta' || r.preferencia === 'evitar_pedagio'
          ? r.preferencia
          : 'eficiente',
      categoriaId: r.categoriaId ?? null,
    })
  }

  const logado = Boolean(user)
  const viasValidas = vias.filter(
    (v) =>
      v.endereco.trim().length >= 3 ||
      (v.lat != null && v.lng != null && Number.isFinite(v.lat) && Number.isFinite(v.lng)),
  )
  const botaoMarcarNoMapa = (
    <button
      type="button"
      className={`rota-pub__no-mapa${pickMode ? ' is-on' : ''}`}
      title="Marcar pontos no mapa"
      onClick={iniciarMarcacaoNoMapa}
    >
      <MapPin size={14} />
      {rotuloMarcarPontos(pickMode)}
    </button>
  )

  return (
    <div className={`mapa-pub rota-pub${modoSistema ? ' rota-pub--sistema' : ''}`}>
      {modoSistema ? null : (
      <header className="mapa-pub__top">
        <Link to={isSiteOfertaDeCarga() ? '/' : '/rota'} className="mapa-pub__brand">
          <img src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" />
          <strong>Oferta de carga</strong>
        </Link>
        <div className="mapa-pub__top-actions">
          <LinkMapaLogistica className="mapa-pub__btn mapa-pub__btn--ghost">
            Mapa da Logística
          </LinkMapaLogistica>
          <LinkMapaFrota className="mapa-pub__btn mapa-pub__btn--ghost">
            Mapa da Frota
          </LinkMapaFrota>
          {logado ? (
            <LinkSistema
              className="mapa-pub__btn mapa-pub__btn--solid"
              to={user?.role === 'transportador' ? '/transportador' : '/embarcador'}
            >
              Ir para o sistema
            </LinkSistema>
          ) : googleAuth.conta ? (
            <div className="mapa-pub-conta">
              {googleAuth.conta.foto ? (
                <img src={googleAuth.conta.foto} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="mapa-pub-conta__iniciais" aria-hidden>
                  {googleAuth.conta.nome.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span>
                {googleAuth.conta.nome.split(/\s+/)[0]}
                {cota.creditos > 0 ? ` · ${cota.creditos} crédito${cota.creditos === 1 ? '' : 's'}` : ''}
              </span>
              <button type="button" className="mapa-pub__btn mapa-pub__btn--ghost" onClick={() => void googleAuth.sair()}>
                Sair
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="mapa-pub__btn mapa-pub__btn--solid"
                onClick={() => setShowLogin(true)}
              >
                <LogIn size={15} strokeWidth={2.4} />
                Entrar
              </button>
              <LinkSistema className="mapa-pub__btn mapa-pub__btn--ghost" to="/login">
                Sistema
              </LinkSistema>
            </>
          )}
        </div>
      </header>
      )}

      <div className="mapa-frota mapa-pub__shell">
        {!modoSistema && !ilimitado && cotaPronta && cota.restam === 0 ? (
          <div className="mapa-pub__cta-esgotado">
            <span>Seus créditos acabaram. Compre mais no PIX para continuar calculando, ou assine um plano.</span>
            <button type="button" onClick={abrirPaywall}>
              Comprar mais créditos
            </button>
          </div>
        ) : null}

        <div className="mapa-frota__layout">
          <aside className="mapa-frota__lista rota-pub__panel">
            <div className="rota-pub__hero">
              <div className="rota-pub__hero-top">
                <p className="rota-pub__kicker">Pedágio · km · combustível</p>
                <div className="rota-pub__hero-cota">
                  <p className="rota-pub__badge">{rotuloCotaPublica(ilimitado, cota)}</p>
                  {!modoSistema && !ilimitado ? (
                    <button type="button" className="rota-pub__beneficios" onClick={abrirPaywall}>
                      Conheça os benefícios
                    </button>
                  ) : null}
                </div>
              </div>
              <h1>Calcular rota</h1>
            </div>
            <LinkFreteMinimo
              className="rota-pub__frete-link"
              km={calc?.rota.distancia_km ?? null}
              eixos={eixos}
              cat={categoriaCargaId}
              pedagio={calc?.rota.pedagio ?? null}
            >
              <Calculator size={20} strokeWidth={2.4} />
              Calculadora de Frete
            </LinkFreteMinimo>
            <div className={`rota-pub__form-wrap${formAberto ? '' : ' is-collapsed'}`}>
              <div className="rota-pub__card-top">
                <button
                  type="button"
                  className="mapa-frota__search-toggle"
                  aria-expanded={formAberto}
                  onClick={() => setFormAberto((v) => !v)}
                >
                  <span className="mapa-frota__cats-title">Trajeto</span>
                  {!formAberto ? (
                    <span className="mapa-frota__search-resumo">
                      {origem.trim() || destino.trim()
                        ? `${origem.trim() || '…'} → ${destino.trim() || '…'}`
                        : 'Preencher'}
                    </span>
                  ) : null}
                  <span className={`mapa-frota__search-chevron${formAberto ? ' is-open' : ''}`} aria-hidden>
                    ▾
                  </span>
                </button>
                <button
                  type="button"
                  className="rota-pub__reset"
                  title="Limpar origem e destino"
                  onClick={limparRota}
                >
                  <RotateCcw size={17} />
                </button>
              </div>
              {!formAberto ? botaoMarcarNoMapa : null}

              {formAberto ? (
                <>
                <div className={`rota-pub__form${vias.length > 0 || rotasSalvas.length > 0 ? ' is-long' : ''}`}>
                  <div className={`rota-pub__ab${draggingViaId ? ' is-sorting' : ''}`}>
                    <span
                      className={`rota-pub__pin rota-pub__pin--a${overStop === 'A' ? ' is-over' : ''}`}
                      data-rota-stop="A"
                      title="Arrastar para reordenar"
                      onPointerDown={(e) => iniciarArrasteVia(e, 'A')}
                      onPointerMove={moverArrasteVia}
                      onPointerUp={soltarArrasteVia}
                      onPointerCancel={soltarArrasteVia}
                    >
                      A
                    </span>
                    <div
                      className={`rota-pub__campo${overStop === 'A' ? ' is-over' : ''}`}
                      data-rota-stop="A"
                    >
                      <AddressSuggestInput
                        value={origem}
                        onChange={(v) => {
                          setOrigem(v)
                          setOrigemCoords(null)
                        }}
                        onPick={pickOrigem}
                        onFocus={() => armarCampo('A')}
                        placeholder="Origem"
                        className="rota-pub__input"
                      />
                      <button
                        type="button"
                        className={`rota-pub__campo-btn${pickMode === 'A' ? ' is-on' : ''}`}
                        title="Marcar origem (ponto A) no mapa"
                        onClick={() => armarCampo(pickMode === 'A' ? 'auto' : 'A')}
                      >
                        <MapPin size={18} />
                      </button>
                    </div>
                    <div className="rota-pub__join">
                      <span className="rota-pub__dots" />
                      <button
                        type="button"
                        className="rota-pub__swap"
                        title="Inverter origem e destino"
                        onClick={trocarPontos}
                      >
                        <ArrowUpDown size={16} />
                      </button>
                      <span className="rota-pub__dots" />
                    </div>
                    {vias.map((via, idx) => (
                      <Fragment key={via.id}>
                        {idx > 0 ? (
                          <div className="rota-pub__join">
                            <span className="rota-pub__dots" />
                          </div>
                        ) : null}
                        <span
                          className={`rota-pub__pin rota-pub__pin--via${overStop === via.id ? ' is-over' : ''}`}
                          data-rota-stop={via.id}
                          title="Arrastar para reordenar"
                          onPointerDown={(e) => iniciarArrasteVia(e, via.id)}
                          onPointerMove={moverArrasteVia}
                          onPointerUp={soltarArrasteVia}
                          onPointerCancel={soltarArrasteVia}
                        >
                          {idx + 1}
                        </span>
                        <div
                          className={`rota-pub__via${draggingViaId === via.id ? ' is-dragging' : ''}${overStop === via.id ? ' is-over' : ''}`}
                          data-rota-stop={via.id}
                        >
                          <div className="rota-pub__campo">
                            <AddressSuggestInput
                              value={via.endereco}
                              onChange={(v) =>
                                setVias((lista) =>
                                  lista.map((x) => {
                                    if (x.id !== via.id) return x
                                    if (v === x.endereco) return x
                                    return { ...x, endereco: v, lat: null, lng: null }
                                  }),
                                )
                              }
                              onPick={(sug) =>
                                setVias((lista) =>
                                  lista.map((x) =>
                                    x.id === via.id
                                      ? {
                                          ...x,
                                          endereco: sug.label,
                                          lat: Number.isFinite(sug.lat) ? sug.lat : null,
                                          lng: Number.isFinite(sug.lng) ? sug.lng : null,
                                        }
                                      : x,
                                  ),
                                )
                              }
                              onFocus={() => armarCampo(via.id)}
                              placeholder="Ponto de passagem"
                              className="rota-pub__input"
                            />
                          </div>
                          <button
                            type="button"
                            className="rota-pub__via-drag"
                            title="Arrastar para reordenar"
                            aria-label="Arrastar ponto de passagem para reordenar"
                            onPointerDown={(e) => iniciarArrasteVia(e, via.id)}
                            onPointerMove={moverArrasteVia}
                            onPointerUp={soltarArrasteVia}
                            onPointerCancel={soltarArrasteVia}
                          >
                            <GripVertical size={18} />
                          </button>
                          <button
                            type="button"
                            className="rota-pub__via-del"
                            title="Remover ponto"
                            onClick={() => {
                              const next = vias.filter((x) => x.id !== via.id)
                              setVias(next)
                              recalcularSequencia({
                                origem,
                                destino,
                                origemCoords,
                                destinoCoords,
                                vias: next,
                              })
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </Fragment>
                    ))}
                    {vias.length > 0 ? (
                      <div className="rota-pub__join">
                        <span className="rota-pub__dots" />
                      </div>
                    ) : null}
                    <span
                      className={`rota-pub__pin rota-pub__pin--b${overStop === 'B' ? ' is-over' : ''}`}
                      data-rota-stop="B"
                      title="Arrastar para reordenar"
                      onPointerDown={(e) => iniciarArrasteVia(e, 'B')}
                      onPointerMove={moverArrasteVia}
                      onPointerUp={soltarArrasteVia}
                      onPointerCancel={soltarArrasteVia}
                    >
                      B
                    </span>
                    <div
                      className={`rota-pub__campo${overStop === 'B' ? ' is-over' : ''}`}
                      data-rota-stop="B"
                    >
                      <AddressSuggestInput
                        value={destino}
                        onChange={(v) => {
                          setDestino(v)
                          setDestinoCoords(null)
                        }}
                        onPick={pickDestino}
                        onFocus={() => armarCampo('B')}
                        placeholder="Destino"
                        className="rota-pub__input"
                      />
                      <button
                        type="button"
                        className={`rota-pub__campo-btn${pickMode === 'B' ? ' is-on' : ''}`}
                        title="Marcar destino (ponto B) no mapa"
                        onClick={() => armarCampo(pickMode === 'B' ? 'auto' : 'B')}
                      >
                        <MapPin size={18} />
                      </button>
                      <button
                        type="button"
                        className="rota-pub__campo-btn"
                        title="Adicionar ponto de passagem"
                        onClick={() => setVias((lista) => [...lista, novaVia()])}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>

                  {botaoMarcarNoMapa}

                  {rotasSalvas.length > 0 ? (
                    <div className="rota-pub__salvas">
                      <p className="rota-pub__sec">Salvas neste aparelho</p>
                      {rotasSalvas.map((r) => (
                        <div key={r.id} className="rota-pub__salva">
                          <button
                            type="button"
                            className="rota-pub__salva-abrir"
                            title="Abrir rota salva"
                            onClick={() => abrirRotaSalva(r)}
                          >
                            <strong>
                              {r.origem} → {r.destino}
                            </strong>
                            <small>
                              {r.km ? `${r.km} km` : 'Rota'}
                              {r.tipoVeiculo ? ` · ${r.tipoVeiculo}` : ''}
                            </small>
                          </button>
                          <button
                            type="button"
                            className="rota-pub__salva-del"
                            title="Remover rota salva"
                            onClick={() => setRotasSalvas(excluirRotaNesteAparelho(r.id))}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <p className="rota-pub__sec">Veículo</p>
                  <div className="rota-pub__catalogo">
                    <div className="rota-pub__field">
                      <div className="rota-pub__field-head">
                        <span>Tipo de veículo</span>
                        <em>{(TIPOS_VEICULO ?? []).length} cadastrados</em>
                      </div>
                      <VeiculoSuggestInput
                        value={tipoVeiculoNome}
                        onChange={escolherTipoCatalogo}
                        className="rota-pub__select"
                      />
                    </div>
                    <label className="rota-pub__field">
                      <span className="rota-pub__field-head">
                        <span>Categoria da carga</span>
                      </span>
                      <select
                        className="rota-pub__select"
                        value={categoriaCargaId === '' ? '' : String(categoriaCargaId)}
                        onChange={(e) => {
                          const v = e.target.value
                          setCategoriaCargaId(v ? Number(v) : '')
                        }}
                      >
                        <option value="">Selecione a categoria da carga</option>
                        {(CATEGORIAS_ANTT ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="rota-pub__veiculos">
                    <div className="rota-pub__tipos" role="group" aria-label="Classe do veículo">
                      {VEICULOS.map(({ id, label, Icon }) => (
                        <button
                          key={id}
                          type="button"
                          title={label}
                          className={`rota-pub__tipo${tipoVeiculo === id ? ' is-on' : ''}`}
                          onClick={() => escolherVeiculo(id)}
                        >
                          <Icon size={24} strokeWidth={2.2} />
                          <small>{label}</small>
                        </button>
                      ))}
                    </div>
                    <div className="rota-pub__eixos">
                      <button type="button" title="Mais eixos" onClick={() => mudarEixos(eixos + 1)}>
                        <ChevronUp size={18} />
                      </button>
                      <strong key={eixosTick} className={`rota-pub__eixos-n is-${eixosDir}`}>
                        {eixos}
                      </strong>
                      <span>eixos</span>
                      <button type="button" title="Menos eixos" onClick={() => mudarEixos(eixos - 1)}>
                        <ChevronDown size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="rota-pub__sec-line">
                    <p className="rota-pub__sec">Custo</p>
                    <label className={`rota-pub__volta${idaEVolta ? ' is-on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={idaEVolta}
                        onChange={(e) => setIdaEVolta(e.target.checked)}
                      />
                      <span>Calcular volta</span>
                    </label>
                  </div>
                  <div className="rota-pub__grid">
                    <label className="rota-pub__box">
                      <span>Consumo</span>
                      <span className="rota-pub__box-row">
                        <Gauge size={16} />
                        <input
                          value={consumo}
                          onChange={(e) => setConsumo(e.target.value)}
                          inputMode="decimal"
                          placeholder="0,0"
                          aria-label="Consumo em km por litro"
                        />
                        <em>km/l</em>
                      </span>
                    </label>
                    <label className="rota-pub__box">
                      <span>Preço diesel</span>
                      <span className="rota-pub__box-row">
                        <em>R$</em>
                        <input
                          value={precoDiesel}
                          onChange={(e) => setPrecoDiesel(e.target.value)}
                          inputMode="decimal"
                          placeholder="0,00"
                          aria-label="Preço do diesel"
                        />
                        <Fuel size={16} />
                      </span>
                    </label>
                  </div>

                  <p className="rota-pub__sec">Preferência</p>
                  <div className="rota-pub__prefs" role="radiogroup" aria-label="Preferência de rota">
                    {PREFS.map(([id, label, Icon]) => (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={preferencia === id}
                        className={`rota-pub__pref${preferencia === id ? ' is-on' : ''}`}
                        onClick={() => setPreferencia(id)}
                      >
                        <span className="rota-pub__radio">
                          {preferencia === id ? <Check size={12} strokeWidth={3} /> : null}
                        </span>
                        <Icon size={16} strokeWidth={2.4} />
                        {label}
                      </button>
                    ))}
                  </div>

                </div>
                <div className="rota-pub__rodape">
                  {erro ? <p className="rota-pub__erro">{erro}</p> : null}
                  <button
                    type="button"
                    className="rota-pub__calc"
                    disabled={busy}
                    onClick={() => {
                      if (cotaPronta && !ilimitado && cota.restam === 0) {
                        abrirPaywall()
                        return
                      }
                      void calcular()
                    }}
                  >
                    <Route size={22} />
                    {busy ? 'Calculando…' : 'Calcular'}
                  </button>
                  {calc?.rota && !showResultado ? (
                    <button
                      type="button"
                      className="rota-pub__ver-resultado"
                      onClick={() => setShowResultado(true)}
                    >
                      Ver resultado
                    </button>
                  ) : null}
                </div>
                </>
              ) : null}
            </div>
          </aside>

          <div className="mapa-frota__map-wrap">
              <RotaMapErroBoundary>
                <RotaMapPreview
              key={formId}
              origem={origem}
              destino={destino}
              origemCoords={origemCoords}
              destinoCoords={destinoCoords}
              waypoints={viasValidas}
              eixos={eixos}
              consumoKmL={parseNumBr(consumo, consumoPadraoKmL(eixos))}
              precoDiesel={parseNumBr(precoDiesel, PRECO_DIESEL_SUGERIDO)}
              preferencia={preferencia}
              autoCalcular={false}
              calcularId={mapId}
              entrarId={entrarId}
              pickMode={pickMode}
              onPickModeChange={setPickMode}
              onPickPonto={marcarPontoNoMapa}
              onClickRota={() => {
                if (calc?.rota) setShowResultado(true)
              }}
              esconderCartao={showResultado}
              mostrarSuporte
              className="h-full min-h-[360px] w-full"
            />
              </RotaMapErroBoundary>
            {showResultado && calc?.rota ? (
              <aside
                className="rota-pub-janela"
                role="dialog"
                aria-labelledby="rota-pub-result-title"
              >
          <div className="rota-pub-janela__card">
            <header className="rota-pub-janela__head">
              <div>
                <p className="rota-pub-janela__kicker">Resultado</p>
                <h2 id="rota-pub-result-title">Custo da rota</h2>
              </div>
              <button
                type="button"
                className="rota-pub-janela__fechar"
                aria-label="Fechar resultado"
                onClick={() => setShowResultado(false)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="rota-pub-janela__acoes">
              <RotaResultadoAcoes
                origem={snap?.origem || origem}
                destino={snap?.destino || destino}
                vias={snap?.vias ?? viasValidas}
                origemCoords={snap?.origemCoords ?? origemCoords}
                destinoCoords={snap?.destinoCoords ?? destinoCoords}
                calc={calc}
                tipoVeiculo={snap?.tipoVeiculo || tipoVeiculoNome}
                idaEVolta={snap?.idaEVolta ?? idaEVolta}
                preferencia={snap?.preferencia ?? preferencia}
                onSalvouLocal={() => {
                  setRotasSalvas(listarRotasNesteAparelho())
                  setFormAberto(true)
                }}
              />
            </div>
            <div className="rota-pub__resumo rota-pub__resumo--janela" aria-live="polite">
              {snap ? (
                <div className="rota-pub__fatos">
                  <div className="rota-pub__fato rota-pub__fato--full">
                    <small>Origem</small>
                    <strong>{snap.origem}</strong>
                  </div>
                  {snap.vias.map((via, i) => (
                    <div key={`${via.endereco}-${i}`} className="rota-pub__fato rota-pub__fato--full">
                      <small>Passagem {i + 1}</small>
                      <strong>{via.endereco}</strong>
                    </div>
                  ))}
                  <div className="rota-pub__fato rota-pub__fato--full">
                    <small>Destino</small>
                    <strong>{snap.destino}</strong>
                  </div>
                  <div className="rota-pub__fato">
                    <small>Veículo</small>
                    <strong>{snap.tipoVeiculo}</strong>
                  </div>
                  <div className="rota-pub__fato">
                    <small>Classe</small>
                    <strong>{snap.classe || '—'}</strong>
                  </div>
                  <div className="rota-pub__fato">
                    <small>Eixos</small>
                    <strong>
                      {calc.eixos}
                      {calc.eixos_utilizados !== calc.eixos
                        ? ` · ANTT ${calc.eixos_utilizados}`
                        : ''}
                    </strong>
                  </div>
                  <div className="rota-pub__fato">
                    <small>Categoria</small>
                    <strong>{calc.categoria_label || 'Não selecionada'}</strong>
                  </div>
                  <div className="rota-pub__fato">
                    <small>Trecho</small>
                    <strong>{snap.idaEVolta ? 'Ida e volta' : 'Só ida'}</strong>
                  </div>
                  <div className="rota-pub__fato">
                    <small>Preferência</small>
                    <strong>{PREF_LABEL[snap.preferencia]}</strong>
                  </div>
                </div>
              ) : null}

              <div className="rota-pub__total">
                <span>Custo total{snap?.idaEVolta ? ' · ida e volta' : ''}</span>
                <strong>{formatCurrency(calc.rota.custo_total)}</strong>
              </div>
              <div className="rota-pub__stats">
                <div>
                  <small>Distância</small>
                  <strong>{calc.rota.distancia_km} km</strong>
                </div>
                <div>
                  <small>Tempo</small>
                  <strong>{calc.rota.duracao_label}</strong>
                </div>
                <div>
                  <small>Pedágio</small>
                  <strong>{formatCurrency(calc.rota.pedagio)}</strong>
                </div>
              </div>
              <div className="rota-pub__linha">
                <span>
                  <Wallet size={14} /> Pedágio / eixo
                </span>
                <strong>{formatCurrency(calc.rota.pedagio_por_eixo)}</strong>
              </div>
              <div className="rota-pub__linha">
                <span>
                  <Wallet size={14} /> Vale-pedágio
                </span>
                <strong>{formatCurrency(calc.rota.vale_pedagio ?? calc.rota.pedagio)}</strong>
              </div>
              <div className="rota-pub__linha">
                <span>
                  <Fuel size={14} /> Combustível
                </span>
                <strong>{formatCurrency(calc.rota.combustivel)}</strong>
              </div>
              {calc.rota.consumo_km_l && calc.rota.preco_diesel && calc.rota.litros != null ? (
                <p className="rota-pub__conta">
                  {calc.rota.distancia_km} km ÷ {fmtConsumo(calc.rota.consumo_km_l)} km/l ={' '}
                  {fmtConsumo(calc.rota.litros)} L × {formatCurrency(calc.rota.preco_diesel)}
                </p>
              ) : null}
              {calc.piso_selecionado != null ? (
                <div className="rota-pub__linha">
                  <span>Piso ANTT{calc.categoria_label ? ` · ${calc.categoria_label}` : ''}</span>
                  <strong>{formatCurrency(calc.piso_selecionado)}</strong>
                </div>
              ) : null}

              <h3>Praças ({calc.rota.pracas?.length ?? 0})</h3>
              {(calc.rota.pracas?.length ?? 0) === 0 ? (
                <p className="mapa-frota__sub">Nenhuma praça detectada nesta rota.</p>
              ) : (
                <ul className="rota-pub__pracas">
                  {[...calc.rota.pracas!]
                    .sort((a, b) => (a.ordem ?? a.km_ate ?? 0) - (b.ordem ?? b.km_ate ?? 0))
                    .map((p, i) => {
                      const ordem = p.ordem ?? i + 1
                      const detalhes = [
                        p.km_ate != null ? `em ${p.km_ate.toLocaleString('pt-BR')} km` : null,
                        p.min_ate != null ? `~${p.min_ate} min` : null,
                        p.valor_carro != null
                          ? `carro ${formatCurrency(p.valor_carro)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                      const maps =
                        p.lat != null && p.lng != null
                          ? `https://www.waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`
                          : null
                      return (
                        <li key={`${p.nome}-${i}`}>
                          <span>
                            <strong className="rota-pub__praca-ord">{ordem}ª</strong> {p.nome}
                            {p.free_flow ? ' · Free Flow' : ''}
                            {detalhes ? <small>{detalhes}</small> : null}
                            {maps ? (
                              <a
                                className="rota-pub__praca-waze"
                                href={maps}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Waze
                              </a>
                            ) : null}
                          </span>
                          <strong>{formatCurrency(p.valor)}</strong>
                        </li>
                      )
                    })}
                </ul>
              )}
              <div className="rota-pub__fonte">
                <span>Resolução ANTT</span>
                <MapaFrotaAjuda
                  texto={calc.fonte}
                  ariaLabel="Fonte da resolução e da rota"
                  abrirAcima
                />
              </div>
              <LinkMapaFrota className="mapa-pub__btn mapa-pub__btn--ghost">
                Ver frota disponível
              </LinkMapaFrota>
              <RotaFaleConosco
                origem={snap?.origem || origem}
                destino={snap?.destino || destino}
              />
            </div>
          </div>
              </aside>
            ) : null}
          </div>
        </div>
      </div>

      {showPaywall && !modoSistema ? (
        <RotaPaywallModal
          restamGratis={cota.restamGratis}
          creditos={cota.creditos}
          conta={googleAuth.conta}
          onClose={() => {
            paywallAuto.current = false
            setShowPaywall(false)
          }}
          onCreditosLiberados={() => {
            void consultarEstadoCalculosPublicos().then(setCota)
          }}
        />
      ) : null}

      {!modoSistema && ((showLogin && !googleAuth.conta) || googleAuth.redefinirSenha) ? (
        <RotaPublicoLoginModal onClose={() => setShowLogin(false)} />
      ) : null}

      {presente && !modoSistema ? (
        <RotaPresenteModal
          creditos={presente.creditos}
          onClose={() => {
            const ids = presente.ids
            setPresente(null)
            void marcarPresenteRotaVisto(ids).then(() => {
              if (ilimitado) return
              void consultarEstadoCalculosPublicos().then(setCota)
            })
          }}
        />
      ) : null}
    </div>
  )
}
