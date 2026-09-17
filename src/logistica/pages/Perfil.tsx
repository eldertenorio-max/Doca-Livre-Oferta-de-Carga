import { PerfilPanel } from '../../components/layout/PerfilPanel'
import { EmpresaPerfil } from '../components/empresa/EmpresaPerfil'
import { SeletorEditarEmpresa } from '../components/empresa/SeletorEditarEmpresa'
import { RedeAbas } from '../components/feed/RedeAbas'
import { useAuth } from '../lib/AuthContext'
import '../styles/feed.css'
import '../../styles/perfil.css'

export function PerfilPage() {
  const { sessao, empresas, minhaEmpresa } = useAuth()

  return (
    <div className="feed animate-fade-up">
      <header className="feed__hero">
        <div>
          <p className="feed__kicker">Doca Livre · Rede</p>
          <h1>Meu perfil</h1>
          <p>
            O mesmo perfil logado no Oferta de Carga: nome, foto e dados da conta.
            {minhaEmpresa && !sessao?.isSuper
              ? ' Abaixo fica a página da sua empresa no mapa.'
              : ''}
          </p>
        </div>
      </header>
      <RedeAbas />
      <section className="feed__perfil-sistema" aria-label="Perfil do sistema">
        <PerfilPanel />
      </section>
      {sessao?.isSuper ? <SeletorEditarEmpresa empresas={empresas} /> : null}
      {minhaEmpresa && !sessao?.isSuper ? (
        <EmpresaPerfil empresa={minhaEmpresa} eDono podeEditar />
      ) : null}
    </div>
  )
}
