import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { GoogleGIcon } from './GoogleGIcon'
import { useRotaPublicoAuth } from '../../lib/rotaPublicoAuth'

type Aba = 'entrar' | 'criar'

function RotaPublicoLoginCampos({
  onPronto,
}: {
  onPronto?: () => void
}) {
  const auth = useRotaPublicoAuth()
  const [aba, setAba] = useState<Aba>('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')

  useEffect(() => {
    if (auth.conta && !auth.redefinirSenha) onPronto?.()
  }, [auth.conta, auth.redefinirSenha, onPronto])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (auth.redefinirSenha) {
      if (senha !== senha2) return
      await auth.novaSenha(senha)
      return
    }
    if (aba === 'criar') {
      if (senha !== senha2) return
      await auth.cadastrar(email, senha, nome)
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
        <button type="submit" className="mapa-pub__btn mapa-pub__btn--solid" disabled={auth.busyEmail}>
          {auth.busyEmail ? 'Salvando…' : 'Salvar senha'}
        </button>
        {auth.erro ? <p className="mapa-pub-login__erro">{auth.erro}</p> : null}
        {auth.info ? <p className="mapa-pub-login__ok">{auth.info}</p> : null}
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
        disabled={auth.busyGoogle || auth.busyEmail}
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
          onClick={() => setAba('entrar')}
        >
          Entrar
        </button>
        <button
          type="button"
          role="tab"
          className={aba === 'criar' ? 'is-on' : ''}
          aria-selected={aba === 'criar'}
          onClick={() => setAba('criar')}
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
        <button
          type="submit"
          className="mapa-pub__btn mapa-pub__btn--solid"
          disabled={auth.busyEmail || (aba === 'criar' && senha !== senha2)}
        >
          {auth.busyEmail ? 'Aguarde…' : aba === 'criar' ? 'Criar conta' : 'Entrar'}
        </button>
        {aba === 'entrar' ? (
          <button
            type="button"
            className="mapa-pub-login__esqueci"
            disabled={auth.busyEmail || !email.includes('@')}
            onClick={() => void auth.recuperar(email)}
          >
            Esqueci a senha
          </button>
        ) : null}
        {auth.erro ? <p className="mapa-pub-login__erro">{auth.erro}</p> : null}
        {auth.info ? <p className="mapa-pub-login__ok">{auth.info}</p> : null}
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
