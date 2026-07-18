import { useEffect, useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { BRAND_EMBARCADOR_LABEL, LOGO_DOCA_LIVRE_SRC } from '../lib/brandAssets'
import { ProductMark } from '../components/ProductMark'
import {
  portalCadastroConcluir,
  portalCadastroEnviarCodigo,
  portalCadastroVerificarCodigo,
  portalSenhaEnviarCodigo,
  portalSenhaRedefinir,
  portalSenhaVerificarCodigo,
} from '../lib/portalApi'
import '../styles/login.css'
import '../styles/shell.css'

type Mode = 'login' | 'cadastro' | 'senha'
type Step = 'form' | 'codigo' | 'dados'

export function LoginPage() {
  const { login, user, demoUsers } = useData()

  const [mode, setMode] = useState<Mode>('login')
  const [step, setStep] = useState<Step>('form')
  const [usuario, setUsuario] = useState('minerva@docalivre.com')
  const [senha, setSenha] = useState('minerva123')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [email, setEmail] = useState('')
  const [identificador, setIdentificador] = useState('')
  const [codigo, setCodigo] = useState('')
  const [verifyToken, setVerifyToken] = useState('')
  const [debugCodigo, setDebugCodigo] = useState('')
  const [visible, setVisible] = useState(false)
  const [visibleConfirm, setVisibleConfirm] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
  }, [])

  // Etapa "Criar conta": garante campos vazios (evita autofill do navegador)
  // IMPORTANTE: todos os hooks devem ficar acima de qualquer return condicional.
  useEffect(() => {
    if (mode === 'cadastro' && step === 'dados') {
      setUsuario('')
      setSenha('')
      setConfirmarSenha('')
      setVisible(false)
      setVisibleConfirm(false)
    }
  }, [mode, step, verifyToken])

  if (user) {
    const dest =
      user.role === 'transportador'
        ? '/transportador'
        : user.is_superuser || user.role === 'super'
          ? '/minerva'
          : '/minerva'
    return <Navigate to={dest} replace />
  }

  function goMode(next: Mode) {
    setMode(next)
    setStep('form')
    setCodigo('')
    setVerifyToken('')
    setDebugCodigo('')
    setSenha('')
    setConfirmarSenha('')
    setVisible(false)
    setVisibleConfirm(false)
    setError('')
    setInfo('')
    if (next === 'cadastro') {
      setUsuario('')
      setEmail('')
    }
    if (next === 'login') {
      setUsuario('minerva@docalivre.com')
      setSenha('minerva123')
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    const res = login(usuario.trim(), senha)
    setLoading(false)
    if (!res.ok) {
      setError(res.error ?? 'Falha no login')
      return
    }
    // Destino pelo <Navigate> quando `user` for atualizado (minerva / transportador / super)
  }

  async function handleCadastroEnviar(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    const result = await portalCadastroEnviarCodigo(email.trim())
    setLoading(false)
    if (!result.ok) {
      setError(result.erro)
      return
    }
    setInfo(result.mensagem || 'Código enviado para o e-mail. Verifique a caixa de entrada e o spam.')
    setDebugCodigo(result.debug_codigo || '')
    setStep('codigo')
  }

  async function handleCadastroVerificar(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    const result = await portalCadastroVerificarCodigo(email.trim(), codigo.trim())
    setLoading(false)
    if (!result.ok) {
      setError(result.erro)
      return
    }
    setVerifyToken(result.verify_token)
    setInfo(result.mensagem || 'E-mail confirmado. Defina usuário e senha.')
    setUsuario('')
    setSenha('')
    setConfirmarSenha('')
    setCodigo('')
    setDebugCodigo('')
    setStep('dados')
  }

  async function handleCadastroConcluir(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (senha !== confirmarSenha) {
      setError('As senhas não coincidem.')
      return
    }
    setLoading(true)
    const result = await portalCadastroConcluir({
      verifyToken,
      usuario: usuario.trim(),
      senha,
      confirmarSenha,
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.erro)
      return
    }
    setUsuario(result.usuario || usuario)
    setSenha('')
    setConfirmarSenha('')
    goMode('login')
    setInfo(result.mensagem || 'Cadastro realizado. Faça login.')
  }

  async function handleSenhaEnviar(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    const result = await portalSenhaEnviarCodigo(identificador.trim())
    setLoading(false)
    if (!result.ok) {
      setError(result.erro)
      return
    }
    setInfo(
      (result.mensagem || 'Código enviado.') +
        (result.email_mascarado ? ` (${result.email_mascarado})` : ''),
    )
    if (result.debug_codigo) setDebugCodigo(result.debug_codigo)
    setStep('codigo')
  }

  async function handleSenhaVerificar(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    const result = await portalSenhaVerificarCodigo(identificador.trim(), codigo.trim())
    setLoading(false)
    if (!result.ok) {
      setError(result.erro)
      return
    }
    setVerifyToken(result.verify_token)
    if (result.usuario) setUsuario(result.usuario)
    setInfo('Código confirmado. Defina a nova senha.')
    setCodigo('')
    setDebugCodigo('')
    setStep('dados')
  }

  async function handleSenhaRedefinir(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (senha !== confirmarSenha) {
      setError('As senhas não coincidem.')
      return
    }
    setLoading(true)
    const result = await portalSenhaRedefinir({
      verifyToken,
      senha,
      confirmarSenha,
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.erro)
      return
    }
    setUsuario(result.usuario || usuario)
    setSenha('')
    setConfirmarSenha('')
    goMode('login')
    setInfo(result.mensagem || 'Senha atualizada. Faça login.')
  }

  const title =
    mode === 'login'
      ? 'Login'
      : mode === 'cadastro'
        ? step === 'codigo'
          ? 'Confirmar e-mail'
          : step === 'dados'
            ? 'Criar conta'
            : 'Cadastro'
        : step === 'codigo'
          ? 'Confirmar e-mail'
          : step === 'dados'
            ? 'Nova senha'
            : 'Trocar senha'

  const tagline =
    mode === 'login'
      ? 'Acesse o Oferta de Carga'
      : mode === 'cadastro'
        ? step === 'codigo'
          ? 'Cole o código enviado para o seu e-mail'
          : step === 'dados'
            ? 'Escolha usuário e senha. Super Users: Diego ou Elder'
            : 'Informe o e-mail para receber o código de confirmação'
        : step === 'codigo'
          ? 'Cole o código enviado para o seu e-mail'
          : step === 'dados'
            ? 'Defina a nova senha de acesso'
            : 'Informe usuário ou e-mail cadastrado'

  return (
    <div className="portal-login">
      <div className="portal-login__card">
        <header className="portal-login__header">
          <img src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" className="portal-login__logo" />
          {step !== 'codigo' && (
            <div className="portal-login__product">
              <ProductMark size="md" />
            </div>
          )}
          <h1 className="portal-login__title">{title}</h1>
          <p className="portal-login__tagline">{tagline}</p>
        </header>

        {mode === 'login' && (
          <form className="portal-login__form" onSubmit={handleLogin}>
            <label className="portal-login__label" htmlFor="login-user">
              Usuário ou e-mail
            </label>
            <input
              id="login-user"
              className="portal-login__input"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              required
              autoComplete="username"
            />
            <label className="portal-login__label" htmlFor="login-senha">
              Senha
            </label>
            <PasswordInput
              id="login-senha"
              value={senha}
              visible={visible}
              onToggle={() => setVisible((v) => !v)}
              onChange={setSenha}
            />
            {error && <p className="portal-login__erro">{error}</p>}
            {info && <p className="portal-login__info">{info}</p>}
            <button type="submit" className="portal-login__submit" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        )}

        {mode === 'cadastro' && step === 'form' && (
          <form className="portal-login__form" onSubmit={handleCadastroEnviar}>
            <label className="portal-login__label" htmlFor="cad-email">
              E-mail
            </label>
            <input
              id="cad-email"
              className="portal-login__input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <p className="portal-login__hint">
              Enviaremos um código de 6 dígitos para confirmar o e-mail.
            </p>
            {error && <p className="portal-login__erro">{error}</p>}
            <button type="submit" className="portal-login__submit" disabled={loading}>
              {loading ? 'Enviando…' : 'Enviar código'}
            </button>
          </form>
        )}

        {mode === 'cadastro' && step === 'codigo' && (
          <form className="portal-login__form" onSubmit={handleCadastroVerificar}>
            <p className="portal-login__lead">
              Enviamos um código para <strong>{email.trim().toLowerCase()}</strong>. Abra o
              e-mail, copie o código e cole abaixo.
            </p>
            <label className="portal-login__label" htmlFor="cad-codigo">
              Código
            </label>
            <input
              id="cad-codigo"
              className="portal-login__input portal-login__input--otp"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              inputMode="numeric"
              maxLength={6}
              placeholder="0 0 0 0 0 0"
              autoComplete="one-time-code"
            />
            {debugCodigo && (
              <p className="portal-login__info">
                Debug — código: <strong>{debugCodigo}</strong>
              </p>
            )}
            {error && <p className="portal-login__erro">{error}</p>}
            {!error && (
              <p className="portal-login__info">
                {info || 'Código enviado. Confira sua caixa de entrada.'}
              </p>
            )}
            <button type="submit" className="portal-login__submit" disabled={loading}>
              {loading ? 'Validando…' : 'Confirmar código'}
            </button>
          </form>
        )}

        {mode === 'cadastro' && step === 'dados' && (
          <form
            key={`cadastro-dados-${verifyToken || 'new'}`}
            className="portal-login__form"
            onSubmit={handleCadastroConcluir}
            autoComplete="off"
          >
            <label className="portal-login__label" htmlFor="cad-user-novo">
              Usuário
            </label>
            <input
              id="cad-user-novo"
              name="cadastro_usuario_novo"
              className="portal-login__input"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              required
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <label className="portal-login__label" htmlFor="cad-senha-nova">
              Senha
            </label>
            <PasswordInput
              id="cad-senha-nova"
              value={senha}
              visible={visible}
              onToggle={() => setVisible((v) => !v)}
              onChange={setSenha}
              autoComplete="new-password"
            />
            <label className="portal-login__label" htmlFor="cad-senha2-nova">
              Confirmar senha
            </label>
            <PasswordInput
              id="cad-senha2-nova"
              value={confirmarSenha}
              visible={visibleConfirm}
              onToggle={() => setVisibleConfirm((v) => !v)}
              onChange={setConfirmarSenha}
              autoComplete="new-password"
            />
            {error && <p className="portal-login__erro">{error}</p>}
            <button type="submit" className="portal-login__submit" disabled={loading}>
              {loading ? 'Criando…' : 'Criar conta'}
            </button>
          </form>
        )}

        {mode === 'senha' && step === 'form' && (
          <form className="portal-login__form" onSubmit={handleSenhaEnviar}>
            <label className="portal-login__label" htmlFor="senha-id">
              Usuário ou e-mail
            </label>
            <input
              id="senha-id"
              className="portal-login__input"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              required
            />
            {error && <p className="portal-login__erro">{error}</p>}
            <button type="submit" className="portal-login__submit" disabled={loading}>
              {loading ? 'Enviando…' : 'Enviar código'}
            </button>
          </form>
        )}

        {mode === 'senha' && step === 'codigo' && (
          <form className="portal-login__form" onSubmit={handleSenhaVerificar}>
            <p className="portal-login__lead">
              Enviamos um código para o e-mail da conta <strong>{identificador.trim()}</strong>.
              Abra o e-mail, copie o código e cole abaixo.
            </p>
            <label className="portal-login__label" htmlFor="senha-codigo">
              Código
            </label>
            <input
              id="senha-codigo"
              className="portal-login__input portal-login__input--otp"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              inputMode="numeric"
              maxLength={6}
              placeholder="0 0 0 0 0 0"
              autoComplete="one-time-code"
            />
            {debugCodigo && (
              <p className="portal-login__info">
                Debug — código: <strong>{debugCodigo}</strong>
              </p>
            )}
            {error && <p className="portal-login__erro">{error}</p>}
            {!error && (
              <p className="portal-login__info">
                {info || 'Código enviado. Confira sua caixa de entrada.'}
              </p>
            )}
            <button type="submit" className="portal-login__submit" disabled={loading}>
              {loading ? 'Validando…' : 'Confirmar código'}
            </button>
          </form>
        )}

        {mode === 'senha' && step === 'dados' && (
          <form className="portal-login__form" onSubmit={handleSenhaRedefinir}>
            <label className="portal-login__label" htmlFor="nova-senha">
              Nova senha
            </label>
            <PasswordInput
              id="nova-senha"
              value={senha}
              visible={visible}
              onToggle={() => setVisible((v) => !v)}
              onChange={setSenha}
            />
            <label className="portal-login__label" htmlFor="nova-senha2">
              Confirmar senha
            </label>
            <PasswordInput
              id="nova-senha2"
              value={confirmarSenha}
              visible={visibleConfirm}
              onToggle={() => setVisibleConfirm((v) => !v)}
              onChange={setConfirmarSenha}
              autoComplete="new-password"
            />
            {error && <p className="portal-login__erro">{error}</p>}
            <button type="submit" className="portal-login__submit" disabled={loading}>
              Salvar nova senha
            </button>
          </form>
        )}

        <div className="portal-login__links">
          {step === 'codigo' && mode === 'cadastro' && (
            <>
              <button
                type="button"
                className="portal-login__link"
                disabled={loading}
                onClick={() => {
                  setCodigo('')
                  setDebugCodigo('')
                  setError('')
                  setInfo('')
                  setStep('form')
                }}
              >
                Reenviar / outro e-mail
              </button>
              <button type="button" className="portal-login__link" onClick={() => goMode('login')}>
                Voltar ao login
              </button>
            </>
          )}
          {step === 'codigo' && mode === 'senha' && (
            <>
              <button
                type="button"
                className="portal-login__link"
                disabled={loading}
                onClick={() => {
                  setCodigo('')
                  setDebugCodigo('')
                  setError('')
                  setInfo('')
                  setStep('form')
                }}
              >
                Reenviar / outro e-mail
              </button>
              <button type="button" className="portal-login__link" onClick={() => goMode('login')}>
                Voltar ao login
              </button>
            </>
          )}
          {mode !== 'login' && step !== 'codigo' && (
            <button type="button" className="portal-login__link" onClick={() => goMode('login')}>
              Voltar ao login
            </button>
          )}
          {mode === 'login' && (
            <>
              <Link to="/cadastro-transportador" className="portal-login__link">
                Quero ser transportador
              </Link>
              <button type="button" className="portal-login__link" onClick={() => goMode('cadastro')}>
                Criar conta (equipe / Super)
              </button>
              <button type="button" className="portal-login__link" onClick={() => goMode('senha')}>
                Esqueci a senha
              </button>
            </>
          )}
        </div>

        {mode === 'login' && (
          <div className="portal-login__demos">
            <p className="portal-login__demos-title">Contas demo (operação)</p>
            {demoUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                className="portal-login__demo-btn"
                onClick={() => {
                  setUsuario(u.email)
                  setSenha(u.password)
                }}
              >
                <strong>
                  {u.role === 'minerva' ? BRAND_EMBARCADOR_LABEL : u.role}
                </strong>{' '}
                — {u.email}
              </button>
            ))}
            <p className="portal-login__hint" style={{ marginTop: 10 }}>
              Transportadores novos: use o link <strong>Quero ser transportador</strong> (após
              aprovação no menu Transportadoras). Super Users (Diego / Elder):{' '}
              <strong>Criar conta (equipe / Super)</strong>.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function PasswordInput({
  id,
  value,
  visible,
  onToggle,
  onChange,
  autoComplete = 'current-password',
}: {
  id: string
  value: string
  visible: boolean
  onToggle: () => void
  onChange: (v: string) => void
  autoComplete?: string
}) {
  return (
    <div className="portal-login__password-wrap">
      <input
        id={id}
        name={id}
        className="portal-login__input portal-login__input--password"
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="portal-login__password-toggle"
        onClick={onToggle}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        title={visible ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {visible ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
      </button>
    </div>
  )
}
