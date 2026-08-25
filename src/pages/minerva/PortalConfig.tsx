import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import {
  createPortalAccount,
  ensureContasTransportadores,
  gravarContaPortalNoBanco,
  hydratePermissoesMap,
  loadPortalAccounts,
  removePortalAccountRemote,
  savePortalAccounts,
  loadPermissoesMap,
  savePermissoesMap,
  subscribePortalAccounts,
  syncPortalAccounts,
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
  ensureHierarquiaPadrao,
  gruposDaHierarquia,
  hydrateOrgTree,
  loadOrgTree,
  saveOrgTree,
  upsertOrgNo,
  type OrgNo,
} from '../../lib/orgHierarchy'
import { OrgHierarchyTree } from '../../components/portal/OrgHierarchyTree'
import { isLocalSuperUser, isSuperSession } from '../../lib/superUsers'
import { CadastroStatsCards } from '../../components/cadastro/CadastroStatsCards'
import '../../styles/cadastro.css'

type Tab = 'hierarquia' | 'permissoes' | 'usuarios'

export function PortalConfigPage() {
  const { user, refreshPermissoes, transportadores, salvarGrupo } = useData()
  const [tab, setTab] = useState<Tab>('hierarquia')
  const [tree, setTree] = useState<OrgNo[]>(() => loadOrgTree())
  const [accounts, setAccounts] = useState<PortalAccount[]>(() => loadPortalAccounts())
  const [perms, setPerms] = useState<Record<string, OfertaPermissao>>(() => loadPermissoesMap())
  const [selectedUser, setSelectedUser] = useState('')
  const [msg, setMsg] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PortalAccount | null>(null)
  const [salvando, setSalvando] = useState(false)

  const transportadoresRef = useRef(transportadores)
  transportadoresRef.current = transportadores
  const editingIdRef = useRef<string | null>(null)
  editingIdRef.current = editingId

  // Ao abrir Usuários: junta contas do Supabase e atualiza em tempo real entre Supers
  useEffect(() => {
    if (tab !== 'usuarios') return
    void ensureContasTransportadores(transportadoresRef.current ?? []).then((list) => {
      setAccounts((prev) => (editingIdRef.current ? prev : list))
    })
    void hydratePermissoesMap().then(setPerms)
    const unsub = subscribePortalAccounts((list) => {
      // Não sobrescreve a linha enquanto o Super está editando
      if (editingIdRef.current) return
      setAccounts(list)
    })
    return () => unsub()
  }, [tab])

  useEffect(() => {
    if (tab !== 'hierarquia') return
    void hydrateOrgTree().then(() => {
      const next = ensureHierarquiaPadrao(transportadoresRef.current ?? [])
      setTree(next)
      for (const g of gruposDaHierarquia(next)) salvarGrupo(g)
    })
    void ensureContasTransportadores(transportadoresRef.current ?? []).then((list) => {
      if (!editingIdRef.current) setAccounts(list)
    })
  }, [tab, salvarGrupo])

  useEffect(() => {
    function onFocus() {
      if (editingIdRef.current) return
      void syncPortalAccounts().then(setAccounts)
      void hydrateOrgTree().then(setTree)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const isSuper = isSuperSession(user)

  const editableUsers = useMemo(
    () => accounts.filter((a) => a.role === 'transportador'),
    [accounts],
  )

  const accountsSorted = useMemo(() => {
    return [...accounts].sort((a, b) => a.usuario.localeCompare(b.usuario))
  }, [accounts])

  const contagemPortal = useMemo(() => {
    // Mesma fonte da tabela: contas do portal (não o cadastro de empresas).
    const transportadoras = accounts.filter((a) => a.role === 'transportador').length
    const embarcadores = accounts.filter((a) => a.role === 'super').length
    return { transportadoras, embarcadores }
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
    for (const g of gruposDaHierarquia(next)) salvarGrupo(g)
    setMsg('Hierarquia salva. Publicações da unidade/embarcador usam quem está abaixo na árvore.')
  }

  function addChild(parent: OrgNo | null) {
    const allowed = allowedOrgChildTypes(parent?.tipo ?? null)
    if (allowed.length === 0) {
      setMsg('Este nó não pode ter filhos.')
      return
    }

    let tipo = allowed[0]
    if (allowed.length > 1) {
      const opcoes = allowed.map((t, i) => `${i + 1}=${ORG_TIPO_LABEL[t]}`).join(' | ')
      const escolha = window.prompt(`Tipo de entidade (${opcoes}):`, '1')
      if (!escolha?.trim()) return
      const idx = Number.parseInt(escolha.trim(), 10) - 1
      if (Number.isNaN(idx) || idx < 0 || idx >= allowed.length) {
        setMsg('Tipo de entidade inválido.')
        return
      }
      tipo = allowed[idx]
    }

    const nome = window.prompt(`Nome do ${ORG_TIPO_LABEL[tipo]}:`)
    if (!nome?.trim()) return
    const cnpj = window.prompt('CNPJ (opcional):')
    const no: OrgNo = {
      id: `org-${Math.random().toString(36).slice(2, 8)}`,
      parent_id: parent?.id ?? null,
      tipo,
      nome: nome.trim(),
      cnpj: cnpj?.trim() || null,
      ordem: (parent?.children?.length ?? 0) + 1,
      children: [],
    }
    persistTree(upsertOrgNo(tree, no))
  }

  function removeNode(id: string) {
    if (!window.confirm('Remover este nó e seus filhos?')) return
    persistTree(deleteOrgNo(tree, id))
  }

  function editNode(n: OrgNo) {
    const nome = window.prompt(`Nome do ${ORG_TIPO_LABEL[n.tipo]}:`, n.nome)
    if (nome == null) return
    if (!nome.trim()) {
      setMsg('Nome inválido.')
      return
    }
    const cnpj = window.prompt('CNPJ (opcional):', n.cnpj || '')
    if (cnpj == null) return
    const patchNome = nome.trim()
    const patchCnpj = cnpj.trim() || null
    function walk(nodes: OrgNo[]): OrgNo[] {
      return nodes.map((x) =>
        x.id === n.id
          ? { ...x, nome: patchNome, cnpj: patchCnpj }
          : { ...x, children: x.children ? walk(x.children) : [] },
      )
    }
    persistTree(walk(tree))
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

  async function salvarEdicao() {
    if (!draft || !editingId || salvando) return
    const original = accounts.find((a) => a.id === editingId)
    const usuario = draft.usuario.trim()
    const email = draft.email.trim().toLowerCase()
    const nome = (draft.nome || '').trim() || usuario
    const password = (draft.password || '').trim()
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
    const dupUser = accounts.some(
      (a) => a.id !== editingId && a.usuario.toLowerCase() === usuario.toLowerCase(),
    )
    const dupEmail = accounts.some(
      (a) => a.id !== editingId && a.email.toLowerCase() === email.toLowerCase(),
    )
    if (dupUser) {
      setMsg('Já existe outra conta com esse login.')
      return
    }
    if (dupEmail) {
      setMsg('Já existe outra conta com esse e-mail.')
      return
    }

    const contaSalva: PortalAccount = {
      ...(original ?? draft),
      id: editingId,
      nome,
      usuario,
      email,
      password,
      role: draft.role === 'super' ? 'super' : 'transportador',
      transportador_id: draft.role === 'super' ? null : draft.transportador_id || null,
      ativo: draft.ativo,
      nivel: draft.role === 'super' ? 'super' : 'operador',
    }

    setSalvando(true)
    setMsg('Salvando login e senha no banco…')
    try {
      const remoto = await gravarContaPortalNoBanco(contaSalva, {
        usuario: original?.usuario,
        email: original?.email,
      })
      if (!remoto.ok) {
        setMsg(`Não foi possível salvar: ${remoto.erro ?? 'erro desconhecido'}.`)
        return
      }

      // Atualiza a linha na hora (não espera sync)
      setAccounts((prev) => {
        const fromCache = loadPortalAccounts()
        const base = fromCache.length ? fromCache : prev
        const i = base.findIndex(
          (u) =>
            u.id === editingId ||
            u.id === contaSalva.id ||
            u.email.toLowerCase() === email ||
            u.usuario.toLowerCase() === usuario.toLowerCase(),
        )
        if (i < 0) return [...base, contaSalva]
        return base.map((u, idx) => (idx === i ? { ...u, ...contaSalva, password } : u))
      })
      if (selectedUser && original?.usuario === selectedUser) {
        setSelectedUser(usuario)
      }
      setEditingId(null)
      setDraft(null)
      setMsg('Login e senha salvos. Já valem no próximo login.')
    } finally {
      setSalvando(false)
    }
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

  async function excluirConta(a: PortalAccount) {
    if (a.id === user.id || a.usuario === user.usuario || a.email === user.email) {
      setMsg('Você não pode excluir a própria conta logada.')
      return
    }
    if (
      a.role === 'super' &&
      (isLocalSuperUser(a.usuario) || isLocalSuperUser(a.email))
    ) {
      setMsg('Diego e Elder são os Super Usuários embarcadores do sistema e não podem ser excluídos.')
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
    const nextPerms = { ...perms }
    delete nextPerms[a.usuario]
    setPerms(nextPerms)
    savePermissoesMap(nextPerms)
    if (selectedUser === a.usuario) setSelectedUser('')
    if (editingId === a.id) {
      setEditingId(null)
      setDraft(null)
    }
    refreshPermissoes()

    const remote = await removePortalAccountRemote(a)
    if (!remote.ok) {
      setMsg(
        `Conta “${a.usuario}” excluída deste aparelho, mas o servidor não confirmou a exclusão: ${remote.erro}`,
      )
      return
    }
    setMsg(`Conta “${a.usuario}” excluída. Lista e acessos atualizados.`)
  }

  async function novaConta() {
    const usuario = window.prompt('Login (usuário):')?.trim()
    if (!usuario) return
    const email =
      window.prompt('E-mail:', `${usuario.toLowerCase().replace(/\s+/g, '')}@empresa.com`)
        ?.trim()
        .toLowerCase() || `${usuario.toLowerCase().replace(/\s+/g, '')}@empresa.com`
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
    let transportadorId: string | null = null
    let nome = usuario
    if (role === 'transportador') {
      const opcoes = transportadores.filter((t) => t.situacao === 'ativo')
      if (opcoes.length === 0) {
        setMsg('Não há transportadoras ativas para associar à nova conta.')
        return
      }
      const lista = opcoes
        .map((t, i) => `${i + 1} - ${t.nome_fantasia || t.razao_social || t.cnpj}`)
        .join('\n')
      const escolha = window.prompt(
        `Escolha a transportadora pelo número:\n\n${lista}`,
        '1',
      )
      if (escolha == null) return
      const indice = Number.parseInt(escolha.trim(), 10) - 1
      const selecionada = opcoes[indice]
      if (!selecionada) {
        setMsg('Transportadora inválida. Clique em “+ Nova conta” e tente novamente.')
        return
      }
      transportadorId = selecionada.id
      nome = selecionada.nome_fantasia || selecionada.razao_social || usuario
    }
    setMsg('Criando conta no banco…')
    const created = await createPortalAccount({
      usuario,
      email,
      password,
      nome,
      role,
      transportador_id: transportadorId,
    })
    if (!created.ok) {
      setMsg(created.erro)
      setAccounts(loadPortalAccounts())
      return
    }
    setAccounts(created.list)
    setMsg(
      `Conta “${created.account.usuario}” criada${created.account.role === 'super' ? ' (Super)' : ''} e salva no banco.`,
    )
  }

  const selectedPerm = selectedUser ? perms[selectedUser] : null

  return (
    <div className="cadastro-page animate-fade-up">
      <h1 className="cadastro-page-title">Configuração do Portal</h1>
      <p style={{ color: '#1a1d21', marginTop: -8, marginBottom: 16, fontSize: '0.92rem' }}>
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
            <p className="portal-login__hint" style={{ marginBottom: 12 }}>
              Embarcador → unidade → transportadoras. A publicação da carga da unidade ou do
              embarcador só chega a quem está nessa ramificação.
            </p>
            <OrgHierarchyTree
              nodes={tree}
              accounts={accounts}
              transportadores={transportadores}
              onAdd={addChild}
              onEdit={editNode}
              onRemove={removeNode}
            />
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
            <button
              type="button"
              className="cadastro-btn cadastro-btn--save"
              onClick={() => void novaConta()}
            >
              + Nova conta
            </button>
          </header>
          <div className="form-card__body">
            <CadastroStatsCards
              cards={[
                {
                  label: 'Contas transportador',
                  value: contagemPortal.transportadoras,
                  accent: 'blue',
                },
                {
                  label: 'Embarcadores',
                  value: contagemPortal.embarcadores,
                  accent: 'amber',
                },
              ]}
            />
            <p className="portal-login__hint" style={{ marginBottom: 12 }}>
              Clique em <strong>Editar</strong> para alterar qualquer campo, depois em{' '}
              <strong>Salvar</strong>. A senha é gravada na hora neste painel e na tabela{' '}
              <code>usuarios</code> do banco. Contas <strong>inativas</strong> ou{' '}
              <strong>sem senha</strong> não entram no login. Campos em amarelo precisam de
              atenção (senha vazia / e-mail incompleto). Duplicatas de Super (Diego/Elder) são
              unificadas automaticamente.
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
                    const isCanonicalSuper =
                      a.role === 'super' &&
                      (isLocalSuperUser(a.usuario) || isLocalSuperUser(a.email))
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
                            <option value="super">super (embarcador)</option>
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
                                  disabled={salvando}
                                  onClick={() => void salvarEdicao()}
                                >
                                  {salvando ? 'Salvando…' : 'Salvar'}
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
                              disabled={isSelf || isCanonicalSuper || Boolean(editing)}
                              title={
                                isSelf
                                  ? 'Não é possível excluir a própria conta'
                                  : isCanonicalSuper
                                    ? 'Super Usuário embarcador protegido'
                                    : 'Excluir conta'
                              }
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
              Para alterar login ou senha: clique em <strong>Editar</strong>, mude os campos e
              clique em <strong>Salvar</strong>. Sem Salvar, a alteração não grava no banco.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
