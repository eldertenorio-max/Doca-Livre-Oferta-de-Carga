import { useMemo, useRef, useState } from 'react'
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
import { AjudaWhatsFabs } from './AjudaWhatsFabs'
import '../../styles/frete-minimo.css'

type Props = {
  kmRota?: number | null
  pedagioRota?: number | null
  eixosInicial?: number
  categoriaInicial?: number | ''
  onPedirRota?: () => void
  /** Card com borda — calculadora do sistema. */
  variante?: 'publico' | 'sistema'
  /** Formulário direto, sem accordion (página própria). */
  pagina?: boolean
}

function fmtDataBr(iso: string) {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function fmtCoef(n: number, casas = 4) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

function formatarDinheiro(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function FreteMinimoCalc({
  kmRota = null,
  pedagioRota = null,
  eixosInicial = 5,
  categoriaInicial = 5,
  onPedirRota,
  variante = 'publico',
  pagina = false,
}: Props) {
  const [km, setKm] = useState(() => (kmRota && kmRota > 0 ? formatarKm(kmRota) : ''))
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
  const [pedagio, setPedagio] = useState(() =>
    pedagioRota != null && pedagioRota > 0 ? formatarDinheiro(pedagioRota) : '',
  )
  const [erro, setErro] = useState('')
  const [res, setRes] = useState<FreteMinimoResultado | null>(null)
  const [animKey, setAnimKey] = useState(0)
  const outRef = useRef<HTMLElement>(null)

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
      pedagio: parseNumeroBr(pedagio) || 0,
      dataCalculo,
    })
    if (!out.ok) {
      setRes(null)
      setErro(out.erro)
      return
    }
    setErro('')
    setRes(out.data)
    setAnimKey((k) => k + 1)
    requestAnimationFrame(() => {
      outRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  const kmRotaOk = kmRota != null && kmRota > 0
  const pedagioRotaOk = pedagioRota != null && pedagioRota > 0
  const classe = [
    'frete-min',
    variante === 'sistema' ? 'frete-min--sistema' : '',
    pagina ? 'frete-min--pagina' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const formulario = (
    <>
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
              aria-pressed={eixos === n}
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

      <label className="frete-min__label">
        Pedágio (R$)
        <div className="frete-min__km">
          <span className="frete-min__prefix" aria-hidden>
            R$
          </span>
          <input
            value={pedagio}
            onChange={(e) => setPedagio(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            aria-label="Valor do pedágio"
          />
          {pedagioRotaOk ? (
            <button
              type="button"
              className="frete-min__km-btn"
              onClick={() => setPedagio(formatarDinheiro(pedagioRota ?? 0))}
            >
              Usar da rota
            </button>
          ) : null}
        </div>
        <small className="frete-min__hint">Opcional. Não entra no piso ANTT — vale-pedágio à parte.</small>
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
    </>
  )

  if (pagina) {
    return (
      <section className={classe}>
        <div className="frete-min__col frete-min__col--form">
          <h1 className="frete-min__pagina-titulo">Calculadora de Frete</h1>
          <div className="frete-min__body">{formulario}</div>
          <AjudaWhatsFabs className="rota-map-ajuda--form" />
        </div>
        <aside
          ref={outRef}
          className={`frete-min__col frete-min__col--out${res ? ' is-filled' : ''}`}
          aria-live="polite"
        >
          {res ? (
            <FreteMinimoResultadoPainel key={animKey} res={res} />
          ) : (
            <FreteMinimoResultadoPainel res={null} />
          )}
        </aside>
      </section>
    )
  }

  return (
    <section className={classe}>
      <div className="frete-min__body">{formulario}</div>
      {res ? (
        <div className="frete-min__out-wrap">
          <FreteMinimoResultadoPainel key={animKey} res={res} />
        </div>
      ) : null}
    </section>
  )
}

function FreteMinimoResultadoPainel({ res }: { res: FreteMinimoResultado | null }) {
  if (!res) {
    return (
      <div className="frete-min__vazio">
        <p className="frete-min__out-kicker">Resultado do piso</p>
        <strong>Preencha os dados ao lado</strong>
        <p>
          Informe km, eixos, tabela ANTT e o tipo de carga. O valor aparece aqui com a composição do
          piso, R$/km e a comparação entre as Tabelas A, B, C e D.
        </p>
      </div>
    )
  }

  const eixosDif = res.eixosUtilizados !== res.eixos

  return (
    <div className="frete-min__resultado">
      <p className="frete-min__out-kicker">Piso mínimo · {fmtDataBr(res.dataCalculo)}</p>
      <p className="frete-min__resultado-label">Total a receber no mínimo</p>
      <strong className="frete-min__resultado-total">{formatCurrency(res.total)}</strong>
      <p className="frete-min__resultado-sub">
        {formatCurrency(res.totalPorKm)} / km
        {res.porTonelada != null ? ` · ${formatCurrency(res.porTonelada)} / t` : ''}
      </p>

      <ol className="frete-min__conta">
        <li>
          <span>
            Deslocamento
            <em>
              CCD {fmtCoef(res.ccd)} × {formatarKm(res.km)} km
              {res.retornoVazio ? ' × 1,92' : ''}
            </em>
          </span>
          <b>{formatCurrency(res.deslocamento)}</b>
        </li>
        <li>
          <span>
            Carga e descarga
            <em>CC da tabela {res.tabela}</em>
          </span>
          <b>{formatCurrency(res.cargaDescarga)}</b>
        </li>
        <li>
          <span>
            Piso ANTT
            <em>deslocamento + carga e descarga</em>
          </span>
          <b>{formatCurrency(res.piso)}</b>
        </li>
        {res.margemPct > 0 ? (
          <li>
            <span>
              Margem {res.margemPct.toLocaleString('pt-BR')}%
              <em>sobre o piso</em>
            </span>
            <b>{formatCurrency(res.margemValor)}</b>
          </li>
        ) : null}
        {res.icmsPct > 0 ? (
          <li>
            <span>
              ICMS {res.icmsPct.toLocaleString('pt-BR')}%
              <em>sobre piso + margem</em>
            </span>
            <b>{formatCurrency(res.icmsValor)}</b>
          </li>
        ) : null}
        {res.pedagio > 0 ? (
          <li>
            <span>
              Pedágio
              <em>informado · não entra no piso ANTT</em>
            </span>
            <b>{formatCurrency(res.pedagio)}</b>
          </li>
        ) : null}
        <li className="is-total">
          <span>Total</span>
          <b>{formatCurrency(res.total)}</b>
        </li>
      </ol>

      <div className="frete-min__fatos">
        <span>
          Distância
          <b>{formatarKm(res.km)} km</b>
        </span>
        <span>
          Eixos
          <b>
            {res.eixos}
            {eixosDif ? ` · ANTT usa ${res.eixosUtilizados}` : ''}
          </b>
        </span>
        <span>
          Tabela {res.tabela}
          <b>
            {res.tabelaTitulo}
            <i>{res.tabelaSub}</i>
          </b>
        </span>
        <span>
          Carga
          <b>{res.categoriaLabel}</b>
        </span>
        <span>
          Retorno vazio
          <b>{res.retornoVazio ? `Sim · fator ${fmtCoef(res.fatorRetorno, 2)}` : 'Não'}</b>
        </span>
        <span>
          Piso por km
          <b>{formatCurrency(res.pisoPorKm)}</b>
        </span>
        {res.toneladas != null ? (
          <span>
            Toneladas
            <b>
              {res.toneladas.toLocaleString('pt-BR')} t
              {res.porTonelada != null ? ` · ${formatCurrency(res.porTonelada)}/t` : ''}
            </b>
          </span>
        ) : null}
        {res.pedagio > 0 ? (
          <span>
            Pedágio
            <b>{formatCurrency(res.pedagio)}</b>
          </span>
        ) : null}
      </div>

      {eixosDif ? (
        <p className="frete-min__aviso">
          Não há coeficiente para {res.eixos} eixos nessa carga. A ANTT aplica o de{' '}
          {res.eixosUtilizados} eixos.
        </p>
      ) : null}

      <div className="frete-min__comp">
        <p>Comparativo das tabelas (mesmo km, eixos e carga)</p>
        <ul>
          {res.comparativoTabelas.map((t) => (
            <li key={t.id} className={t.id === res.tabela ? 'is-on' : ''}>
              <span>
                {t.letra} · {t.titulo}
              </span>
              <b>{t.valor != null ? formatCurrency(t.valor) : '—'}</b>
            </li>
          ))}
        </ul>
      </div>

      <p className="frete-min__formula">
        Fórmula do piso: CCD × km{res.retornoVazio ? ' × 1,92' : ''} + CC. O pedágio informado é
        somado à parte e não faz parte do piso ANTT (Lei 13.703/2018). Combustível também não entra.
      </p>
      <p className="frete-min__out-fonte">{res.fonte}</p>
    </div>
  )
}
