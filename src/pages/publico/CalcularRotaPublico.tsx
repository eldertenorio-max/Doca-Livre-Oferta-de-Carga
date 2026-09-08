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
  Zap,
} from 'lucide-react'
import { formatCurrency } from '../../lib/businessRules'
import {
  calcularRotaOperacional,
  consumoPadraoKmL,
  PRECO_DIESEL_SUGERIDO,
  type AnttCalculo,
  type PreferenciaRota,
} from '../../lib/anttFrete'
import { LOGO_DOCA_LIVRE_SRC } from '../../lib/brandAssets'
import { LinkSistema, LinkMapaFrota } from '../../components/ui/HostLink'
import { useData } from '../../context/DataContext'
import { AddressSuggestInput } from '../../components/ui/AddressSuggestInput'
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

const LINK_MAPA_LOGISTICA =
  'https://doca-livre-mapa-da-log-stica.onrender.com/?_v=mapa-publico-planos-v1#/mapa'

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
  label: string
  Icon: typeof Truck
}> = [
  { id: 'caminhao', eixos: 6, label: 'Caminhão', Icon: Truck },
  { id: 'carro', eixos: 2, label: 'Carro', Icon: Car },
  { id: 'onibus', eixos: 3, label: 'Ônibus', Icon: Bus },
  { id: 'moto', eixos: 2, label: 'Moto', Icon: Bike },
]

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
  const [eixos, setEixos] = useState(6)
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

  function escolherVeiculo(tipo: TipoVeiculoUi) {
    const item = VEICULOS.find((v) => v.id === tipo)
    if (!item) return
    setTipoVeiculo(tipo)
    setEixos(item.eixos)
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
      waypoints,
      origemCoords,
      destinoCoords,
    })
    if (id !== reqId.current) return
    setBusy(false)
    if (!res.ok) {
      setErro(res.erro)
      setCalc(null)
      return
    }
    setCalc(res.data)
    setMapId((n) => n + 1)
  }

  const logado = Boolean(user)
  const viasValidas = vias.filter((v) => v.endereco.trim().length >= 3)

  return (
    <div className="mapa-pub rota-pub">
      <header className="mapa-pub__top">
        <Link to="/rota" className="mapa-pub__brand">
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
                  <div className="rota-pub__veiculos">
                    <div className="rota-pub__tipos" role="group" aria-label="Tipo de veículo">
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
                      <button type="button" title="Mais eixos" onClick={() => setEixos((e) => Math.min(9, e + 1))}>
                        <ChevronUp size={16} />
                      </button>
                      <strong>{eixos}</strong>
                      <span>eixos</span>
                      <button type="button" title="Menos eixos" onClick={() => setEixos((e) => Math.max(2, e - 1))}>
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
                </div>
              ) : null}
            </div>

            {calc?.rota ? (
              <div className="rota-pub__resumo" aria-live="polite">
                <div className="rota-pub__total">
                  <span>Custo total</span>
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
                    <Fuel size={14} /> Combustível
                  </span>
                  <strong>{formatCurrency(calc.rota.combustivel)}</strong>
                </div>
                {calc.piso_selecionado != null ? (
                  <div className="rota-pub__linha">
                    <span>Piso ANTT</span>
                    <strong>{formatCurrency(calc.piso_selecionado)}</strong>
                  </div>
                ) : null}

                <h3>Praças ({calc.rota.pracas?.length ?? 0})</h3>
                {(calc.rota.pracas?.length ?? 0) === 0 ? (
                  <p className="mapa-frota__sub">Nenhuma praça detectada nesta rota.</p>
                ) : (
                  <ul className="rota-pub__pracas">
                    {calc.rota.pracas!.map((p, i) => (
                      <li key={`${p.nome}-${i}`}>
                        <span>
                          {p.nome}
                          {p.free_flow ? ' · Free Flow' : ''}
                        </span>
                        <strong>{formatCurrency(p.valor)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mapa-frota__sub">{calc.fonte}</p>
                <LinkMapaFrota className="mapa-pub__btn mapa-pub__btn--ghost">
                  Ver frota disponível
                </LinkMapaFrota>
              </div>
            ) : null}
          </aside>

          <div className="mapa-frota__map-wrap">
            <div className="rota-pub__map-links">
              <img className="rota-pub__map-logo" src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" />
              <a
                className="rota-pub__pill"
                href={LINK_MAPA_LOGISTICA}
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
