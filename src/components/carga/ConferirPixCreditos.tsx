import { useState } from 'react'
import { formatCurrency } from '../../lib/businessRules'
import {
  consultarPixCreditoRota,
  type ConsultaPixCredito,
} from '../../lib/rotaPublicoCreditos'

function formatarQuando(iso?: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR')
  } catch {
    return iso
  }
}

export function ConferirPixCreditos() {
  const [codigo, setCodigo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState<ConsultaPixCredito | null>(null)

  async function conferir() {
    setBuscando(true)
    setErro('')
    setDados(null)
    const r = await consultarPixCreditoRota(codigo)
    setBuscando(false)
    if (!r.ok) {
      setErro(r.erro || 'Não foi possível consultar.')
      return
    }
    setDados(r.dados ?? null)
  }

  return (
    <section className="financeiro-pix">
      <div>
        <h2 className="financeiro-pix__title">Conferir PIX da calculadora</h2>
        <p className="financeiro-pix__sub">
          Cole o código do pagamento (Asaas <code>pay_…</code> ou o código antigo). Se já estiver
          creditado, é comprovante antigo — não libere créditos de novo.
        </p>
      </div>
      <form
        className="financeiro-pix__row"
        onSubmit={(e) => {
          e.preventDefault()
          void conferir()
        }}
      >
        <label className="financeiro-pix__label">
          Código do pagamento
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Ex.: pay_080225913252"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" className="cadastro-btn cadastro-btn--primary" disabled={buscando}>
          {buscando ? 'Consultando…' : 'Conferir código'}
        </button>
      </form>
      {erro ? <p className="financeiro-pix__erro">{erro}</p> : null}
      {dados && !dados.encontrado ? (
        <p className="financeiro-pix__vazio">
          Código <strong>{dados.txid}</strong> não adicionou créditos. O PIX ainda não caiu, ou o
          código está errado.
        </p>
      ) : null}
      {dados?.encontrado && dados.status === 'pendente' && !dados.ja_creditado ? (
        <p className="financeiro-pix__vazio">
          PIX gerado, ainda <strong>não pago</strong> (código {dados.txid}). Não libere crédito na
          mão até o Asaas confirmar.
        </p>
      ) : null}
      {dados?.encontrado && dados.status === 'pago' && !dados.ja_creditado ? (
        <p className="financeiro-pix__vazio">
          PIX do plano já pago para <strong>{dados.email || '—'}</strong>. Isso não é crédito da
          calculadora.
        </p>
      ) : null}
      {dados?.encontrado && dados.ja_creditado ? (
        <div className="financeiro-pix__alerta" role="status">
          <strong>Já creditado — não aceite comprovante antigo.</strong>
          <ul>
            <li>
              Código: <code>{dados.txid}</code>
            </li>
            <li>Quando: {formatarQuando(dados.quando)}</li>
            <li>Conta Google: {dados.email || '—'}</li>
            <li>
              Pacote: {dados.creditos ?? '—'} créditos
              {dados.valor != null ? ` · ${formatCurrency(Number(dados.valor))}` : ''}
            </li>
            <li>Saldo atual nessa conta: {dados.saldo_atual ?? '—'}</li>
          </ul>
        </div>
      ) : null}
    </section>
  )
}
