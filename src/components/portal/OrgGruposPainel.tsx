import { useEffect, useMemo, useState } from 'react'
import {
  ORG_TIPO_LABEL,
  allowedOrgChildTypes,
  findOrgNo,
  flattenOrg,
  type OrgNo,
} from '../../lib/orgHierarchy'
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
  onChange?: () => void
}

export function OrgGruposPainel({ tree, onChange }: Props) {
  const [grupos, setGrupos] = useState<GrupoHierarquia[]>(() => loadOrgGrupos())
  const [aberto, setAberto] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [donaId, setDonaId] = useState('')
  const [empresaId, setEmpresaId] = useState('')
  const [paiId, setPaiId] = useState('')
  const [erro, setErro] = useState('')

  const empresas = useMemo(() => flattenOrg(tree), [tree])
  const donas = useMemo(
    () => empresas.filter((n) => n.tipo === 'operador_logistico' || n.tipo === 'embarcador'),
    [empresas],
  )
  const grupo = grupos.find((g) => g.id === aberto) ?? null

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
    const r = criarGrupoHierarquia(grupos, { nome, descricao, empresaId: donaId })
    if (r.erro) {
      setErro(r.erro)
      return
    }
    gravar(r.grupos)
    setNome('')
    setDescricao('')
    setDonaId('')
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
          Igual ao Doca Livre: cada grupo tem a própria árvore. A mesma empresa pode estar em mais de um
          grupo, e em cada um fica abaixo de um pai diferente. Quem está num ponto vê a si mesmo e quem está
          abaixo, em todos os grupos.
        </p>
        {erro ? <p className="portal-login__info" style={{ marginBottom: 12 }}>{erro}</p> : null}

        {grupo ? (
          <GrupoAberto
            grupo={grupo}
            tree={tree}
            fora={fora}
            empresaId={empresaId}
            paiId={paiId}
            onEmpresa={setEmpresaId}
            onPai={setPaiId}
            onAdd={adicionar}
            onRemove={(id) => gravar(removerMembroGrupo(grupos, grupo.id, id))}
            onBack={() => {
              setAberto(null)
              setErro('')
            }}
          />
        ) : (
          <>
            <div className="nova-conta__modos" style={{ marginBottom: 12, alignItems: 'end' }}>
              <label>
                Nome do grupo
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Estrutura Ultrafrio" />
              </label>
              <label>
                Empresa dona
                <select value={donaId} onChange={(e) => setDonaId(e.target.value)}>
                  <option value="">Selecione</option>
                  {donas.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nome} — {ORG_TIPO_LABEL[n.tipo]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Descrição
                <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional" />
              </label>
              <button type="button" className="cadastro-btn cadastro-btn--primary" onClick={criar}>
                Novo grupo
              </button>
            </div>
            {grupos.length === 0 ? (
              <p className="cadastro-empty">Nenhum grupo ainda.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {grupos.map((g) => {
                  const dona = findOrgNo(tree, g.empresa_id)
                  return (
                    <li
                      key={g.id}
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderTop: '1px solid #e2e8f0',
                      }}
                    >
                      <span>
                        <strong>{g.nome}</strong>
                        <span style={{ display: 'block', color: '#64748b', fontSize: 13 }}>
                          {dona?.nome || 'Empresa'} · {g.membros.length} empresa{g.membros.length === 1 ? '' : 's'}
                          {g.descricao ? ` · ${g.descricao}` : ''}
                        </span>
                      </span>
                      <span style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={() => setAberto(g.id)}>
                          Abrir
                        </button>
                        <button
                          type="button"
                          className="cadastro-btn cadastro-btn--ghost"
                          onClick={() => gravar(excluirGrupoHierarquia(grupos, g.id))}
                        >
                          Excluir
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
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
  fora,
  empresaId,
  paiId,
  onEmpresa,
  onPai,
  onAdd,
  onRemove,
  onBack,
}: {
  grupo: GrupoHierarquia
  tree: OrgNo[]
  fora: OrgNo[]
  empresaId: string
  paiId: string
  onEmpresa: (id: string) => void
  onPai: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onBack: () => void
}) {
  const raizes = arvoreDoGrupo(grupo)
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
      <div className="nova-conta__modos" style={{ marginBottom: 12, alignItems: 'end' }}>
        <label>
          Empresa
          <select value={empresaId} onChange={(e) => onEmpresa(e.target.value)}>
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
          <select value={paiId} onChange={(e) => onPai(e.target.value)}>
            <option value="">Topo do grupo</option>
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
        <button type="button" className="cadastro-btn cadastro-btn--primary" onClick={onAdd} disabled={!empresaId}>
          Adicionar ao grupo
        </button>
      </div>
      {raizes.length === 0 ? (
        <p className="cadastro-empty">Nenhuma empresa neste grupo.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {raizes.map((no) => (
            <LinhaGrupo key={no.id} no={no} tree={tree} grupo={grupo} nivel={0} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </div>
  )
}

function LinhaGrupo({
  no,
  tree,
  grupo,
  nivel,
  onRemove,
}: {
  no: NoGrupo
  tree: OrgNo[]
  grupo: GrupoHierarquia
  nivel: number
  onRemove: (id: string) => void
}) {
  const empresa = findOrgNo(tree, no.id)
  if (!empresa) return null
  return (
    <li>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          alignItems: 'center',
          marginLeft: nivel * 18,
          padding: '6px 0',
          borderTop: '1px solid #e2e8f0',
        }}
      >
        <span>
          <strong>{empresa.nome}</strong>
          <span style={{ marginLeft: 8, color: '#64748b', fontSize: 12 }}>{ORG_TIPO_LABEL[empresa.tipo]}</span>
        </span>
        {grupo.empresa_id === empresa.id ? (
          <span style={{ fontSize: 12, color: '#64748b' }}>Dona do grupo</span>
        ) : (
          <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={() => onRemove(empresa.id)}>
            Tirar
          </button>
        )}
      </div>
      {no.filhos.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {no.filhos.map((filho) => (
            <LinhaGrupo key={filho.id} no={filho} tree={tree} grupo={grupo} nivel={nivel + 1} onRemove={onRemove} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
