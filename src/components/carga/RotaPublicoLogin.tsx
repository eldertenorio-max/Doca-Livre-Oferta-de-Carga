import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { GoogleGIcon } from './GoogleGIcon'
import { useRotaPublicoAuth } from '../../lib/rotaPublicoAuth'
import {
  rotaPublicoConfirmarCadastro,
  rotaPublicoConfirmarNovaSenha,
  rotaPublicoEnviarCodigoCadastro,
  rotaPublicoEnviarCodigoSenha,
} from '../../lib/rotaPublicoOtp'

type Aba = 'entrar' | 'criar'
type Passo = 'form' | 'codigo' | 'nova-senha'

function RotaPublicoLoginCampos({
  onPronto,
}: {
  onPronto?: () => void
}) {
  const auth = useRotaPublicoAuth()
  const [aba, setAba] = useState<Aba>('entrar')
  const [passo, setPasso] = useState<Passo>('form')
  const [fluxo, setFluxo] = useState<'cadastro' | 'senha' | null>(null)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [codigo, setCodigo] = useState('')
  const [busyOtp, setBusyOtp] = useState(false)
  const [erroOtp, setErroOtp] = useState('')
  const [infoOtp, setInfoOtp] = useState('')

  const busy = auth.busyEmail || busyOtp
  const erro = erroOtp || auth.erro
  const info = infoOtp || auth.info
  const onProntoRef = useRef(onPronto)
  onProntoRef.current = onPronto

  useEffect(() => {
    if (auth.conta && !auth.redefinirSenha) onProntoRef.current?.()
  }, [auth.conta, auth.redefinirSenha])

  function limparAvisos() {
    setErroOtp('')
    setInfoOtp('')
  }

  function voltarForm() {
    setPasso('form')
    setFluxo(null)
    setCodigo('')
    limparAvisos()
  }

  async function pedirCodigoCadastro() {
    if (senha !== senha2) return
    limparAvisos()
    setBusyOtp(true)
    const r = await rotaPublicoEnviarCodigoCadastro(email)
    setBusyOtp(false)
    if (!r.ok) {
      setErroOtp(r.erro)
      return
    }
    setFluxo('cadastro')
    setPasso('codigo')
    setInfoOtp(r.mensagem || 'Enviamos um código de 6 dígitos para o seu e-mail.')
  }

  async function pedirCodigoSenha() {
    limparAvisos()
    if (!email.includes('@')) {
      setErroOtp('Informe o e-mail da conta para enviarmos o código.')
      return
    }
    setBusyOtp(true)
    const r = await rotaPublicoEnviarCodigoSenha(email)
    setBusyOtp(false)
    if (!r.ok) {
      setErroOtp(r.erro)
      return
    }
    setFluxo('senha')
    setPasso('codigo')
    setSenha('')
    setSenha2('')
    setInfoOtp(r.mensagem || 'Enviamos um código de 6 dígitos para o seu e-mail.')
  }

  async function reenviarCodigo() {
    if (fluxo === 'cadastro') {
      await pedirCodigoCadastro()
      return
    }
    await pedirCodigoSenha()
  }

  async function confirmarCodigo() {
    limparAvisos()
    const digitos = codigo.replace(/\D/g, '')
    if (digitos.length !== 6) {
      setErroOtp('Digite o código de 6 números do e-mail.')
      return
    }
    if (fluxo === 'cadastro') {
      setBusyOtp(true)
      const r = await rotaPublicoConfirmarCadastro({
        email,
        codigo: digitos,
        senha,
        nome,
      })
      setBusyOtp(false)
      if (!r.ok) {
        setErroOtp(r.erro)
        return
      }
      const login = await auth.entrarEmail(email, senha)
      if (!login.ok) setErroOtp(login.erro || 'Conta criada. Entre com o e-mail e a senha.')
      return
    }
    await gravarNovaSenha()
  }

  async function gravarNovaSenha() {
    limparAvisos()
    if (senha !== senha2) return
    const digitos = codigo.replace(/\D/g, '')
    setBusyOtp(true)
    const r = await rotaPublicoConfirmarNovaSenha({ email, codigo: digitos, senha })
    setBusyOtp(false)
    if (!r.ok) {
      setErroOtp(r.erro)
      return
    }
    const login = await auth.entrarEmail(email, senha)
    if (!login.ok) setErroOtp(login.erro || 'Senha gravada. Entre com o e-mail e a senha nova.')
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (auth.redefinirSenha) {
      if (senha !== senha2) return
      await auth.novaSenha(senha)
      return
    }
    if (passo === 'codigo') {
      await confirmarCodigo()
      return
    }
    if (passo === 'nova-senha') {
      await gravarNovaSenha()
      return
    }
    if (aba === 'criar') {
      await pedirCodigoCadastro()
      return
    }
    await auth.entrarEmail(email, senha)
  }

  if (auth.redefinirSenha) {
    return (
      <form className="mapa-pub-login__form" onSubmit={(e) => void enviar(e)}>
        <p className="mapa-pub-login__aviso">Escolha uma senha nova para a calculadora.</p>
        <label>
          Nova senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            minLength={6}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Repetir senha
          <input
            type="password"
            value={senha2}
            onChange={(e) => setSenha2(e.target.value)}
            minLength={6}
            autoComplete="new-password"
            required
          />
        </label>
        {senha && senha2 && senha !== senha2 ? (
          <p className="mapa-pub-login__erro">As senhas não são iguais.</p>
        ) : null}
        <button type="submit" className="mapa-pub__btn mapa-pub__btn--solid" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar senha'}
        </button>
        {erro ? <p className="mapa-pub-login__erro">{erro}</p> : null}
        {info ? <p className="mapa-pub-login__ok">{info}</p> : null}
      </form>
    )
  }

  if (passo === 'codigo' || passo === 'nova-senha') {
    return (
      <form className="mapa-pub-login__form" onSubmit={(e) => void enviar(e)}>
        <p className="mapa-pub-login__aviso">
          {fluxo === 'senha'
            ? `Digite o código enviado para ${email} e escolha a senha nova.`
            : `Digite o código de 6 números que enviamos para ${email}.`}
        </p>
        <label>
          Código do e-mail
          <input
            className="mapa-pub-login__codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            required
          />
        </label>
        {fluxo === 'senha' ? (
          <>
            <label>
              Nova senha
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                minLength={6}
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Repetir senha
              <input
                type="password"
                value={senha2}
                onChange={(e) => setSenha2(e.target.value)}
                minLength={6}
                autoComplete="new-password"
                required
              />
            </label>
            {senha && senha2 && senha !== senha2 ? (
              <p className="mapa-pub-login__erro">As senhas não são iguais.</p>
            ) : null}
          </>
        ) : null}
        <button
          type="submit"
          className="mapa-pub__btn mapa-pub__btn--solid"
          disabled={busy || (fluxo === 'senha' && senha !== senha2)}
        >
          {busy
            ? 'Aguarde…'
            : fluxo === 'cadastro'
              ? 'Confirmar e criar conta'
              : 'Confirmar e salvar senha'}
        </button>
        <button type="button" className="mapa-pub-login__esqueci" disabled={busy} onClick={() => void reenviarCodigo()}>
          Reenviar código
        </button>
        <button type="button" className="mapa-pub-login__esqueci" disabled={busy} onClick={voltarForm}>
          Voltar
        </button>
        {erro ? <p className="mapa-pub-login__erro">{erro}</p> : null}
        {info ? <p className="mapa-pub-login__ok">{info}</p> : null}
      </form>
    )
  }

  return (
    <div className="mapa-pub-login">
      <p className="mapa-pub-login__aviso">
        Esta conta é só do site aberto (calculadora e mapa). Não abre o sistema Oferta de Carga.
      </p>
      <button
        type="button"
        className="mapa-pub__btn mapa-pub__btn--google"
        disabled={auth.busyGoogle || busy}
        onClick={() => void auth.entrar()}
      >
        <GoogleGIcon />
        {auth.busyGoogle ? 'Abrindo Google…' : 'Entrar com Google'}
      </button>
      <p className="mapa-pub-login__ou">ou e-mail e senha</p>
      <div className="mapa-pub-login__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={aba === 'entrar' ? 'is-on' : ''}
          aria-selected={aba === 'entrar'}
          onClick={() => {
            setAba('entrar')
            limparAvisos()
          }}
        >
          Entrar
        </button>
        <button
          type="button"
          role="tab"
          className={aba === 'criar' ? 'is-on' : ''}
          aria-selected={aba === 'criar'}
          onClick={() => {
            setAba('criar')
            limparAvisos()
          }}
        >
          Criar conta
        </button>
      </div>
      <form className="mapa-pub-login__form" onSubmit={(e) => void enviar(e)}>
        {aba === 'criar' ? (
          <label>
            Nome
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoComplete="name"
              placeholder="Como quer ser chamado"
            />
          </label>
        ) : null}
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="voce@email.com"
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            minLength={aba === 'criar' ? 6 : undefined}
            autoComplete={aba === 'criar' ? 'new-password' : 'current-password'}
            required
          />
        </label>
        {aba === 'criar' ? (
          <label>
            Repetir senha
            <input
              type="password"
              value={senha2}
              onChange={(e) => setSenha2(e.target.value)}
              minLength={6}
              autoComplete="new-password"
              required
            />
          </label>
        ) : null}
        {aba === 'criar' && senha && senha2 && senha !== senha2 ? (
          <p className="mapa-pub-login__erro">As senhas não são iguais.</p>
        ) : null}
        {aba === 'criar' ? (
          <p className="mapa-pub-login__aviso">Vamos enviar um código de 6 números para este e-mail, para confirmar.</p>
        ) : null}
        <button
          type="submit"
          className="mapa-pub__btn mapa-pub__btn--solid"
          disabled={busy || (aba === 'criar' && senha !== senha2)}
        >
          {busy ? 'Aguarde…' : aba === 'criar' ? 'Enviar código' : 'Entrar'}
        </button>
        {aba === 'entrar' ? (
          <button type="button" className="mapa-pub-login__esqueci" disabled={busy} onClick={() => void pedirCodigoSenha()}>
            Esqueci a senha
          </button>
        ) : null}
        {erro ? <p className="mapa-pub-login__erro">{erro}</p> : null}
        {info ? <p className="mapa-pub-login__ok">{info}</p> : null}
      </form>
    </div>
  )
}

export function RotaPublicoLoginPanel() {
  return <RotaPublicoLoginCampos />
}

export function RotaPublicoLoginModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="mapa-pub-modal" role="dialog" aria-modal="true" aria-labelledby="rota-pub-login-title">
      <div className="mapa-pub-modal__card mapa-pub-modal__card--login">
        <div className="mapa-pub-modal__topo">
          <h2 id="rota-pub-login-title">Entrar na calculadora</h2>
          <button type="button" className="mapa-pub-modal__x" aria-label="Fechar" onClick={onClose}>
            <X size={22} strokeWidth={2.7} />
          </button>
        </div>
        <RotaPublicoLoginCampos onPronto={onClose} />
      </div>
    </div>,
    document.body,
  )
}
