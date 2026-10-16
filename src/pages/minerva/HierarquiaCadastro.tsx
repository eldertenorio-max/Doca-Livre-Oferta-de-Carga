import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { OrgHierarchyTree } from '../../components/portal/OrgHierarchyTree'
import { useData } from '../../context/DataContext'
import {
  ORG_TIPO_LABEL,
  deleteOrgNo,
  findOrgNo,
  flattenOrg,
  gruposDaHierarquia,
  hydrateOrgTree,
  loadOrgTree,
  nosVisiveis,
  quemVeEsteNo,
  saveOrgTree,
  tiposCadastroSuper,
  upsertOrgNo,
  type OrgNo,
  type OrgTipo,
} from '../../lib/orgHierarchy'
import {
  OFERTA_MODULOS_CATALOGO,
  DEFAULT_PERMISSAO_MINERVA,
  DEFAULT_PERMISSAO_TRANSPORTADOR,
  type ModuloAcesso,
  type OfertaPermissao,
} from '../../lib/portalModules'
import {
  createPortalAccount,
  loadPermissoesMap,
  loadPortalAccounts,
  savePermissoesMap,
  type PortalAccount,
} from '../../lib/portalAuth'
import { isSuperSession } from '../../lib/superUsers'
import { sameTransportadorId } from '../../lib/transportadorIds'
import '../../styles/cadastro.css'

const MODULOS_FORA = new Set(['hierarquia', 'permissoes'])

function modulosIniciais(nivel: 'gestor' | 'operador', papel: 'minerva' | 'transportador') {
  const base = papel === 'transportador' ? DEFAULT_PERMISSAO_TRANSPORTADOR : DEFAULT_PERMISSAO_MINERVA
  const acesso: ModuloAcesso = nivel === 'gestor' ? 'editar' : 'visualizar'
  const out: Record<string, ModuloAcesso | 'bloqueado'> = {}
  for (const mod of OFERTA_MODULOS_CATALOGO) {
    if (MODULOS_FORA.has(mod.id)) continue
    if (papel === 'transportador' && mod.role === 'minerva') continue
    if (papel === 'minerva' && mod.role === 'transportador') continue
    const atual = base.modulos?.[mod.id]
    out[mod.id] = atual ? acesso : 'bloqueado'
  }
  return out
}

function permissaoDe(
  mapa: Record<string, ModuloAcesso | 'bloqueado'>,
): OfertaPermissao {
  const modulos: Record<string, ModuloAcesso> = {}
  for (const [id, acesso] of Object.entries(mapa)) {
    if (acesso === 'editar' || acesso === 'visualizar') modulos[id] = acesso
  }
  return { pode_acessar: true, modulos }
}

export function HierarquiaCadastroPage() {
  const { user, transportadores, salvarGrupo } = useData()
  const [tree, setTree] = useState<OrgNo[]>(() => loadOrgTree())
  const [accounts, setAccounts] = useState<PortalAccount[]>(() => loadPortalAccounts())
  const [msg, setMsg] = useState('')
  const [parentId, setParentId] = useState('')
  const [tipo, setTipo] = useState<OrgTipo>('embarcador')
  const [nome, setNome] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [contaNome, setContaNome] = useState('')
  const [contaUsuario, setContaUsuario] = useState('')
  const [contaEmail, setContaEmail] = useState('')
  const [contaSenha, setContaSenha] = useState('')
  const [contaNivel, setContaNivel] = useState<'gestor' | 'operador'>('gestor')
  const [contaAlvo, setContaAlvo] = useState('')
  const [modulos, setModulos] = useState<Record<string, ModuloAcesso | 'bloqueado'>>(() =>
    modulosIniciais('gestor', 'minerva'),
  )
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    void hydrateOrgTree().then((next) => setTree(next))
  }, [])

  const flat = useMemo(() => flattenOrg(tree), [tree])
  const parent = parentId ? findOrgNo(tree, parentId) : null
  const tipos = tiposCadastroSuper(parent?.tipo ?? null)
  const selecionado = selectedId ? findOrgNo(tree, selectedId) : null

  useEffect(() => {
    if (tipos.length && !tipos.includes(tipo)) setTipo(tipos[0])
  }, [tipos, tipo])

  const papelConta: 'minerva' | 'transportador' =
    selecionado?.tipo === 'transportadora' ? 'transportador' : 'minerva'

  const contasDoNo = useMemo(() => {
    if (!selecionado) return []
    return accounts.filter((a) => {
      if (a.empresa_org_id === selecionado.id) return true
      return Boolean(
        selecionado.transportador_id &&
          a.transportador_id &&
          sameTransportadorId(a.transportador_id, selecionado.transportador_id),
      )
    })
  }, [accounts, selecionado])

  const catalogo = OFERTA_MODULOS_CATALOGO.filter((m) => {
    if (MODULOS_FORA.has(m.id)) return false
    if (papelConta === 'transportador') return m.role !== 'minerva'
    return m.role !== 'transportador'
  })

  if (!isSuperSession(user)) {
    return <Navigate to="/home" replace />
  }

  function persistTree(next: OrgNo[]) {
    setTree(next)
    saveOrgTree(next)
    for (const g of gruposDaHierarquia(next)) salvarGrupo(g)
  }

  function criarNo() {
    if (!tipos.length) {
      setMsg('Este ponto não recebe filhos.')
      return
    }
    if (!tipos.includes(tipo)) {
      setMsg('Esse tipo não pode ficar neste ponto da hierarquia.')
      return
    }
    if (!nome.trim()) {
      setMsg('Informe o nome.')
      return
    }
    const no: OrgNo = {
      id: `org-${Math.random().toString(36).slice(2, 10)}`,
      parent_id: parent?.id ?? null,
      tipo,
      nome: nome.trim(),
      cnpj: cnpj.trim() || null,
      ordem: (parent?.children?.length ?? flat.filter((n) => !n.parent_id).length) + 1,
      children: [],
    }
    persistTree(upsertOrgNo(tree, no))
    setSelectedId(no.id)
    setNome('')
    setCnpj('')
    setMsg(`${ORG_TIPO_LABEL[tipo]} cadastrado. Ele vê a si mesmo e quem estiver abaixo.`)
  }

  function editarNo(n: OrgNo) {
    const novoNome = window.prompt(`Nome do ${ORG_TIPO_LABEL[n.tipo]}:`, n.nome)
    if (novoNome == null) return
    if (!novoNome.trim()) {
      setMsg('Nome inválido.')
      return
    }
    const novoCnpj = window.prompt('CNPJ (opcional):', n.cnpj || '')
    if (novoCnpj == null) return
    function walk(nodes: OrgNo[]): OrgNo[] {
      return nodes.map((x) =>
        x.id === n.id
          ? { ...x, nome: novoNome.trim(), cnpj: novoCnpj.trim() || null }
          : { ...x, children: x.children ? walk(x.children) : [] },
      )
    }
    persistTree(walk(tree))
    setMsg('Ponto atualizado.')
  }

  function removerNo(id: string) {
    if (!window.confirm('Remover este ponto e quem está abaixo dele?')) return
    persistTree(deleteOrgNo(tree, id))
    if (selectedId === id) setSelectedId(null)
    setMsg('Ponto removido da hierarquia.')
  }

  function escolherNo(n: OrgNo) {
    setSelectedId(n.id)
    setContaAlvo('')
    setModulos(modulosIniciais(contaNivel, n.tipo === 'transportadora' ? 'transportador' : 'minerva'))
    setMsg('')
  }

  function carregarPermissao(usuario: string) {
    setContaAlvo(usuario)
    if (!usuario) {
      setModulos(modulosIniciais(contaNivel, papelConta))
      return
    }
    const salva = loadPermissoesMap()[usuario]
    const base = modulosIniciais(contaNivel, papelConta)
    if (!salva?.modulos) {
      setModulos(base)
      return
    }
    const next = { ...base }
    for (const id of Object.keys(next)) {
      const acesso = salva.modulos[id]
      next[id] = acesso === 'editar' || acesso === 'visualizar' ? acesso : 'bloqueado'
    }
    setModulos(next)
  }

  async function salvarConta() {
    if (!selecionado || salvando) return
    if (contaAlvo) {
      const map = loadPermissoesMap()
      map[contaAlvo] = permissaoDe(modulos)
      savePermissoesMap(map)
      setMsg(`Permissões de ${contaAlvo} salvas. Essa pessoa vê este ponto e quem está abaixo.`)
      return
    }
    if (papelConta === 'transportador' && !selecionado.transportador_id) {
      setMsg('A transportadora entra pelo cadastro público e fica neste ponto. Ainda não há empresa vinculada.')
      return
    }
    if (!contaUsuario.trim() || !contaEmail.trim() || contaSenha.trim().length < 4) {
      setMsg('Preencha login, e-mail e uma senha com ao menos 4 caracteres.')
      return
    }
    setSalvando(true)
    setMsg('Salvando conta…')
    try {
      const created = await createPortalAccount({
        nome: contaNome.trim() || contaUsuario.trim(),
        usuario: contaUsuario.trim(),
        email: contaEmail.trim(),
        password: contaSenha.trim(),
        role: papelConta,
        nivel: contaNivel,
        perfil_operacional: contaNivel === 'gestor' ? 'administrador' : 'operador',
        empresa_org_id: papelConta === 'minerva' ? selecionado.id : null,
        transportador_id: papelConta === 'transportador' ? selecionado.transportador_id : null,
      })
      if (!created.ok) {
        setMsg(created.erro)
        return
      }
      const map = loadPermissoesMap()
      map[created.account.usuario] = permissaoDe(modulos)
      savePermissoesMap(map)
      setAccounts(loadPortalAccounts())
      setContaNome('')
      setContaUsuario('')
      setContaEmail('')
      setContaSenha('')
      setMsg(
        `Conta ${created.account.usuario} criada em ${ORG_TIPO_LABEL[selecionado.tipo]}. Ela vê este ponto e quem está abaixo.`,
      )
    } finally {
      setSalvando(false)
    }
  }

  const ve = selecionado ? nosVisiveis(tree, selecionado.id) : []
  const vistoPor = selecionado ? quemVeEsteNo(tree, selecionado.id) : []

  return (
    <div className="cadastro-page animate-fade-up">
      <h1 className="cadastro-page-title">Hierarquia</h1>
      <p style={{ color: '#1a1d21', marginTop: -8, marginBottom: 16, fontSize: '0.92rem', maxWidth: 760 }}>
        Cadastre a hierarquia como no Doca Livre: operador logístico, filial, embarcador, unidade
        e transportadora. Cada ponto só aceita o tipo que pode ficar abaixo dele. Quem está num
        ponto vê a si mesmo e quem está abaixo. Quem está acima vê esse ponto.
      </p>

      {msg ? (
        <p className="portal-login__info" style={{ marginBottom: 12 }}>
          {msg}
        </p>
      ) : null}

      <section className="form-card form-card--blue" style={{ marginBottom: 16 }}>
        <header className="form-card__head">
          <h2 className="form-card__title">Novo ponto</h2>
        </header>
        <div className="form-card__body" style={{ display: 'grid', gap: 10 }}>
          <label>
            <span className="cadastro-label">Fica abaixo de</span>
            <select
              className="cadastro-input"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">Topo (operador logístico ou embarcador)</option>
              {flat
                .filter((n) => tiposCadastroSuper(n.tipo).length > 0)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {ORG_TIPO_LABEL[n.tipo]}: {n.nome}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span className="cadastro-label">Tipo</span>
            <select
              className="cadastro-input"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as OrgTipo)}
            >
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {ORG_TIPO_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="cadastro-label">Nome</span>
            <input className="cadastro-input" value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label>
            <span className="cadastro-label">CNPJ</span>
            <input className="cadastro-input" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
          </label>
          <button type="button" className="cadastro-btn cadastro-btn--primary" onClick={criarNo}>
            Cadastrar na hierarquia
          </button>
        </div>
      </section>

      <section className="form-card form-card--blue" style={{ marginBottom: 16 }}>
        <header className="form-card__head">
          <h2 className="form-card__title">Árvore</h2>
        </header>
        <div className="form-card__body">
          <p className="portal-login__hint" style={{ marginBottom: 12 }}>
            Clique no nome para definir quem entra nesse ponto e o que essa pessoa pode abrir.
          </p>
          <OrgHierarchyTree
            nodes={tree}
            accounts={accounts}
            transportadores={transportadores}
            onAdd={(pai) => {
              setParentId(pai?.id ?? '')
              setMsg(pai ? `Novo ponto abaixo de ${pai.nome}.` : 'Novo ponto no topo.')
            }}
            onEdit={editarNo}
            onRemove={removerNo}
            onSelect={escolherNo}
            selectedId={selectedId}
            tiposFilhos={tiposCadastroSuper}
            rotuloRaiz="+ No topo"
          />
        </div>
      </section>

      {selecionado ? (
        <section className="form-card form-card--blue">
          <header className="form-card__head">
            <h2 className="form-card__title">
              {ORG_TIPO_LABEL[selecionado.tipo]}: {selecionado.nome}
            </h2>
          </header>
          <div className="form-card__body" style={{ display: 'grid', gap: 14 }}>
            <div>
              <strong>Este ponto vê</strong>
              <p className="portal-login__hint">
                {ve.map((n) => `${ORG_TIPO_LABEL[n.tipo]} ${n.nome}`).join(' · ')}
              </p>
            </div>
            <div>
              <strong>Quem vê este ponto</strong>
              <p className="portal-login__hint">
                {vistoPor.map((n) => `${ORG_TIPO_LABEL[n.tipo]} ${n.nome}`).join(' · ')}
              </p>
            </div>

            <label>
              <span className="cadastro-label">Conta</span>
              <select
                className="cadastro-input"
                value={contaAlvo}
                onChange={(e) => carregarPermissao(e.target.value)}
              >
                <option value="">Nova conta neste ponto</option>
                {contasDoNo.map((a) => (
                  <option key={a.id} value={a.usuario}>
                    {a.nome} ({a.usuario})
                  </option>
                ))}
              </select>
            </label>

            {!contaAlvo ? (
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <label>
                  <span className="cadastro-label">Nome</span>
                  <input className="cadastro-input" value={contaNome} onChange={(e) => setContaNome(e.target.value)} />
                </label>
                <label>
                  <span className="cadastro-label">Login</span>
                  <input className="cadastro-input" value={contaUsuario} onChange={(e) => setContaUsuario(e.target.value)} />
                </label>
                <label>
                  <span className="cadastro-label">E-mail</span>
                  <input className="cadastro-input" value={contaEmail} onChange={(e) => setContaEmail(e.target.value)} />
                </label>
                <label>
                  <span className="cadastro-label">Senha</span>
                  <input
                    className="cadastro-input"
                    type="text"
                    value={contaSenha}
                    onChange={(e) => setContaSenha(e.target.value)}
                  />
                </label>
              </div>
            ) : null}

            <label>
              <span className="cadastro-label">Nível</span>
              <select
                className="cadastro-input"
                value={contaNivel}
                onChange={(e) => {
                  const nivel = e.target.value === 'operador' ? 'operador' : 'gestor'
                  setContaNivel(nivel)
                  if (!contaAlvo) setModulos(modulosIniciais(nivel, papelConta))
                }}
              >
                <option value="gestor">Gestor — edita o que estiver marcado</option>
                <option value="operador">Operador — consulta o que estiver marcado</option>
              </select>
            </label>

            <div style={{ display: 'grid', gap: 8 }}>
              {catalogo.map((mod) => (
                <label key={mod.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ minWidth: 180 }}>{mod.label}</span>
                  <select
                    className="cadastro-input"
                    value={modulos[mod.id] ?? 'bloqueado'}
                    onChange={(e) =>
                      setModulos((prev) => ({
                        ...prev,
                        [mod.id]: e.target.value as ModuloAcesso | 'bloqueado',
                      }))
                    }
                  >
                    <option value="editar">Editar</option>
                    <option value="visualizar">Só ver</option>
                    <option value="bloqueado">Não vê</option>
                  </select>
                </label>
              ))}
            </div>

            <button
              type="button"
              className="cadastro-btn cadastro-btn--primary"
              disabled={salvando}
              onClick={() => void salvarConta()}
            >
              {contaAlvo ? 'Salvar permissões' : 'Criar conta neste ponto'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
