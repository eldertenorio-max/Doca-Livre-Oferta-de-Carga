import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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
import { AddressSuggestInput, PLACEHOLDER_ENDERECO_EXEMPLO } from '../../components/ui/AddressSuggestInput'
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

const PREFS: Array<[PreferenciaRota, string]> = [
  ['eficiente', 'Rota eficiente'],
  ['curta', 'Rota curta'],
  ['evitar_pedagio', 'Evitar pedágios'],
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
  const [eixos, setEixos] = useState(5)
  const [consumo, setConsumo] = useState(() => fmtConsumo(consumoPadraoKmL(5)))
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
          <LinkMapaFrota className="mapa-pub__btn mapa-pub__btn--ghost">Mapa da Frota</LinkMapaFrota>
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
        <header className="mapa-frota__head">
          <div>
            <h1 className="mapa-frota__title">Calcular rota</h1>
            <p className="mapa-frota__sub">
              Distância, pedágio ANTT e combustível — no mesmo modelo do QualP e do Rotas Brasil.
            </p>
            <p className="mapa-pub__creditos">
              {user
                ? 'Conta logada · cálculos ilimitados'
                : restam > 0
                  ? `${restam} de ${ROTA_PUBLICO_LIMITE_CALCULOS} cálculos grátis hoje`
                  : 'Os 2 cálculos grátis de hoje acabaram'}
            </p>
          </div>
          <div className="mapa-frota__filtros">
            {PREFS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`mapa-frota__chip${preferencia === id ? ' is-active' : ''}`}
                onClick={() => setPreferencia(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {!user && restam === 0 ? (
          <div className="mapa-pub__cta-esgotado">
            <span>Para calcular mais rotas hoje, assine o Doca Livre.</span>
            <button type="button" onClick={() => setShowPaywall(true)}>
              Assinar para continuar
            </button>
          </div>
        ) : null}

        <div className="mapa-frota__layout">
          <aside className="mapa-frota__lista">
            <div className={`mapa-frota__search${formAberto ? '' : ' is-collapsed'}`}>
              <button
                type="button"
                className="mapa-frota__search-toggle"
                aria-expanded={formAberto}
                onClick={() => setFormAberto((v) => !v)}
              >
                <span className="mapa-frota__cats-title">Origem e destino</span>
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

              {formAberto ? (
                <div className="mapa-frota__search-body">
                  <label className="mapa-frota__field">
                    <span>Origem</span>
                    <AddressSuggestInput
                      value={origem}
                      onChange={(v) => {
                        setOrigem(v)
                        setOrigemCoords(null)
                      }}
                      onPick={pickOrigem}
                      placeholder={PLACEHOLDER_ENDERECO_EXEMPLO}
                      className="mapa-frota__input"
                    />
                  </label>

                  <div className="rota-pub__swap">
                    <button type="button" title="Inverter origem e destino" onClick={trocarPontos}>
                      ↕
                    </button>
                  </div>

                  <label className="mapa-frota__field">
                    <span>Destino</span>
                    <AddressSuggestInput
                      value={destino}
                      onChange={(v) => {
                        setDestino(v)
                        setDestinoCoords(null)
                      }}
                      onPick={pickDestino}
                      placeholder={PLACEHOLDER_ENDERECO_EXEMPLO}
                      className="mapa-frota__input"
                    />
                  </label>

                  {vias.map((via, idx) => (
                    <div key={via.id} className="rota-pub__via">
                      <label className="mapa-frota__field">
                        <span>Ponto {idx + 1}</span>
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
                          placeholder="Cidade ou endereço de passagem"
                          className="mapa-frota__input"
                        />
                      </label>
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

                  <button type="button" className="rota-pub__add" onClick={() => setVias((lista) => [...lista, novaVia()])}>
                    + Ponto de passagem
                  </button>

                  <label className="mapa-frota__field">
                    <span>Eixos</span>
                    <div className="rota-pub__eixos">
                      <button type="button" onClick={() => setEixos((e) => Math.max(2, e - 1))}>
                        −
                      </button>
                      <span>{eixos} eixos</span>
                      <button type="button" onClick={() => setEixos((e) => Math.min(9, e + 1))}>
                        +
                      </button>
                    </div>
                  </label>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={idaEVolta}
                    className={`rota-pub__switch${idaEVolta ? ' is-on' : ''}`}
                    onClick={() => setIdaEVolta((v) => !v)}
                  >
                    <span>Ida e volta</span>
                    <strong>{idaEVolta ? 'Sim' : 'Não'}</strong>
                  </button>

                  <label className="mapa-frota__field">
                    <span>Consumo (km/l)</span>
                    <input
                      className="mapa-frota__input"
                      value={consumo}
                      onChange={(e) => setConsumo(e.target.value)}
                      inputMode="decimal"
                    />
                  </label>
                  <label className="mapa-frota__field">
                    <span>Diesel (R$/L)</span>
                    <input
                      className="mapa-frota__input"
                      value={precoDiesel}
                      onChange={(e) => setPrecoDiesel(e.target.value)}
                      inputMode="decimal"
                    />
                  </label>

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
                    {busy ? 'Calculando…' : 'Calcular rota'}
                  </button>
                </div>
              ) : null}
            </div>

            {calc?.rota ? (
              <div className="rota-pub__resumo" aria-live="polite">
                <h3>Resultado</h3>
                <div className="rota-pub__linha">
                  <span>Distância</span>
                  <strong>{calc.rota.distancia_km} km</strong>
                </div>
                <div className="rota-pub__linha">
                  <span>Duração</span>
                  <strong>{calc.rota.duracao_label}</strong>
                </div>
                <div className="rota-pub__linha">
                  <span>Pedágio</span>
                  <strong>{formatCurrency(calc.rota.pedagio)}</strong>
                </div>
                <div className="rota-pub__linha">
                  <span>Pedágio / eixo</span>
                  <strong>{formatCurrency(calc.rota.pedagio_por_eixo)}</strong>
                </div>
                <div className="rota-pub__linha">
                  <span>Combustível</span>
                  <strong>{formatCurrency(calc.rota.combustivel)}</strong>
                </div>
                <div className="rota-pub__linha rota-pub__linha--total">
                  <span>Custo total</span>
                  <strong>{formatCurrency(calc.rota.custo_total)}</strong>
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
