import { Link, useParams, useSearchParams } from 'react-router-dom'
import { EmpresaPerfil } from '../components/empresa/EmpresaPerfil'
import { useAuth } from '../lib/AuthContext'
import { EMPRESA_DOCA_LIVRE, EMPRESA_DOCA_LIVRE_SLUG } from '../lib/empresaDocaLivre'

export function EmpresaPage() {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const { sessao, empresas, minhaEmpresa } = useAuth()
  const empresa = slug
    ? empresas.find((e) => e.slug === slug) ?? (slug === EMPRESA_DOCA_LIVRE_SLUG ? EMPRESA_DOCA_LIVRE : undefined)
    : undefined
  const from = params.get('from')
  const voltarTo = from === 'kanban' ? '/embarcador/mapa-logistica/kanban' : from === 'hierarquia' ? '/embarcador/mapa-logistica/hierarquia' : from === 'feed' ? '/embarcador/mapa-logistica/feed' : '/embarcador/mapa-logistica'
  const voltarLabel =
    from === 'kanban'
      ? 'Voltar ao kanban'
      : from === 'hierarquia'
        ? 'Voltar à hierarquia'
        : from === 'feed'
          ? 'Voltar ao feed'
          : 'Voltar ao mapa'
  const eDono = Boolean(minhaEmpresa && empresa && minhaEmpresa.id === empresa.id)
  const podeEditar = Boolean(sessao?.isSuper || eDono)
  const abrirEdicao = params.get('editar') === '1'

  if (!empresa) {
    return (
      <div className="animate-fade-up" style={{ padding: 8 }}>
        <h1>Empresa não encontrada</h1>
        <p>Esse endereço não existe no mapa atual.</p>
        <Link to={voltarTo}>{voltarLabel}</Link>
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      {from ? (
        <p style={{ margin: '0 0 10px' }}>
          <Link to={voltarTo} style={{ fontWeight: 800, color: '#111', textDecoration: 'none' }}>
            ← {voltarLabel}
          </Link>
        </p>
      ) : null}
      <EmpresaPerfil
        empresa={empresa}
        eDono={eDono}
        podeEditar={podeEditar}
        abrirEdicao={abrirEdicao}
        onFecharEdicao={() => {
          if (!params.has('editar')) return
          const next = new URLSearchParams(params)
          next.delete('editar')
          setParams(next, { replace: true })
        }}
      />
    </div>
  )
}
