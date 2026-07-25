import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import {
  createPortalAccount,
  ensureContasTransportadores,
  loadPortalAccounts,
  removePortalAccountRemote,
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
import { isLocalSuperUser, isSuperSession } from '../../lib/superUsers'
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PortalAccount | null>(null)

  const transportadoresRef = useRef(transportadores)
  transportadoresRef.current = transportadores

  // Ao abrir Usuários: junta contas do Supabase e garante login de cada transportadora
  useEffect(() => {
    if (tab !== 'usuarios') return
    setAccounts(loadPortalAccounts())
    void ensureContasTransportadores(transportadoresRef.current ?? []).then(setAccounts)
  }, [tab])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (!e.key || !e.key.includes('oferta-users')) return
      setAccounts(loadPortalAccounts())
    }
    function onFocus() {
      setAccounts(loadPortalAccounts())
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const isSuper = isSuperSession(user)

  // Ao abrir Hierarquia (ou mudar cadastro), sincroniza transportadoras na árvore
  useEffect(() => {
    if (tab !== 'hierarquia') return
    const next = syncTodasTransportadorasNaHierarquia(transportadores)
    setTree(next)
  }, [tab, transportadores])

  const editableUsers = useMemo(
    () => accounts.filter((a) => a.role === 'transportador'),
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

  function updateAccount(
    id: string,
    patch: Partial<PortalAccount>,
    opts?: { validateUnique?: boolean },
  ) {
    const next = accounts.map((a) => {
      if (a.id !== id) return a
      const merged = { ...a, ...patch }
      if (patch.usuario !== undefined) merged.usuario = patch.usuario.trim()
      if (patch.email !== undefined) merged.email = patch.email.trim().toLowerCase()
      if (patch.password !== undefined) merged.password = patch.password
      if (patch.nome !== undefined) merged.nome = patch.nome.trim() || merged.usuario
      if (patch.role === 'super') {
        merged.role = 'super'
        merged.nivel = 'super'
        merged.transportador_id = null
      }
      if (patch.role === 'transportador') {
        merged.role = 'transportador'
        merged.nivel = merged.nivel === 'super' ? 'operador' : merged.nivel || 'operador'
      }
      return merged
    })
    const edited = next.find((a) => a.id === id)
    if (opts?.validateUnique && edited) {
      const dupUser = next.some(
        (a) => a.id !== id && a.usuario.toLowerCase() === edited.usuario.toLowerCase(),
      )
      const dupEmail = next.some(
        (a) => a.id !== id && a.email.toLowerCase() === edited.email.toLowerCase(),
      )
      if (dupUser) {
        setMsg('Já existe outra conta com esse login.')
        setAccounts(loadPortalAccounts())
        return false
      }
      if (dupEmail) {
        setMsg('Já existe outra conta com esse e-mail.')
        setAccounts(loadPortalAccounts())
        return false
      }
    }
    setAccounts(next)
    savePortalAccounts(next)
    if (edited && selectedUser && accounts.find((a) => a.id === id)?.usuario === selectedUser) {
      setSelectedUser(edited.usuario)
    }
    setMsg('Usuário atualizado.')
    return true
  }

  function iniciarEdicao(a: PortalAccount) {
    setEditingId(a.id)
    setDraft({ ...a })
    setMsg('')
  }

  function cancelarEdicao() {
    setEditingId(null)
    setDraft(null)
    setMsg('Edição cancelada.')
  }

  function salvarEdicao() {
    if (!draft || !editingId) return
    const usuario = draft.usuario.trim()
    const email = draft.email.trim().toLowerCase()
    const nome = (draft.nome || '').trim() || usuario
    const password = draft.password
    if (usuario.length < 2) {
      setMsg('Login inválido.')
      return
    }
    if (!email.includes('@')) {
      setMsg('E-mail inválido.')
      return
    }
    if (password.length < 4) {
      setMsg('Senha deve ter ao menos 4 caracteres.')
      return
    }
    if (draft.role === 'transportador' && !draft.transportador_id) {
      setMsg('Selecione a transportadora para o perfil transportador.')
      return
    }
    const ok = updateAccount(
      editingId,
      {
        nome,
        usuario,
        email,
        password,
        role: draft.role === 'super' ? 'super' : 'transportador',
        transportador_id: draft.role === 'super' ? null : draft.transportador_id || null,
        ativo: draft.ativo,
        nivel: draft.role === 'super' ? 'super' : 'operador',
      },
      { validateUnique: true },
    )
    if (!ok) return
    setEditingId(null)
    setDraft(null)
    setMsg('Conta salva.')
  }

  function patchDraft(patch: Partial<PortalAccount>) {
    setDraft((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      if (patch.role === 'super') {
        next.role = 'super'
        next.nivel = 'super'
        next.transportador_id = null
      }
      if (patch.role === 'transportador') {
        next.role = 'transportador'
        next.nivel = 'operador'
      }
      return next
    })
  }

  function excluirConta(a: PortalAccount) {
    if (a.id === user.id || a.usuario === user.usuario || a.email === user.email) {
      setMsg('Você não pode excluir a própria conta logada.')
      return
    }
    if (
      !window.confirm(
        `Excluir a conta “${a.usuario}” (${a.email})?\nLogin e senha serão removidos. Esta ação não pode ser desfeita.`,
      )
    ) {
      return
    }
    const next = accounts.filter((x) => x.id !== a.id)
    setAccounts(next)
    savePortalAccounts(next)
    void removePortalAccountRemote(a)
    if (selectedUser === a.usuario) setSelectedUser('')
    setMsg(`Conta “${a.usuario}” excluída.`)
  }

  function novaConta() {
    const usuario = window.prompt('Login (usuário):')?.trim()
    if (!usuario) return
    const email =
      window.prompt('E-mail:', `${usuario.toLowerCase().replace(/\s+/g, '')}@docalivre.com`)
        ?.trim()
        .toLowerCase() || `${usuario.toLowerCase().replace(/\s+/g, '')}@docalivre.com`
    const password = window.prompt('Senha inicial:', '1234') || '1234'
    const roleDefault =
      isLocalSuperUser(usuario) || isLocalSuperUser(email) ? 'super' : 'transportador'
    const roleAsk = window.prompt(
      'Perfil (super ou transportador):',
      roleDefault,
    )
      ?.trim()
      .toLowerCase()
    const role =
      roleAsk === 'super' || roleAsk === 'transportador' ? roleAsk : roleDefault
    const created = createPortalAccount({
      usuario,
      email,
      password,
      nome: usuario,
      role,
    })
    if (!created.ok) {
      setMsg(created.erro)
      setAccounts(loadPortalAccounts())
      return
    }
    setAccounts(created.list)
    setMsg(
      `Conta “${created.account.usuario}” criada${created.account.role === 'super' ? ' (Super)' : ''}.`,
    )
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
          <header className="form-card__head" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h2 className="form-card__title">Contas do portal</h2>
            <button type="button" className="cadastro-btn cadastro-btn--save" onClick={novaConta}>
              + Nova conta
            </button>
          </header>
          <div className="form-card__body">
            <p className="portal-login__hint" style={{ marginBottom: 12 }}>
              Clique em <strong>Editar</strong> para alterar qualquer campo, depois em{' '}
              <strong>Salvar</strong>. Contas <strong>inativas</strong> ou <strong>sem senha</strong>{' '}
              não entram no login. Campos em amarelo precisam de atenção (senha vazia / e-mail
              incompleto). Duplicatas de Super (Diego/Elder) são unificadas automaticamente.
            </p>
            <div className="cadastro-table-wrap cadastro-table-wrap--scroll">
              <table className="cadastro-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Login</th>
                    <th>Senha</th>
                    <th>E-mail</th>
                    <th>Perfil</th>
                    <th>Transportadora</th>
                    <th>Ativo</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {accountsSorted.map((a) => {
                    const editing = editingId === a.id && draft
                    const row = editing ? draft : a
                    const isSuperRole = row.role === 'super'
                    const isSelf =
                      a.id === user.id ||
                      a.usuario === user.usuario ||
                      a.email.toLowerCase() === (user.email || '').toLowerCase()
                    return (
                      <tr
                        key={a.id}
                        style={
                          editing
                            ? { background: '#ecfdf5' }
                            : isSuperRole
                              ? { background: '#f8fafc' }
                              : undefined
                        }
                      >
                        <td>
                          <input
                            className="cadastro-input"
                            value={row.nome || ''}
                            title={row.nome || ''}
                            disabled={!editing}
                            onChange={(e) => patchDraft({ nome: e.target.value })}
                          />
                          {isSuperRole && (
                            <span
                              className="badge-situacao badge-situacao--ativo"
                              style={{ marginLeft: 6 }}
                            >
                              Super
                            </span>
                          )}
                        </td>
                        <td>
                          <input
                            className="cadastro-input"
                            value={row.usuario}
                            title={row.usuario}
                            disabled={!editing}
                            onChange={(e) => patchDraft({ usuario: e.target.value })}
                            autoComplete="off"
                          />
                        </td>
                        <td>
                          <input
                            className={`cadastro-input${
                              !(row.password || '').trim() ? ' cadastro-input--warn' : ''
                            }`}
                            type="text"
                            value={row.password}
                            title={
                              !(row.password || '').trim()
                                ? 'Senha vazia — defina uma senha antes de ativar o login'
                                : row.password
                            }
                            placeholder="definir senha"
                            disabled={!editing}
                            onChange={(e) => patchDraft({ password: e.target.value })}
                            autoComplete="off"
                          />
                        </td>
                        <td>
                          <input
                            className={`cadastro-input${
                              !(row.email || '').includes('@') || (row.email || '').endsWith('.')
                                ? ' cadastro-input--warn'
                                : ''
                            }`}
                            type="email"
                            value={row.email}
                            title={row.email}
                            disabled={!editing}
                            onChange={(e) => patchDraft({ email: e.target.value })}
                            autoComplete="off"
                          />
                        </td>
                        <td>
                          <select
                            className="cadastro-input"
                            value={row.role === 'super' ? 'super' : 'transportador'}
                            disabled={!editing}
                            onChange={(e) =>
                              patchDraft({
                                role: e.target.value as PortalAccount['role'],
                              })
                            }
                          >
                            <option value="super">super</option>
                            <option value="transportador">transportador</option>
                          </select>
                        </td>
                        <td>
                          <select
                            className="cadastro-input"
                            style={{ minWidth: 140 }}
                            disabled={!editing || row.role === 'super'}
                            value={row.transportador_id || ''}
                            onChange={(e) =>
                              patchDraft({
                                transportador_id: e.target.value || null,
                              })
                            }
                          >
                            <option value="">—</option>
                            {transportadores.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.nome_fantasia}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="checkbox"
                              checked={row.ativo}
                              disabled={!editing}
                              onChange={(e) => patchDraft({ ativo: e.target.checked })}
                            />
                            Ativo
                          </label>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {editing ? (
                              <>
                                <button
                                  type="button"
                                  className="cadastro-btn cadastro-btn--save"
                                  style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                                  onClick={salvarEdicao}
                                >
                                  Salvar
                                </button>
                                <button
                                  type="button"
                                  className="cadastro-btn cadastro-btn--ghost"
                                  style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                                  onClick={cancelarEdicao}
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="cadastro-btn cadastro-btn--ghost"
                                style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                                disabled={Boolean(editingId)}
                                onClick={() => iniciarEdicao(a)}
                              >
                                Editar
                              </button>
                            )}
                            <button
                              type="button"
                              className="cadastro-link"
                              style={{ color: '#b91c1c' }}
                              disabled={isSelf || Boolean(editing)}
                              title={isSelf ? 'Não é possível excluir a própria conta' : 'Excluir conta'}
                              onClick={() => excluirConta(a)}
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="portal-login__hint" style={{ marginTop: 12 }}>
              Contas do portal: Super Usuários e transportadores. Alterações de login/senha/perfil
              valem no próximo login.
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
