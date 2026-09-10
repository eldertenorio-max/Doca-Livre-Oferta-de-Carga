import { useEffect, useId, useRef, useState } from 'react'
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
  Plus,
  RotateCcw,
  Route,
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
import { LinkSistema, LinkMapaFrota } from '../../components/ui/HostLink'
import { isSiteOfertaDeCarga, URL_MAPA_LOGISTICA } from '../../lib/siteOfertaDeCarga'
import { useData } from '../../context/DataContext'
import { AddressSuggestInput } from '../../components/ui/AddressSuggestInput'
import { VeiculoSuggestInput } from '../../components/ui/VeiculoSuggestInput'
import { RotaMapPreview } from '../../components/carga/RotaMapPreview'
import type { SugestaoEndereco } from '../../lib/geocodeEndereco'
import {
  consultarEstadoCalculosPublicos,
  estadoCalculosPublicos,
  registrarCalculoPublico,
  ROTA_PUBLICO_LIMITE_CALCULOS,
} from '../../lib/rotaPublicoCalculos'
import '../../styles/mapa-frota.css'
import '../../styles/mapa-publico.css'
import '../../styles/rota-publico.css'

const PLANOS_PUBLICOS = [
  {
    id: 'motorista',
    nome: 'Motorista',
    preco: 'R$ 49',
    periodo: '/mês',
    extra: 'ou R$ 14,90 /semana',
    para: 'Caminhoneiro e transportador',
    itens: ['Rotas ilimitadas', 'Mapa da frota', 'Perfil no sistema'],
    destaque: false,
  },
  {
    id: 'start',
    nome: 'Embarcador Start',
    preco: 'R$ 197',
    periodo: '/mês',
    extra: '2 usuários',
    para: 'Empresa pequena',
    itens: ['Publicar cargas', 'Rotas ilimitadas', 'WhatsApp e placa da frota'],
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

const PREF_LABEL: Record<PreferenciaRota, string> = {
  eficiente: 'Rota eficiente',
  curta: 'Rota curta',
  evitar_pedagio: 'Evitar pedágios',
}

type ResultadoSnap = {
  origem: string
  destino: string
  vias: string[]
  tipoVeiculo: string
  classe: string
  eixos: number
  idaEVolta: boolean
  preferencia: PreferenciaRota
}

function novaVia(): Via {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `via-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  return { id, endereco: '' }
}

export function CalcularRotaPublicoPage() {
  const { user } = useData()
  const formId = useId()
  const reqId = useRef(0)
  const userRef = useRef(user)
  const cotaBusyRef = useRef(false)
  userRef.current = user

  const [origem, setOrigem] = useState('')
  const [destino, setDestino] = useState('')
  const [origemCoords, setOrigemCoords] = useState<Coord | null>(null)
  const [destinoCoords, setDestinoCoords] = useState<Coord | null>(null)
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
  const [restam, setRestam] = useState(() =>
    user ? ROTA_PUBLICO_LIMITE_CALCULOS : estadoCalculosPublicos().restam,
  )
  const [showPaywall, setShowPaywall] = useState(false)
  const [showResultado, setShowResultado] = useState(false)
  const [snap, setSnap] = useState<ResultadoSnap | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    document.title = 'Calcular rota — Oferta de Carga'
  }, [])

  useEffect(() => {
    if (user) setRestam(ROTA_PUBLICO_LIMITE_CALCULOS)
  }, [user])

  useEffect(() => {
    if (user) return
    let alive = true
    void consultarEstadoCalculosPublicos().then((estado) => {
      if (!alive) return
      setRestam(estado.restam)
    })
    return () => {
      alive = false
    }
  }, [user])

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

  function trocarPontos() {
    setOrigem(destino)
    setDestino(origem)
    setOrigemCoords(destinoCoords)
    setDestinoCoords(origemCoords)
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
  }

  async function consumirCalculo(): Promise<boolean> {
    if (userRef.current) return true
    if (cotaBusyRef.current) return false
    cotaBusyRef.current = true
    try {
      const consumoCota = await registrarCalculoPublico()
      setRestam(consumoCota.restam)
      if (!consumoCota.ok) {
        setShowPaywall(true)
        return false
      }
      return true
    } finally {
      cotaBusyRef.current = false
    }
  }

  async function calcular() {
    if (origem.trim().length < 3 || destino.trim().length < 3) {
      setErro('Informe origem e destino.')
      return
    }
    if (!(await consumirCalculo())) return
    const id = ++reqId.current
    setBusy(true)
    setErro('')
    const waypoints = vias
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
    const res = await calcularRotaOperacional({
      origem,
      destino,
      eixos,
      consumoKmL: parseNumBr(consumo, consumoPadraoKmL(eixos)),
      precoDiesel: parseNumBr(precoDiesel, PRECO_DIESEL_SUGERIDO),
      idaEVolta,
      preferencia,
      categoriaId: categoriaCargaId === '' ? null : categoriaCargaId,
      waypoints,
      origemCoords,
      destinoCoords,
    })
    if (id !== reqId.current) return
    setBusy(false)
    if (!res.ok) {
      setErro(res.erro)
      setCalc(null)
      setShowResultado(false)
      setSnap(null)
      return
    }
    setCalc(res.data)
    setSnap({
      origem,
      destino,
      vias: waypoints.map((v) => v.endereco).filter(Boolean),
      tipoVeiculo: tipoVeiculoNome.trim() || VEICULOS.find((v) => v.id === tipoVeiculo)?.label || '—',
      classe: VEICULOS.find((v) => v.id === tipoVeiculo)?.label ?? '',
      eixos,
      idaEVolta,
      preferencia,
    })
    setShowResultado(true)
    setMapId((n) => n + 1)
  }

  const logado = Boolean(user)
  const viasValidas = vias.filter((v) => v.endereco.trim().length >= 3)

  return (
    <div className="mapa-pub rota-pub">
      <header className="mapa-pub__top">
        <Link to={isSiteOfertaDeCarga() ? '/' : '/rota'} className="mapa-pub__brand">
          <img src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" />
          <span>
            <strong>Oferta de Carga</strong>
            <em>Calcular rota e pedágio</em>
          </span>
        </Link>
        <div className="mapa-pub__top-actions">
          {logado ? (
            <LinkSistema
              className="mapa-pub__btn mapa-pub__btn--solid"
              to={user?.role === 'transportador' ? '/transportador' : '/embarcador'}
            >
              Ir para o sistema
            </LinkSistema>
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
        {!user && restam === 0 ? (
          <div className="mapa-pub__cta-esgotado">
            <span>Para calcular mais rotas hoje, assine o Doca Livre.</span>
            <button type="button" onClick={() => setShowPaywall(true)}>
              Assinar para continuar
            </button>
          </div>
        ) : null}

        <div className="mapa-frota__layout">
          <aside className="mapa-frota__lista rota-pub__panel">
            <div className="rota-pub__hero">
              <div>
                <p className="rota-pub__kicker">Pedágio · km · combustível</p>
                <h1>Calcular rota</h1>
              </div>
              <p className="rota-pub__badge">
                {user
                  ? 'Ilimitado'
                  : restam > 0
                    ? `${restam} de ${ROTA_PUBLICO_LIMITE_CALCULOS} grátis`
                    : 'Esgotado hoje'}
              </p>
            </div>
            <div className={`mapa-frota__search${formAberto ? '' : ' is-collapsed'}`}>
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
                  <RotateCcw size={15} />
                </button>
              </div>

              {formAberto ? (
                <div className="mapa-frota__search-body rota-pub__form">
                  <div className="rota-pub__ab">
                    <div className="rota-pub__rail" aria-hidden>
                      <span className="rota-pub__pin rota-pub__pin--a">A</span>
                      <span className="rota-pub__dots" />
                      <button
                        type="button"
                        className="rota-pub__swap"
                        title="Inverter origem e destino"
                        onClick={trocarPontos}
                      >
                        <ArrowUpDown size={14} />
                      </button>
                      <span className="rota-pub__dots" />
                      <span className="rota-pub__pin rota-pub__pin--b">B</span>
                    </div>
                    <div className="rota-pub__ab-fields">
                      <div className="rota-pub__campo">
                        <AddressSuggestInput
                          value={origem}
                          onChange={(v) => {
                            setOrigem(v)
                            setOrigemCoords(null)
                          }}
                          onPick={pickOrigem}
                          placeholder="Origem"
                          className="rota-pub__input"
                        />
                      </div>
                      <div className="rota-pub__campo">
                        <AddressSuggestInput
                          value={destino}
                          onChange={(v) => {
                            setDestino(v)
                            setDestinoCoords(null)
                          }}
                          onPick={pickDestino}
                          placeholder="Destino"
                          className="rota-pub__input"
                        />
                        <button
                          type="button"
                          className="rota-pub__campo-btn"
                          title="Adicionar ponto de passagem"
                          onClick={() => setVias((lista) => [...lista, novaVia()])}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {vias.map((via, idx) => (
                    <div key={via.id} className="rota-pub__via">
                      <span className="rota-pub__pin rota-pub__pin--via">{idx + 1}</span>
                      <div className="rota-pub__campo">
                        <AddressSuggestInput
                          value={via.endereco}
                          onChange={(v) =>
                            setVias((lista) =>
                              lista.map((x) =>
                                x.id === via.id ? { ...x, endereco: v, lat: null, lng: null } : x,
                              ),
                            )
                          }
                          onPick={(sug) =>
                            setVias((lista) =>
                              lista.map((x) =>
                                x.id === via.id
                                  ? {
                                      ...x,
                                      endereco: sug.label,
                                      lat: sug.lat,
                                      lng: sug.lng,
                                    }
                                  : x,
                              ),
                            )
                          }
                          placeholder="Ponto de passagem"
                          className="rota-pub__input"
                        />
                      </div>
                      <button
                        type="button"
                        className="rota-pub__via-del"
                        title="Remover ponto"
                        onClick={() => setVias((lista) => lista.filter((x) => x.id !== via.id))}
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <p className="rota-pub__sec">Veículo</p>
                  <div className="rota-pub__catalogo">
                    <div className="rota-pub__field">
                      <div className="rota-pub__field-head">
                        <span>Tipo de veículo</span>
                        <em>{TIPOS_VEICULO.length} cadastrados</em>
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
                        {CATEGORIAS_ANTT.map((c) => (
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
                        <ChevronUp size={16} />
                      </button>
                      <strong key={eixosTick} className={`rota-pub__eixos-n is-${eixosDir}`}>
                        {eixos}
                      </strong>
                      <span>eixos</span>
                      <button type="button" title="Menos eixos" onClick={() => mudarEixos(eixos - 1)}>
                        <ChevronDown size={16} />
                      </button>
                    </div>
                  </div>

                  <p className="rota-pub__sec">Custo</p>
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
                    <label className={`rota-pub__box rota-pub__volta${idaEVolta ? ' is-on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={idaEVolta}
                        onChange={(e) => setIdaEVolta(e.target.checked)}
                      />
                      <span>
                        Calcular volta
                        <small>Soma pedágio e combustível da ida e da volta</small>
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
                          {preferencia === id ? <Check size={11} strokeWidth={3} /> : null}
                        </span>
                        <Icon size={13} strokeWidth={2.4} />
                        {label}
                      </button>
                    ))}
                  </div>

                  {erro ? <p className="rota-pub__erro">{erro}</p> : null}

                  <button
                    type="button"
                    className="rota-pub__calc"
                    disabled={busy || (!user && restam === 0)}
                    onClick={() => {
                      if (!user && restam === 0) {
                        setShowPaywall(true)
                        return
                      }
                      void calcular()
                    }}
                  >
                    <Route size={18} />
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
              ) : null}
            </div>
          </aside>

          <div className="mapa-frota__map-wrap">
            <div className="rota-pub__map-links">
              <img className="rota-pub__map-logo" src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" />
              <a
                className="rota-pub__pill"
                href={URL_MAPA_LOGISTICA}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>Mapa da</span>
                <strong>Logística</strong>
              </a>
              <LinkMapaFrota className="rota-pub__pill">
                <span>Mapa</span>
                <strong>da Frota</strong>
              </LinkMapaFrota>
            </div>
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
              className="h-full min-h-[360px] w-full"
            />
          </div>
        </div>
      </div>

      {showResultado && calc?.rota ? (
        <div
          className="rota-pub-janela"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rota-pub-result-title"
          onClick={() => setShowResultado(false)}
        >
          <div className="rota-pub-janela__card" onClick={(e) => e.stopPropagation()}>
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
            <div className="rota-pub__resumo rota-pub__resumo--janela" aria-live="polite">
              {snap ? (
                <div className="rota-pub__fatos">
                  <div className="rota-pub__fato rota-pub__fato--full">
                    <small>Origem</small>
                    <strong>{snap.origem}</strong>
                  </div>
                  {snap.vias.map((via, i) => (
                    <div key={`${via}-${i}`} className="rota-pub__fato rota-pub__fato--full">
                      <small>Passagem {i + 1}</small>
                      <strong>{via}</strong>
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
              <p className="mapa-frota__sub">{calc.fonte}</p>
              <LinkMapaFrota className="mapa-pub__btn mapa-pub__btn--ghost">
                Ver frota disponível
              </LinkMapaFrota>
            </div>
          </div>
        </div>
      ) : null}

      {showPaywall ? (
        <div className="mapa-pub-modal" role="dialog" aria-modal="true" aria-labelledby="rota-pub-pay-title">
          <div className="mapa-pub-modal__card mapa-pub-modal__card--planos">
            <h2 id="rota-pub-pay-title">Escolha um plano</h2>
            <p>
              Os {ROTA_PUBLICO_LIMITE_CALCULOS} cálculos grátis de hoje acabaram. Amanhã você tem
              mais dois, ou assine para calcular sem limite.
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
                Continuar vendo o último cálculo
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
