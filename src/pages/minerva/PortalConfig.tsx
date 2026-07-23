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
  PERFIL_OPERACIONAL_LABEL,
  permissaoPorPerfil,
  type PerfilOperacional,
} from '../../lib/perfisOperacionais'
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
        (a) => !isLocalSuperUser(a.usuario) && !isLocalSuperUser(a.email) && a.role !== 'super',
      ),
    [accounts],
  )

  const pendentesEquipe = useMemo(
    () =>
      accounts.filter(
        (a) =>
          !a.ativo &&
          a.role !== 'transportador' &&
          !isLocalSuperUser(a.usuario) &&
          !isLocalSuperUser(a.email) &&
          a.role !== 'super',
      ),
    [accounts],
  )

  const accountsSorted = useMemo(() => {
    return [...accounts].sort((a, b) => {
      const ap = !a.ativo && a.role !== 'transportador' ? 0 : 1
      const bp = !b.ativo && b.role !== 'transportador' ? 0 : 1
      if (ap !== bp) return ap - bp
      return a.usuario.localeCompare(b.usuario)
    })
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

  function applyPerfilOperacional(perfil: PerfilOperacional) {
    if (!selectedUser) return
    const account = accounts.find((a) => a.usuario === selectedUser)
    if (!account || account.role === 'transportador') {
      setMsg('Perfis Admin/Operador/Consulta aplicam-se a usuários embarcadores.')
      return
    }
    const nextPerm = permissaoPorPerfil(perfil)
    setPerms((prev) => ({ ...prev, [selectedUser]: nextPerm }))
    updateAccount(selectedUser, { perfil_operacional: perfil })
    setMsg(`Perfil ${PERFIL_OPERACIONAL_LABEL[perfil]} aplicado. Clique em Salvar permissões.`)
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
              pendentesEquipe.length
                ? `Usuários (${pendentesEquipe.length} pendente${pendentesEquipe.length > 1 ? 's' : ''})`
                : 'Usuários',
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
                        {a.usuario} ·{' '}
                        {a.role === 'minerva'
                          ? 'Doca Livre Oferta de Carga'
                          : a.role}{' '}
                        · {a.email}
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
                    Atalhos da especificação (PPT): Administrador (cadastrar/configurar/publicar),
                    Operador (publicar/acompanhar), Consulta (somente leitura).
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {(Object.keys(PERFIL_OPERACIONAL_LABEL) as PerfilOperacional[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="cadastro-btn cadastro-btn--ghost"
                        onClick={() => applyPerfilOperacional(p)}
                      >
                        {PERFIL_OPERACIONAL_LABEL[p]}
                      </button>
                    ))}
                  </div>
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
            {pendentesEquipe.length > 0 && (
              <p
                style={{
                  marginBottom: 12,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                  color: '#9a3412',
                  fontSize: 13,
                }}
              >
                <strong>{pendentesEquipe.length}</strong> conta(s) de equipe aguardando aprovação.
                Use <strong>Aprovar</strong> para liberar o login.
              </p>
            )}
            <div className="cadastro-table-wrap">
              <table className="cadastro-table">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>E-mail</th>
                    <th>Perfil sistema</th>
                    <th>Perfil operacional</th>
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
                    const pendenteEquipe =
                      !superU && !a.ativo && a.role !== 'transportador'
                    return (
                      <tr
                        key={a.id}
                        style={pendenteEquipe ? { background: '#fffbeb' } : undefined}
                      >
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
                          {pendenteEquipe && (
                            <span
                              className="badge-situacao"
                              style={{
                                marginLeft: 8,
                                background: '#f59e0b',
                                color: '#fff',
                              }}
                            >
                              Pendente
                            </span>
                          )}
                        </td>
                        <td>{a.email}</td>
                        <td>
                          {superU ? (
                            'super'
                          ) : (
                            <select
                              value={a.role}
                              onChange={(e) =>
                                updateAccount(a.usuario, {
                                  role: e.target.value as PortalAccount['role'],
                                })
                              }
                            >
                              <option value="minerva">Doca Livre Oferta de Carga</option>
                              <option value="transportador">transportador</option>
                            </select>
                          )}
                        </td>
                        <td>
                          {superU
                            ? '—'
                            : a.role === 'transportador'
                              ? '—'
                              : a.perfil_operacional
                                ? PERFIL_OPERACIONAL_LABEL[a.perfil_operacional]
                                : '—'}
                        </td>
                        <td>
                          {superU ? (
                            'Ativo'
                          ) : a.ativo ? (
                            'Ativo'
                          ) : a.role === 'transportador' ? (
                            'Aguarda aprovação (Transportadoras)'
                          ) : (
                            'Aguarda aprovação (Diego/Elder)'
                          )}
                        </td>
                        <td>
                          {superU ? (
                            '—'
                          ) : pendenteEquipe ? (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="cadastro-btn cadastro-btn--save"
                                onClick={() => {
                                  updateAccount(a.usuario, { ativo: true })
                                  setMsg(`Conta “${a.usuario}” aprovada. Login liberado.`)
                                }}
                              >
                                Aprovar
                              </button>
                              <button
                                type="button"
                                className="cadastro-btn cadastro-btn--ghost"
                                onClick={() => {
                                  const next = accounts.filter((x) => x.id !== a.id)
                                  setAccounts(next)
                                  savePortalAccounts(next)
                                  setMsg(`Cadastro “${a.usuario}” removido.`)
                                }}
                              >
                                Recusar
                              </button>
                            </div>
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
              Contas criadas em “Criar conta (equipe / Super)” ficam pendentes até Diego ou Elder
              aprovarem aqui. Super Users (Diego/Elder) já entram ativos e não são editáveis.
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
