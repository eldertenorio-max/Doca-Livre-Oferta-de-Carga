import { EmpresaPerfil } from '../components/empresa/EmpresaPerfil'
import { SeletorEditarEmpresa } from '../components/empresa/SeletorEditarEmpresa'
import { RedeAbas } from '../components/feed/RedeAbas'
import { useAuth } from '../lib/AuthContext'
import '../styles/feed.css'

export function PerfilPage() {
  const { sessao, empresas, minhaEmpresa } = useAuth()

  if (!minhaEmpresa) {
    return (
      <div className="feed animate-fade-up">
        <h1>Meu perfil</h1>
        <p>Complete o cadastro da empresa para ter um perfil na rede.</p>
      </div>
    )
  }

  return (
    <div className="feed animate-fade-up">
      <header className="feed__hero">
        <div>
          <p className="feed__kicker">Doca Livre · Rede</p>
          <h1>Meu perfil</h1>
          <p>
            {sessao?.isSuper
              ? 'Edite a página da Doca Livre ou abra o perfil de qualquer empresa da rede.'
              : 'Edite a página de apresentação da sua operação e veja as publicações do feed.'}
          </p>
        </div>
      </header>
      <RedeAbas />
      {sessao?.isSuper ? <SeletorEditarEmpresa empresas={empresas} /> : null}
      <EmpresaPerfil empresa={minhaEmpresa} eDono podeEditar />
    </div>
  )
}
