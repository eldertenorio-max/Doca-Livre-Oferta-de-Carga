import { useEffect, useMemo, useState } from 'react'
import { OrgHierarchyTree } from './OrgHierarchyTree'
import {
  ORG_TIPO_LABEL,
  allowedOrgChildTypes,
  findOrgNo,
  flattenOrg,
  type OrgNo,
} from '../../lib/orgHierarchy'
import type { PortalAccount } from '../../lib/portalAuth'
import type { Transportador } from '../../types'
import {
  adicionarMembroGrupo,
  arvoreDoGrupo,
  criarGrupoHierarquia,
  excluirGrupoHierarquia,
  hydrateOrgGrupos,
  loadOrgGrupos,
  removerMembroGrupo,
  saveOrgGrupos,
  type GrupoHierarquia,
  type NoGrupo,
} from '../../lib/orgGrupos'

type Props = {
  tree: OrgNo[]
  accounts: PortalAccount[]
  transportadores: Transportador[]
  onEdit?: (node: OrgNo) => void
  onAbertoChange?: (aberto: boolean) => void
  onGestaoEmpresas?: () => void
  gestaoEmpresas?: boolean
  onChange?: () => void
}

function nosDoGrupo(grupo: GrupoHierarquia, tree: OrgNo[]): OrgNo[] {
  function mapear(no: NoGrupo, pai: string | null): OrgNo | null {
    const base = findOrgNo(tree, no.id)
    if (!base) return null
    return {
      ...base,
      parent_id: pai,
      children: no.filhos
        .map((filho) => mapear(filho, no.id))
        .filter((item): item is OrgNo => Boolean(item)),
    }
  }
  return arvoreDoGrupo(grupo)
    .map((no) => mapear(no, null))
    .filter((item): item is OrgNo => Boolean(item))
}

export function OrgGruposPainel({
  tree,
  accounts,
  transportadores,
  onEdit,
  onAbertoChange,
  onGestaoEmpresas,
  gestaoEmpresas,
  onChange,
}: Props) {
  const [grupos, setGrupos] = useState<GrupoHierarquia[]>(() => loadOrgGrupos())
  const [aberto, setAberto] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [donaTexto, setDonaTexto] = useState('')
  /** vazio = só o grupo; com_dona = já nasce com empresa */
  const [modoCriacao, setModoCriacao] = useState<'vazio' | 'com_dona'>('vazio')
  const [empresaId, setEmpresaId] = useState('')
  const [paiId, setPaiId] = useState('')
  const [erro, setErro] = useState('')

  const empresas = useMemo(() => flattenOrg(tree), [tree])
  const donas = useMemo(
    () => empresas.filter((n) => n.tipo === 'operador_logistico' || n.tipo === 'embarcador'),
    [empresas],
  )

  function resolverDonaId(texto: string): string | null {
    const bruto = texto.trim()
    if (!bruto) return null
    const byId = donas.find((n) => n.id === bruto)
    if (byId) return byId.id
    const t = bruto.toLowerCase()
    const exact = donas.find((n) => n.nome.trim().toLowerCase() === t)
    if (exact) return exact.id
    const parcial = donas.filter((n) => n.nome.toLowerCase().includes(t))
    return parcial.length === 1 ? parcial[0].id : null
  }
  const grupo = grupos.find((g) => g.id === aberto) ?? null
  const desenho = useMemo(() => (grupo ? nosDoGrupo(grupo, tree) : []), [grupo, tree])

  useEffect(() => {
    onAbertoChange?.(Boolean(aberto))
  }, [aberto, onAbertoChange])

  useEffect(() => {
    void hydrateOrgGrupos(empresas).then(setGrupos)
  }, [empresas])

  function gravar(next: GrupoHierarquia[]) {
    setGrupos(next)
    saveOrgGrupos(next)
    onChange?.()
  }

  function criar() {
    setErro('')
    let donaId = ''
    if (modoCriacao === 'com_dona') {
      if (!donaTexto.trim()) {
        setErro('Informe a empresa dona do grupo, ou escolha “Grupo primeiro”.')
        return
      }
      const resolvida = resolverDonaId(donaTexto)
      if (!resolvida) {
        setErro(
          'Não achei essa empresa dona. Digite o nome de um operador ou embarcador já cadastrado (ou cadastre em Gestão de empresas).',
        )
        return
      }
      donaId = resolvida
    }
    const r = criarGrupoHierarquia(grupos, { nome, descricao, empresaId: donaId || undefined })
    if (r.erro) {
      setErro(r.erro)
      return
    }
    gravar(r.grupos)
    setNome('')
    setDescricao('')
    setDonaTexto('')
    const novo = r.grupos[r.grupos.length - 1]
    if (novo) setAberto(novo.id)
  }

  function adicionar() {
    if (!grupo) return
    setErro('')
    const empresa = findOrgNo(tree, empresaId)
    const pai = paiId ? findOrgNo(tree, paiId) : null
    const aceito = Boolean(
      empresa && allowedOrgChildTypes(pai?.tipo ?? null).includes(empresa.tipo),
    )
    const r = adicionarMembroGrupo(grupos, grupo.id, empresaId, paiId || null, aceito)
    if (r.erro) {
      setErro(r.erro)
      return
    }
    gravar(r.grupos)
    setEmpresaId('')
    setPaiId('')
  }

  const fora = grupo ? empresas.filter((n) => !grupo.membros.some((m) => m.empresa_id === n.id)) : []

  return (
    <section className="form-card form-card--blue" style={{ marginBottom: 16 }}>
      <header className="form-card__head">
        <h2 className="form-card__title">Grupos de hierarquia</h2>
      </header>
      <div className="form-card__body">
        <p className="portal-login__hint" style={{ marginBottom: 12 }}>
          Duas formas: crie só o grupo e depois coloque as empresas, ou já escolha a empresa dona.
          No cadastro de conta (Usuários → Nova conta) também dá para criar um grupo novo.
        </p>
        {erro ? <p className="portal-login__info" style={{ marginBottom: 12 }}>{erro}</p> : null}

        {grupo ? (
          <GrupoAberto
            grupo={grupo}
            tree={tree}
            desenho={desenho}
            accounts={accounts}
            transportadores={transportadores}
            fora={fora}
            empresaId={empresaId}
            paiId={paiId}
            onEmpresa={setEmpresaId}
            onPai={setPaiId}
            onAdd={adicionar}
            onEdit={onEdit}
            onRemove={(id) => {
              if (grupo.empresa_id && id === grupo.empresa_id) {
                setErro('A empresa dona do grupo permanece na hierarquia.')
                return
              }
              setErro('')
              gravar(removerMembroGrupo(grupos, grupo.id, id))
            }}
            onBack={() => {
              setAberto(null)
              setErro('')
            }}
          />
        ) : (
          <>
            <div className="cadastro-ramificacoes" role="list" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className={`cadastro-ramificacao${modoCriacao === 'vazio' ? ' is-on' : ''}`}
                onClick={() => {
                  setModoCriacao('vazio')
                  setDonaTexto('')
                }}
              >
                <strong>Grupo primeiro</strong>
                <span>Cria só o nome. Depois você coloca as empresas dentro.</span>
              </button>
              <button
                type="button"
                className={`cadastro-ramificacao${modoCriacao === 'com_dona' ? ' is-on' : ''}`}
                onClick={() => setModoCriacao('com_dona')}
              >
                <strong>Já com empresa dona</strong>
                <span>Escolhe a dona agora e já abre a hierarquia com ela.</span>
              </button>
            </div>
            <div className="hierarquia-form">
              <label>
                Nome do grupo
                <input className="cadastro-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Estrutura Ultrafrio" />
              </label>
              {modoCriacao === 'com_dona' ? (
                <label>
                  Empresa dona
                  <input
                    className="cadastro-input"
                    list="hierarquia-donas-lista"
                    value={donaTexto}
                    onChange={(e) => setDonaTexto(e.target.value)}
                    placeholder="Digite o nome da empresa"
                    autoComplete="off"
                  />
                  <datalist id="hierarquia-donas-lista">
                    {donas.map((n) => (
                      <option key={n.id} value={n.nome}>
                        {ORG_TIPO_LABEL[n.tipo]}
                      </option>
                    ))}
                  </datalist>
                </label>
              ) : (
                <label>
                  Empresa dona
                  <input className="cadastro-input" value="" disabled placeholder="Depois, ao adicionar a 1ª empresa" />
                </label>
              )}
              <label>
                Descrição
                <input className="cadastro-input" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional" />
              </label>
            </div>
            <div className="hierarquia-form__acoes">
              <button type="button" className="cadastro-btn cadastro-btn--primary" onClick={criar}>
                Novo grupo
              </button>
              {onGestaoEmpresas ? (
                <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={onGestaoEmpresas}>
                  {gestaoEmpresas ? 'Fechar empresas' : 'Gestão de empresas'}
                </button>
              ) : null}
            </div>
            {grupos.length === 0 ? (
              <p className="cadastro-empty">Nenhum grupo ainda.</p>
            ) : (
              <table className="hierarquia-lista">
                <thead>
                  <tr>
                    <th>Grupo</th>
                    <th>Empresa dona</th>
                    <th>Empresas</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g) => {
                    const dona = findOrgNo(tree, g.empresa_id)
                    return (
                      <tr key={g.id}>
                        <td>
                          <button
                            type="button"
                            onClick={() => setAberto(g.id)}
                            style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                          >
                            <strong>{g.nome}</strong>
                            {g.descricao ? (
                              <span style={{ display: 'block', color: '#64748b', fontSize: 13 }}>{g.descricao}</span>
                            ) : null}
                          </button>
                        </td>
                        <td>{dona?.nome || (g.empresa_id ? 'Empresa' : '—')}</td>
                        <td>{g.membros.length}</td>
                        <td>
                          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={() => setAberto(g.id)}>
                              Hierarquia
                            </button>
                            <button
                              type="button"
                              className="cadastro-btn cadastro-btn--ghost"
                              onClick={() => gravar(excluirGrupoHierarquia(grupos, g.id))}
                            >
                              Excluir
                            </button>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function GrupoAberto({
  grupo,
  tree,
  desenho,
  accounts,
  transportadores,
  fora,
  empresaId,
  paiId,
  onEmpresa,
  onPai,
  onAdd,
  onEdit,
  onRemove,
  onBack,
}: {
  grupo: GrupoHierarquia
  tree: OrgNo[]
  desenho: OrgNo[]
  accounts: PortalAccount[]
  transportadores: Transportador[]
  fora: OrgNo[]
  empresaId: string
  paiId: string
  onEmpresa: (id: string) => void
  onPai: (id: string) => void
  onAdd: () => void
  onEdit?: (node: OrgNo) => void
  onRemove: (id: string) => void
  onBack: () => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div>
          <strong>{grupo.nome}</strong>
          {grupo.descricao ? <p className="portal-login__hint">{grupo.descricao}</p> : null}
        </div>
        <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={onBack}>
          Voltar aos grupos
        </button>
      </div>
      {grupo.membros.length === 0 ? (
        <p className="portal-login__hint" style={{ marginBottom: 12 }}>
          Grupo vazio. Adicione a primeira empresa (operador ou embarcador) no topo; ela vira a dona.
        </p>
      ) : null}
      <div className="hierarquia-form">
        <label>
          Empresa
          <select className="cadastro-input" value={empresaId} onChange={(e) => onEmpresa(e.target.value)}>
            <option value="">Selecione</option>
            {fora.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nome} — {ORG_TIPO_LABEL[n.tipo]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fica abaixo de
          <select
            className="cadastro-input"
            value={paiId}
            onChange={(e) => onPai(e.target.value)}
            disabled={grupo.membros.length === 0}
          >
            <option value="">{grupo.membros.length === 0 ? 'Topo (1ª empresa / dona)' : 'Topo do grupo'}</option>
            {grupo.membros.map((m) => {
              const n = findOrgNo(tree, m.empresa_id)
              if (!n) return null
              return (
                <option key={m.empresa_id} value={m.empresa_id}>
                  {n.nome} — {ORG_TIPO_LABEL[n.tipo]}
                </option>
              )
            })}
          </select>
        </label>
        <div className="hierarquia-form__acoes">
          <button type="button" className="cadastro-btn cadastro-btn--primary" onClick={onAdd} disabled={!empresaId}>
            Adicionar ao grupo
          </button>
        </div>
      </div>
      <OrgHierarchyTree
        nodes={desenho}
        accounts={accounts}
        transportadores={transportadores}
        rotuloRaiz="+ No topo"
        onAdd={(parent) => onPai(parent?.id ?? '')}
        onEdit={(node) => onEdit?.(node)}
        onRemove={onRemove}
      />
    </div>
  )
}
