import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import {
  loadPortalAccounts,
  savePortalAccounts,
  loadPermissoesMap,
  savePermissoesMap,
  type PortalAccount,
} from '../../lib/portalAuth'
import {
  OFERTA_MODULOS_CATALOGO,
  DEFAULT_PERMISSAO_MINERVA,
  DEFAULT_PERMISSAO_TRANSPORTADOR,
  type ModuloAcesso,
  type OfertaPermissao,
} from '../../lib/portalModules'
import {
  ORG_TIPO_LABEL,
  allowedOrgChildTypes,
  deleteOrgNo,
  loadOrgTree,
  saveOrgTree,
  syncTodasTransportadorasNaHierarquia,
  upsertOrgNo,
  type OrgNo,
} from '../../lib/orgHierarchy'
import { isLocalSuperUser } from '../../lib/superUsers'
import '../../styles/cadastro.css'

type Tab = 'hierarquia' | 'permissoes' | 'usuarios'

export function PortalConfigPage() {
  const { user, refreshPermissoes, transportadores } = useData()
  const [tab, setTab] = useState<Tab>('hierarquia')
  const [tree, setTree] = useState<OrgNo[]>(() => loadOrgTree())
  const [accounts, setAccounts] = useState<PortalAccount[]>(() => loadPortalAccounts())
  const [perms, setPerms] = useState<Record<string, OfertaPermissao>>(() => loadPermissoesMap())
  const [selectedUser, setSelectedUser] = useState('')
  const [msg, setMsg] = useState('')

  const isSuper =
    Boolean(user?.is_superuser) ||
    isLocalSuperUser(user?.usuario ?? '') ||
    isLocalSuperUser(user?.email ?? '')

  // Ao abrir Hierarquia (ou mudar cadastro), sincroniza transportadoras na árvore
  useEffect(() => {
    if (tab !== 'hierarquia') return
    const next = syncTodasTransportadorasNaHierarquia(transportadores)
    setTree(next)
  }, [tab, transportadores])

  const editableUsers = useMemo(
    () =>
      accounts.filter(
        (a) =>
          a.role === 'transportador' &&
          !isLocalSuperUser(a.usuario) &&
          !isLocalSuperUser(a.email),
      ),
    [accounts],
  )

  const accountsSorted = useMemo(() => {
    return [...accounts].sort((a, b) => a.usuario.localeCompare(b.usuario))
  }, [accounts])

  if (!user) return <Navigate to="/login" replace />
  if (!isSuper) {
    return (
      <div className="cadastro-page">
        <h1 className="cadastro-page-title">Configuração do Portal</h1>
        <p className="cadastro-empty">Apenas Super Usuários (Diego / Elder) podem acessar esta área.</p>
      </div>
    )
  }

  function persistTree(next: OrgNo[]) {
    setTree(next)
    saveOrgTree(next)
    setMsg('Hierarquia salva.')
  }

  function addChild(parent: OrgNo | null) {
    const allowed = allowedOrgChildTypes(parent?.tipo ?? null)
    if (allowed.length === 0) {
      setMsg('Este nó não pode ter filhos.')
      return
    }
    const tipo = allowed[0]
    const nome = window.prompt(`Nome do ${ORG_TIPO_LABEL[tipo]}:`)
    if (!nome?.trim()) return
    const no: OrgNo = {
      id: `org-${Math.random().toString(36).slice(2, 8)}`,
      parent_id: parent?.id ?? null,
      tipo,
      nome: nome.trim(),
      ordem: (parent?.children?.length ?? 0) + 1,
      children: [],
    }
    persistTree(upsertOrgNo(tree, no))
  }

  function removeNode(id: string) {
    if (!window.confirm('Remover este nó e seus filhos?')) return
    persistTree(deleteOrgNo(tree, id))
  }

  function selectPermUser(usuario: string) {
    setSelectedUser(usuario)
    const account = accounts.find((a) => a.usuario === usuario)
    if (!account) return
    if (!perms[usuario]) {
      const base =
        account.role === 'transportador' ? DEFAULT_PERMISSAO_TRANSPORTADOR : DEFAULT_PERMISSAO_MINERVA
      setPerms((p) => ({ ...p, [usuario]: structuredClone(base) }))
    }
  }

  function setModuloAcesso(usuario: string, moduloId: string, acesso: ModuloAcesso | 'bloqueado') {
    setPerms((prev) => {
      const cur = prev[usuario] ?? structuredClone(DEFAULT_PERMISSAO_MINERVA)
      const modulos = { ...(cur.modulos ?? {}) }
      if (acesso === 'bloqueado') delete modulos[moduloId]
      else modulos[moduloId] = acesso
      return { ...prev, [usuario]: { ...cur, modulos } }
    })
  }

  function savePerms() {
    savePermissoesMap(perms)
    refreshPermissoes()
    setMsg('Permissões salvas.')
  }

  function updateAccount(usuario: string, patch: Partial<PortalAccount>) {
    const next = accounts.map((a) => (a.usuario === usuario ? { ...a, ...patch } : a))
    setAccounts(next)
    savePortalAccounts(next)
    setMsg('Usuário atualizado.')
  }

  const selectedPerm = selectedUser ? perms[selectedUser] : null

  return (
    <div className="cadastro-page animate-fade-up">
      <h1 className="cadastro-page-title">Configuração do Portal</h1>
      <p style={{ color: '#64748b', marginTop: -8, marginBottom: 16, fontSize: '0.92rem' }}>
        Super Usuário: {user.usuario || user.nome} — hierarquia e permissões deste sistema.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(
          [
            ['hierarquia', 'Hierarquia'],
            ['permissoes', 'Permissões'],
            [
              'usuarios',
              'Usuários',
            ],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`cadastro-btn ${tab === id ? 'cadastro-btn--primary' : 'cadastro-btn--ghost'}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {msg && (
        <p className="portal-login__info" style={{ marginBottom: 12 }}>
          {msg}
        </p>
      )}

      {tab === 'hierarquia' && (
        <section className="form-card form-card--blue">
          <header className="form-card__head">
            <h2 className="form-card__title">Árvore organizacional</h2>
          </header>
          <div className="form-card__body">
            <div style={{ marginBottom: 12 }}>
              <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={() => addChild(null)}>
                + Operador Logístico (raiz)
              </button>
            </div>
            <OrgTreeView nodes={tree} onAdd={addChild} onRemove={removeNode} />
          </div>
        </section>
      )}

      {tab === 'permissoes' && (
        <div className="cadastro-grid cadastro-grid--equal">
          <section className="form-card form-card--purple">
            <header className="form-card__head">
              <h2 className="form-card__title">Usuários</h2>
            </header>
            <div className="form-card__body">
              {editableUsers.length === 0 ? (
                <p className="cadastro-empty">Nenhum usuário editável. Cadastre contas pelo login.</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {editableUsers.map((a) => (
                    <li key={a.id} style={{ marginBottom: 6 }}>
                      <button
                        type="button"
                        className="cadastro-btn cadastro-btn--ghost"
                        style={{
                          width: '100%',
                          justifyContent: 'flex-start',
                          background: selectedUser === a.usuario ? '#eef2ff' : '#fff',
                        }}
                        onClick={() => selectPermUser(a.usuario)}
                      >
                        {a.usuario} · {a.role} · {a.email}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="form-card form-card--orange">
            <header className="form-card__head">
              <h2 className="form-card__title">
                Módulos {selectedUser ? `— ${selectedUser}` : ''}
              </h2>
            </header>
            <div className="form-card__body">
              {!selectedUser || !selectedPerm ? (
                <p className="cadastro-empty">Selecione um usuário à esquerda.</p>
              ) : (
                <>
                  <p className="portal-login__hint" style={{ marginBottom: 10 }}>
                    Ajuste o acesso por módulo deste transportador. Super Usuários têm acesso total.
                  </p>
                  <table className="cadastro-table">
                    <thead>
                      <tr>
                        <th>Módulo</th>
                        <th>Acesso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {OFERTA_MODULOS_CATALOGO.map((m) => {
                        const cur = selectedPerm.modulos?.[m.id]
                        const value = cur ?? 'bloqueado'
                        return (
                          <tr key={m.id}>
                            <td>{m.label}</td>
                            <td>
                              <select
                                value={value}
                                onChange={(e) =>
                                  setModuloAcesso(
                                    selectedUser,
                                    m.id,
                                    e.target.value as ModuloAcesso | 'bloqueado',
                                  )
                                }
                              >
                                <option value="editar">Editar</option>
                                <option value="visualizar">Visualizar</option>
                                <option value="bloqueado">Bloqueado</option>
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div className="cadastro-actions">
                    <button type="button" className="cadastro-btn cadastro-btn--save" onClick={savePerms}>
                      Salvar permissões
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'usuarios' && (
        <section className="form-card form-card--green">
          <header className="form-card__head">
            <h2 className="form-card__title">Contas do portal</h2>
          </header>
          <div className="form-card__body">
            <div className="cadastro-table-wrap">
              <table className="cadastro-table">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>E-mail</th>
                    <th>Perfil</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {accountsSorted.map((a) => {
                    const superU =
                      isLocalSuperUser(a.usuario) ||
                      isLocalSuperUser(a.email) ||
                      a.role === 'super'
                    return (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.usuario}</strong>
                          {superU && (
                            <span
                              className="badge-situacao badge-situacao--ativo"
                              style={{ marginLeft: 8 }}
                            >
                              Super
                            </span>
                          )}
                        </td>
                        <td>{a.email}</td>
                        <td>{superU ? 'super' : 'transportador'}</td>
                        <td>
                          {superU
                            ? 'Ativo'
                            : a.ativo
                              ? 'Ativo'
                              : 'Aguarda aprovação (Transportadoras)'}
                        </td>
                        <td>
                          {superU ? (
                            '—'
                          ) : (
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <input
                                type="checkbox"
                                checked={a.ativo}
                                onChange={(e) =>
                                  updateAccount(a.usuario, { ativo: e.target.checked })
                                }
                              />
                              Ativo
                            </label>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="portal-login__hint" style={{ marginTop: 12 }}>
              Contas do portal: Super Usuários (Diego/Elder) e transportadores (demos + cadastro
              público). Equipe embarcador/Minerva foi removida — o painel operacional é só dos
              Supers.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

function OrgTreeView({
  nodes,
  onAdd,
  onRemove,
  depth = 0,
}: {
  nodes: OrgNo[]
  onAdd: (parent: OrgNo | null) => void
  onRemove: (id: string) => void
  depth?: number
}) {
  if (!nodes.length) {
    return <p className="cadastro-empty">Árvore vazia.</p>
  }
  return (
    <ul style={{ listStyle: 'none', margin: 0, paddingLeft: depth ? 18 : 0 }}>
      {nodes.map((n) => (
        <li key={n.id} style={{ marginBottom: 8 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
              padding: '8px 10px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
            }}
          >
            <strong>{n.nome}</strong>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{ORG_TIPO_LABEL[n.tipo]}</span>
            <button type="button" className="cadastro-link" onClick={() => onAdd(n)}>
              + Filho
            </button>
            <button
              type="button"
              className="cadastro-link"
              style={{ color: '#dc2626' }}
              onClick={() => onRemove(n.id)}
            >
              Remover
            </button>
          </div>
          {n.children && n.children.length > 0 && (
            <OrgTreeView nodes={n.children} onAdd={onAdd} onRemove={onRemove} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  )
}
