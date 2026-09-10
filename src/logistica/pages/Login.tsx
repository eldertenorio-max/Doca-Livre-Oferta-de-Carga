import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { LOGO_DOCA_LIVRE_SRC } from '../lib/brandAssets'
import { ProductMark } from '../components/layout/ProductMark'
import { SUPER_USUARIOS, USUARIOS_EMPRESA } from '../lib/auth'
import { useAuth } from '../lib/AuthContext'
import { rotaInicial } from '../lib/rotasApp'
import '../styles/auth.css'

const SUPER_HINTS = SUPER_USUARIOS.map((u) => ({
  id: u.usuario,
  usuario: u.usuario,
  senha: u.senha,
}))

const EMPRESA_HINT = USUARIOS_EMPRESA[0]

export function LoginPage() {
  const { sessao, login } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from || '/embarcador/mapa-logistica/painel'
  const [tipo, setTipo] = useState<'Diego' | 'Elder' | 'empresa'>('Diego')
  const [usuario, setUsuario] = useState(SUPER_HINTS[0].usuario)
  const [senha, setSenha] = useState(SUPER_HINTS[0].senha)
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (sessao) {
    return <Navigate to={sessao.isSuper ? from : rotaInicial()} replace />
  }

  function escolher(next: 'Diego' | 'Elder' | 'empresa') {
    setTipo(next)
    setErro(null)
    if (next === 'empresa') {
      setUsuario(EMPRESA_HINT.usuario)
      setSenha(EMPRESA_HINT.senha)
      return
    }
    const hint = SUPER_HINTS.find((h) => h.id === next)!
    setUsuario(hint.usuario)
    setSenha(hint.senha)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro(null)
    const falha = await login(usuario, senha)
    setLoading(false)
    if (falha) setErro(falha)
  }

  return (
    <div className="portal-login">
      <div className="portal-login__card">
        <div className="portal-login__header">
          <img src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" className="portal-login__logo" />
          <div className="portal-login__product">
            <ProductMark size="lg" />
          </div>
          <p className="portal-login__tagline">Mapa, painel e cadastro de empresas logísticas</p>
        </div>

        <form className="portal-login__form" onSubmit={onSubmit}>
          <p className="portal-login__label">Tipo de acesso</p>
          <div className="portal-login__tipos portal-login__tipos--3" role="group" aria-label="Tipo de login">
            <button
              type="button"
              className={`portal-login__tipo ${tipo === 'Diego' ? 'is-active' : ''}`}
              onClick={() => escolher('Diego')}
            >
              Diego
            </button>
            <button
              type="button"
              className={`portal-login__tipo ${tipo === 'Elder' ? 'is-active' : ''}`}
              onClick={() => escolher('Elder')}
            >
              Elder
            </button>
            <button
              type="button"
              className={`portal-login__tipo ${tipo === 'empresa' ? 'is-active' : ''}`}
              onClick={() => escolher('empresa')}
            >
              Empresa
            </button>
          </div>

          <label className="portal-login__label" htmlFor="usuario">
            Usuário ou e-mail
          </label>
          <input
            id="usuario"
            className="portal-login__input"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
            autoComplete="username"
          />

          <label className="portal-login__label" htmlFor="senha">
            Senha
          </label>
          <input
            id="senha"
            className="portal-login__input"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            autoComplete="current-password"
          />

          {erro && <p className="portal-login__erro">{erro}</p>}

          <button className="portal-login__submit" disabled={loading} type="submit">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <p className="portal-login__cadastro">
            Não tem conta?{' '}
            <Link to="/cadastro" className="portal-login__cadastro-link">
              Cadastre sua empresa
            </Link>
            {' · '}
            <Link to="/" className="portal-login__cadastro-link">
              Ver o mapa
            </Link>
          </p>

          <div className="portal-login__hints">
            <p>
              <strong>Superusuário Diego:</strong> Diego / diego123
            </p>
            <p>
              <strong>Superusuário Elder:</strong> Elder / Elder123
            </p>
            <p>
              <strong>Empresa Braspress:</strong> Braspress / braspress123
            </p>
            <p>Os superusuários têm acesso a tudo no sistema. A conta Braspress abre o perfil da empresa no mapa.</p>
          </div>
        </form>
      </div>
    </div>
  )
}
