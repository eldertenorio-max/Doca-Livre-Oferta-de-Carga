import { useMemo, useState } from 'react'
import { Wallet } from 'lucide-react'
import { CATEGORIAS_ANTT, EIXOS_ANTT } from '../../lib/anttFrete'
import { formatCurrency } from '../../lib/businessRules'
import {
  calcularFreteMinimo,
  formatarKm,
  hojeISODate,
  parseNumeroBr,
  TABELAS_FRETE_MINIMO,
  type FreteMinimoResultado,
} from '../../lib/freteMinimo'
import type { TabelaAntt } from '../../lib/anttFrete'
import '../../styles/frete-minimo.css'

type Props = {
  kmRota?: number | null
  eixosInicial?: number
  categoriaInicial?: number | ''
  onPedirRota?: () => void
  /** Card com borda — calculadora do sistema. */
  variante?: 'publico' | 'sistema'
  inicialAberto?: boolean
}

function fmtDataBr(iso: string) {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

export function FreteMinimoCalc({
  kmRota = null,
  eixosInicial = 5,
  categoriaInicial = 5,
  onPedirRota,
  variante = 'publico',
  inicialAberto = false,
}: Props) {
  const [aberto, setAberto] = useState(inicialAberto)
  const [km, setKm] = useState('')
  const [eixos, setEixos] = useState(() => {
    if (EIXOS_ANTT.includes(eixosInicial as (typeof EIXOS_ANTT)[number])) return eixosInicial
    return 5
  })
  const [tabela, setTabela] = useState<TabelaAntt>('A')
  const [categoriaId, setCategoriaId] = useState<number | ''>(
    categoriaInicial === '' ? 5 : categoriaInicial,
  )
  const [dataCalculo, setDataCalculo] = useState(hojeISODate)
  const [retornoVazio, setRetornoVazio] = useState(false)
  const [extras, setExtras] = useState(false)
  const [margem, setMargem] = useState('0')
  const [icms, setIcms] = useState('12')
  const [toneladas, setToneladas] = useState('')
  const [erro, setErro] = useState('')
  const [res, setRes] = useState<FreteMinimoResultado | null>(null)

  const eixosChips = useMemo(() => [...EIXOS_ANTT], [])

  function calcular() {
    const kmN = parseNumeroBr(km)
    const cat = categoriaId === '' ? NaN : categoriaId
    const out = calcularFreteMinimo({
      km: kmN,
      tabela,
      categoriaId: cat,
      eixos,
      retornoVazio,
      extras,
      margemPct: parseNumeroBr(margem) || 0,
      icmsPct: parseNumeroBr(icms) || 0,
      toneladas: parseNumeroBr(toneladas),
      dataCalculo,
    })
    if (!out.ok) {
      setRes(null)
      setErro(out.erro)
      return
    }
    setErro('')
    setRes(out.data)
  }

  const kmRotaOk = kmRota != null && kmRota > 0

  return (
    <section className={`frete-min${variante === 'sistema' ? ' frete-min--sistema' : ''}`}>
      <button
        type="button"
        className="frete-min__toggle"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <span className="frete-min__toggle-title">Frete mínimo</span>
        <span className={`frete-min__resumo${res ? ' is-ok' : ''}`}>
          {res ? formatCurrency(res.total) : 'Piso ANTT'}
        </span>
        <span className={`frete-min__chevron${aberto ? ' is-open' : ''}`} aria-hidden>
          ▾
        </span>
      </button>

      {aberto ? (
        <div className="frete-min__body">
          <label className="frete-min__label">
            Km rodados
            <div className="frete-min__km">
              <input
                value={km}
                onChange={(e) => setKm(e.target.value)}
                inputMode="decimal"
                placeholder="Ex.: 500"
                aria-label="Quilômetros rodados"
              />
              {kmRotaOk ? (
                <button
                  type="button"
                  className="frete-min__km-btn"
                  onClick={() => setKm(formatarKm(kmRota))}
                >
                  Usar {formatarKm(kmRota)} km
                </button>
              ) : onPedirRota ? (
                <button type="button" className="frete-min__km-btn" onClick={onPedirRota}>
                  Calcular rota
                </button>
              ) : null}
            </div>
          </label>

          <div className="frete-min__label">
            Número de eixos
            <div className="frete-min__eixos" role="group" aria-label="Eixos">
              {eixosChips.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`frete-min__eixo${eixos === n ? ' is-on' : ''}`}
                  onClick={() => setEixos(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="frete-min__label">
            Tipo de operação
            <div className="frete-min__tabelas">
              {TABELAS_FRETE_MINIMO.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`frete-min__tab${tabela === t.id ? ' is-on' : ''}`}
                  onClick={() => setTabela(t.id)}
                >
                  <span className="frete-min__tab-letra">{t.letra}</span>
                  <span>
                    <strong>{t.titulo}</strong>
                    <small>{t.sub}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <label className="frete-min__label">
            Tipo de carga
            <select
              className="frete-min__select"
              value={categoriaId === '' ? '' : String(categoriaId)}
              onChange={(e) => {
                const v = e.target.value
                setCategoriaId(v ? Number(v) : '')
              }}
            >
              {(CATEGORIAS_ANTT ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="frete-min__label">
            Data do cálculo
            <input
              className="frete-min__date"
              type="date"
              value={dataCalculo}
              onChange={(e) => setDataCalculo(e.target.value)}
            />
          </label>

          <button
            type="button"
            className={`frete-min__switch${retornoVazio ? ' is-on' : ''}`}
            role="switch"
            aria-checked={retornoVazio}
            onClick={() => setRetornoVazio((v) => !v)}
          >
            <span>Retorno vazio</span>
            <span className="frete-min__knob" aria-hidden>
              <i />
            </span>
          </button>

          <button
            type="button"
            className={`frete-min__switch${extras ? ' is-on' : ''}`}
            role="switch"
            aria-checked={extras}
            onClick={() => setExtras((v) => !v)}
          >
            <span>Margem, ICMS e R$/t</span>
            <span className="frete-min__knob" aria-hidden>
              <i />
            </span>
          </button>

          {extras ? (
            <div className="frete-min__extras">
              <label className="frete-min__label">
                Margem %
                <input
                  value={margem}
                  onChange={(e) => setMargem(e.target.value)}
                  inputMode="decimal"
                />
              </label>
              <label className="frete-min__label">
                ICMS %
                <input value={icms} onChange={(e) => setIcms(e.target.value)} inputMode="decimal" />
              </label>
              <label className="frete-min__label">
                Toneladas
                <input
                  value={toneladas}
                  onChange={(e) => setToneladas(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </label>
            </div>
          ) : null}

          {erro ? <p className="frete-min__erro">{erro}</p> : null}

          <button type="button" className="frete-min__calc" onClick={calcular}>
            <Wallet size={16} />
            Calcular piso
          </button>

          {res ? (
            <div className="frete-min__out">
              <p className="frete-min__out-kicker">Piso mínimo · {fmtDataBr(res.dataCalculo)}</p>
              <strong>{formatCurrency(res.total)}</strong>
              <div className="frete-min__out-grid">
                <span>
                  Piso ANTT
                  <b>{formatCurrency(res.piso)}</b>
                </span>
                <span>
                  CCD × km + CC
                  <b>
                    {res.ccd.toLocaleString('pt-BR', { minimumFractionDigits: 4 })} × {formatarKm(res.km)}
                    {res.retornoVazio ? ' × 1,92' : ''} + {res.cc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </b>
                </span>
                <span>
                  Tabela {res.tabela}
                  <b>
                    {res.eixos} eixos
                    {res.eixosUtilizados !== res.eixos ? ` · ANTT ${res.eixosUtilizados}` : ''}
                  </b>
                </span>
                <span>
                  Carga
                  <b>{res.categoriaLabel}</b>
                </span>
                {res.margemPct > 0 ? (
                  <span>
                    Margem {res.margemPct.toLocaleString('pt-BR')}%
                    <b>{formatCurrency(res.margemValor)}</b>
                  </span>
                ) : null}
                {res.icmsPct > 0 ? (
                  <span>
                    ICMS {res.icmsPct.toLocaleString('pt-BR')}%
                    <b>{formatCurrency(res.icmsValor)}</b>
                  </span>
                ) : null}
                {res.porTonelada != null ? (
                  <span>
                    Por tonelada
                    <b>{formatCurrency(res.porTonelada)}</b>
                  </span>
                ) : null}
              </div>
              <p className="frete-min__out-fonte">
                {res.fonte} · pedágio não está no piso
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
