import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { createPortalAccount } from '../../lib/portalAuth'
import {
  ORG_TIPO_LABEL,
  allowedOrgChildTypes,
  flattenOrg,
  gruposDaHierarquia,
  hydrateOrgTree,
  loadOrgTree,
  saveOrgTree,
  upsertOrgNo,
  type OrgNo,
  type OrgTipo,
} from '../../lib/orgHierarchy'
import { isSuperSession } from '../../lib/superUsers'
import '../../styles/cadastro.css'
import '../../styles/login.css'

const TIPOS_CONTA: Array<{ id: OrgTipo; label: string; resumo: string }> = [
  {
    id: 'operador_logistico',
    label: 'Operador logístico',
    resumo: 'Topo da operação. Pode ter filial e embarcador abaixo.',
  },
  {
    id: 'filial_operador',
    label: 'Filial do operador',
    resumo: 'Filial abaixo de um operador logístico.',
  },
  {
    id: 'embarcador',
    label: 'Embarcador',
    resumo: 'Dono da carga. Fica no topo, no operador ou na filial.',
  },
  {
    id: 'unidade',
    label: 'Unidade',
    resumo: 'Galpão ou CD abaixo do embarcador ou da filial.',
  },
  {
    id: 'transportadora',
    label: 'Transportadora',
    resumo: 'Empresa de transporte abaixo da unidade ou da filial.',
  },
]

function podeNoTopo(tipo: OrgTipo) {
  return allowedOrgChildTypes(null).includes(tipo)
}

export function NovaContaPortalPage() {
  const { user, transportadores, salvarGrupo } = useData()
  const [tree, setTree] = useState<OrgNo[]>(() => loadOrgTree())
  const [tipo, setTipo] = useState<OrgTipo | null>(null)
  const [modo, setModo] = useState<'nova' | 'existente'>('nova')
  const [parentId, setParentId] = useState('')
  const [existenteId, setExistenteId] = useState('')
  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [contaNome, setContaNome] = useState('')
  const [login, setLogin] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nivel, setNivel] = useState<'gestor' | 'operador'>('gestor')
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    void hydrateOrgTree().then(setTree)
  }, [])

  const flat = useMemo(() => flattenOrg(tree), [tree])

  const existentes = useMemo(() => {
    if (!tipo) return []
    if (tipo === 'transportadora') {
      const dasFichas = transportadores
        .filter((t) => t.situacao !== 'inativo' && t.situacao !== 'recusado')
        .map((t) => ({
          id: `t:${t.id}`,
          rotulo: t.nome_fantasia || t.razao_social || t.cnpj || t.id,
        }))
      const idsFicha = new Set(transportadores.map((t) => t.id))
      const daArvore = flat
        .filter((n) => n.tipo === 'transportadora' && !idsFicha.has(n.transportador_id || ''))
        .map((n) => ({ id: `org:${n.id}`, rotulo: n.nome }))
      return [...dasFichas, ...daArvore]
    }
    return flat
      .filter((n) => n.tipo === tipo)
      .map((n) => ({ id: n.id, rotulo: n.nome }))
  }, [tipo, flat, transportadores])

  const pais = useMemo(() => {
    if (!tipo) return []
    return flat
      .filter((n) => allowedOrgChildTypes(n.tipo).includes(tipo))
      .map((n) => ({
        id: n.id,
        rotulo: `${ORG_TIPO_LABEL[n.tipo]}: ${n.nome}`,
      }))
  }, [tipo, flat])

  if (!user) return <Navigate to="/login" replace />
  if (!isSuperSession(user)) return <Navigate to="/home" replace />

  function escolherTipo(id: OrgTipo) {
    setTipo(id)
    setModo('nova')
    setParentId('')
    setExistenteId('')
    setNomeEmpresa('')
    setCnpj('')
    setErro('')
    setMsg('')
  }

  function persistTree(next: OrgNo[]) {
    setTree(next)
    saveOrgTree(next)
    for (const g of gruposDaHierarquia(next)) salvarGrupo(g)
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!tipo || salvando) return
    setErro('')
    setMsg('')
    if (login.trim().length < 2) {
      setErro('Informe um login com ao menos 2 caracteres.')
      return
    }
    if (!email.trim().includes('@')) {
      setErro('Informe um e-mail válido.')
      return
    }
    if (senha.trim().length < 4) {
      setErro('A senha precisa ter ao menos 4 caracteres.')
      return
    }

    let orgId = ''
    let transportadorId: string | null = null
    let nomeDaEmpresa = nomeEmpresa.trim()

    if (modo === 'existente') {
      if (!existenteId) {
        setErro('Escolha a empresa em que esta conta vai entrar.')
        return
      }
      if (tipo === 'transportadora' && existenteId.startsWith('t:')) {
        const tid = existenteId.slice(2)
        const t = transportadores.find((x) => x.id === tid)
        if (!t) {
          setErro('Transportadora não encontrada.')
          return
        }
        transportadorId = t.id
        nomeDaEmpresa = t.nome_fantasia || t.razao_social || nomeDaEmpresa
      } else {
        orgId = tipo === 'transportadora' && existenteId.startsWith('org:') ? existenteId.slice(4) : existenteId
        const no = flat.find((n) => n.id === orgId)
        if (!no || no.tipo !== tipo) {
          setErro('Empresa não encontrada nessa lista.')
          return
        }
        if (no.transportador_id) transportadorId = no.transportador_id
        nomeDaEmpresa = no.nome || nomeDaEmpresa
      }
    } else {
      if (!nomeDaEmpresa) {
        setErro('Informe o nome da empresa.')
        return
      }
      if (!podeNoTopo(tipo) && !parentId) {
        setErro('Escolha em qual empresa esta fica abaixo.')
        return
      }
      if (podeNoTopo(tipo) === false && pais.length === 0) {
        setErro('Cadastre primeiro a empresa que fica acima desta.')
        return
      }
      const no: OrgNo = {
        id: `org-${Math.random().toString(36).slice(2, 10)}`,
        parent_id: parentId || null,
        tipo,
        nome: nomeDaEmpresa,
        cnpj: cnpj.trim() || null,
        ordem: flat.filter((n) => n.parent_id === (parentId || null)).length + 1,
        children: [],
      }
      persistTree(upsertOrgNo(tree, no))
      orgId = no.id
    }

    const acessoTransportadora = tipo === 'transportadora' && Boolean(transportadorId)
    setSalvando(true)
    const created = await createPortalAccount({
      nome: contaNome.trim() || nomeDaEmpresa || login.trim(),
      usuario: login.trim(),
      email: email.trim(),
      password: senha.trim(),
      role: acessoTransportadora ? 'transportador' : 'minerva',
      nivel,
      perfil_operacional: nivel === 'gestor' ? 'administrador' : 'operador',
      empresa_org_id: acessoTransportadora ? null : orgId,
      transportador_id: acessoTransportadora ? transportadorId : null,
    })
    setSalvando(false)
    if (!created.ok) {
      setErro(created.erro)
      return
    }
    setMsg(
      modo === 'nova'
        ? `${nomeDaEmpresa} entrou na hierarquia e a conta ${created.account.usuario} foi aberta.`
        : `Conta ${created.account.usuario} aberta em ${nomeDaEmpresa}. Nenhuma empresa nova foi criada.`,
    )
    setLogin('')
    setEmail('')
    setSenha('')
    setContaNome('')
    if (modo === 'nova') {
      setNomeEmpresa('')
      setCnpj('')
      setParentId('')
    }
  }

  const tipoEscolhido = TIPOS_CONTA.find((t) => t.id === tipo) ?? null
  const exigePai = tipo ? !podeNoTopo(tipo) : false

  return (
    <div className="cadastro-page animate-fade-up">
      <h1 className="cadastro-page-title">Nova conta</h1>
      <p style={{ color: '#1a1d21', marginTop: -8, marginBottom: 16, fontSize: '0.92rem', maxWidth: 720 }}>
        Escolha o que você quer cadastrar. Em seguida a página abre a conta de acesso dessa empresa.
      </p>

      {!tipo ? (
        <section className="form-card form-card--blue">
          <header className="form-card__head">
            <h2 className="form-card__title">O que você quer cadastrar?</h2>
          </header>
          <div className="form-card__body">
            <div className="cadastro-ramificacoes" role="list">
              {TIPOS_CONTA.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="cadastro-ramificacao"
                  onClick={() => escolherTipo(t.id)}
                >
                  <strong>{t.label}</strong>
                  <span>{t.resumo}</span>
                </button>
              ))}
            </div>
            <p style={{ marginTop: 16 }}>
              <Link to="/embarcador/config?aba=usuarios" className="portal-login__link">
                Voltar às contas
              </Link>
            </p>
          </div>
        </section>
      ) : (
        <form onSubmit={(e) => void salvar(e)}>
          <section className="form-card form-card--blue" style={{ marginBottom: 16 }}>
            <header className="form-card__head" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <h2 className="form-card__title">{tipoEscolhido?.label}</h2>
              <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={() => setTipo(null)}>
                Trocar tipo
              </button>
            </header>
            <div className="form-card__body" style={{ display: 'grid', gap: 12 }}>
              <p className="portal-login__hint" style={{ margin: 0 }}>
                {tipoEscolhido?.resumo}
              </p>
              <div className="nova-conta__modos">
                <button
                  type="button"
                  className={`cadastro-btn ${modo === 'nova' ? 'cadastro-btn--primary' : 'cadastro-btn--ghost'}`}
                  onClick={() => {
                    setModo('nova')
                    setErro('')
                    setMsg('')
                  }}
                >
                  Cadastrar nova
                </button>
                <button
                  type="button"
                  className={`cadastro-btn ${modo === 'existente' ? 'cadastro-btn--primary' : 'cadastro-btn--ghost'}`}
                  onClick={() => {
                    setModo('existente')
                    setErro('')
                    setMsg('')
                  }}
                >
                  Abrir conta numa já cadastrada
                </button>
              </div>
              <p className="portal-login__hint" style={{ margin: 0 }}>
                {modo === 'nova'
                  ? 'Cria a empresa na hierarquia e abre o login dela.'
                  : 'Só abre o login. A empresa escolhida continua a mesma.'}
              </p>

              {modo === 'existente' ? (
                existentes.length === 0 ? (
                  <p className="portal-login__hint">
                    Ainda não há empresa deste tipo. Use Cadastrar nova.
                  </p>
                ) : (
                  <label>
                    <span className="cadastro-label">Empresa</span>
                    <select
                      className="cadastro-input"
                      value={existenteId}
                      onChange={(e) => setExistenteId(e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {existentes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              ) : (
                <>
                  <label>
                    <span className="cadastro-label">Nome</span>
                    <input
                      className="cadastro-input"
                      value={nomeEmpresa}
                      onChange={(e) => setNomeEmpresa(e.target.value)}
                    />
                  </label>
                  <label>
                    <span className="cadastro-label">CNPJ</span>
                    <input className="cadastro-input" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
                  </label>
                  <label>
                    <span className="cadastro-label">Fica abaixo de {exigePai ? '*' : ''}</span>
                    <select
                      className="cadastro-input"
                      value={parentId}
                      onChange={(e) => setParentId(e.target.value)}
                    >
                      {podeNoTopo(tipo) ? <option value="">Topo (sem empresa acima)</option> : <option value="">Selecione</option>}
                      {pais.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                  {exigePai && pais.length === 0 ? (
                    <p className="portal-login__hint">
                      Ainda não há empresa acima deste tipo. Cadastre primeiro o operador, a filial ou o embarcador.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </section>

          <section className="form-card form-card--green">
            <header className="form-card__head">
              <h2 className="form-card__title">Conta de acesso</h2>
            </header>
            <div className="form-card__body" style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <label>
                  <span className="cadastro-label">Nome de quem acessa</span>
                  <input className="cadastro-input" value={contaNome} onChange={(e) => setContaNome(e.target.value)} />
                </label>
                <label>
                  <span className="cadastro-label">Login</span>
                  <input className="cadastro-input" value={login} onChange={(e) => setLogin(e.target.value)} />
                </label>
                <label>
                  <span className="cadastro-label">E-mail</span>
                  <input className="cadastro-input" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label>
                  <span className="cadastro-label">Senha</span>
                  <input className="cadastro-input" value={senha} onChange={(e) => setSenha(e.target.value)} />
                </label>
              </div>
              <label>
                <span className="cadastro-label">Nível</span>
                <select
                  className="cadastro-input"
                  value={nivel}
                  onChange={(e) => setNivel(e.target.value === 'operador' ? 'operador' : 'gestor')}
                >
                  <option value="gestor">Gestor — edita o que estiver permitido</option>
                  <option value="operador">Operador — consulta o que estiver permitido</option>
                </select>
              </label>
              {erro ? <p className="portal-login__erro">{erro}</p> : null}
              {msg ? <p className="portal-login__info">{msg}</p> : null}
              <div className="nova-conta__modos">
                <button type="submit" className="cadastro-btn cadastro-btn--primary" disabled={salvando}>
                  {salvando ? 'Abrindo conta…' : 'Abrir conta'}
                </button>
                <Link to="/embarcador/config?aba=usuarios" className="cadastro-btn cadastro-btn--ghost">
                  Voltar às contas
                </Link>
              </div>
            </div>
          </section>
        </form>
      )}
    </div>
  )
}
