import { useEffect, useState } from 'react'
import { Gift } from 'lucide-react'
import { useData } from '../../context/DataContext'
import {
  listarPresentesRota,
  presentearCreditosRota,
  statusPresenteRota,
  type PresenteRotaItem,
} from '../../lib/rotaPublicoPresente'

const ATALHOS = [10, 20, 50]

function formatarQuando(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR')
  } catch {
    return iso
  }
}

export function PresentearCreditosRota() {
  const { user } = useData()
  const [email, setEmail] = useState('')
  const [creditos, setCreditos] = useState(10)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [resendOn, setResendOn] = useState<boolean | null>(null)
  const [lista, setLista] = useState<PresenteRotaItem[]>([])

  const adminEmail = user?.email || ''
  const adminUsuario = user?.usuario || ''

  async function carregarLista() {
    const r = await listarPresentesRota({ adminEmail, adminUsuario })
    if (r.ok) setLista(r.presentes)
  }

  useEffect(() => {
    void statusPresenteRota().then((r) => {
      if (r.ok) setResendOn(Boolean(r.resend))
    })
    void listarPresentesRota({ adminEmail, adminUsuario }).then((r) => {
      if (r.ok) setLista(r.presentes)
    })
  }, [adminEmail, adminUsuario])

  async function enviar() {
    setErro('')
    setOk('')
    const destino = email.trim().toLowerCase()
    const n = Math.floor(Number(creditos))
    if (!destino.includes('@')) {
      setErro('Informe o e-mail da pessoa. O presente só entra nessa conta Google.')
      return
    }
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      setErro('Informe de 1 a 500 créditos.')
      return
    }
    setEnviando(true)
    const r = await presentearCreditosRota({
      email: destino,
      creditos: n,
      adminEmail,
      adminUsuario,
    })
    setEnviando(false)
    if (!r.ok) {
      setErro(r.erro || 'Não foi possível enviar o presente.')
      return
    }
    const conta = r.contaExiste
      ? 'Os créditos já estão na conta Google.'
      : 'Quando ela entrar com Google neste e-mail, os créditos entram sozinhos.'
    const mail = r.emailEnviado
      ? ' E-mail de parabéns enviado.'
      : r.emailErro === 'smtp_nao_configurado'
        ? ' Crédito dado, mas o e-mail não saiu (falta RESEND_API_KEY).'
        : ' Crédito dado, mas o e-mail não saiu.'
    setOk(`Presente de ${n} crédito${n === 1 ? '' : 's'} para ${destino}. ${conta}${mail}`)
    setEmail('')
    setCreditos(10)
    void carregarLista()
  }

  return (
    <section className="financeiro-pix financeiro-presente">
      <div>
        <h2 className="financeiro-pix__title">
          <Gift size={18} strokeWidth={2.4} aria-hidden />
          Presentear créditos
        </h2>
        <p className="financeiro-pix__sub">
          Só por aqui, só pelo e-mail que você informar. A pessoa recebe um e-mail de parabéns e, ao
          entrar com Google neste e-mail na calculadora, vê a mensagem do presente.
          {resendOn === false ? ' Falta RESEND_API_KEY para o e-mail sair.' : ''}
        </p>
      </div>
      <form
        className="financeiro-pix__row"
        onSubmit={(e) => {
          e.preventDefault()
          void enviar()
        }}
      >
        <label className="financeiro-pix__label financeiro-presente__email">
          E-mail da pessoa (conta Google)
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@gmail.com"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>
        <label className="financeiro-pix__label financeiro-presente__qtd">
          Créditos
          <input
            type="number"
            min={1}
            max={500}
            value={creditos}
            onChange={(e) => setCreditos(Number(e.target.value))}
          />
        </label>
        <button type="submit" className="cadastro-btn cadastro-btn--primary" disabled={enviando}>
          {enviando ? 'Enviando…' : `Presentear ${Math.max(1, Math.floor(Number(creditos) || 0))} créditos`}
        </button>
      </form>
      <div className="financeiro-presente__atalhos" role="group" aria-label="Quantidades rápidas">
        {ATALHOS.map((n) => (
          <button
            key={n}
            type="button"
            className={`financeiro-presente__atalho${creditos === n ? ' is-on' : ''}`}
            onClick={() => setCreditos(n)}
          >
            {n}
          </button>
        ))}
      </div>
      {erro ? <p className="financeiro-pix__erro">{erro}</p> : null}
      {ok ? (
        <div className="financeiro-presente__ok" role="status">
          {ok}
        </div>
      ) : null}
      {lista.length > 0 ? (
        <ul className="financeiro-presente__lista">
          {lista.map((p) => (
            <li key={p.id}>
              <strong>{p.creditos} crédito{p.creditos === 1 ? '' : 's'}</strong>
              <span>{p.email}</span>
              <em>
                {formatarQuando(p.criado_em)}
                {p.aplicado_em ? ' · na conta' : ' · aguardando Google'}
                {p.email_enviado_em ? ' · e-mail ok' : p.email_erro ? ' · e-mail falhou' : ''}
              </em>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
