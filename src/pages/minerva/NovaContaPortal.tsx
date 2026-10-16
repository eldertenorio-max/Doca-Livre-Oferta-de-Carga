import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
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
import {
  adicionarMembroGrupo,
  criarGrupoHierarquia,
  hydrateOrgGrupos,
  loadOrgGrupos,
  saveOrgGrupos,
  type GrupoHierarquia,
} from '../../lib/orgGrupos'
import { isSuperSession } from '../../lib/superUsers'
import { sameTransportadorId } from '../../lib/transportadorIds'
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
  const [params] = useSearchParams()
  const grupoQuery = params.get('grupo') || ''
  const [tree, setTree] = useState<OrgNo[]>(() => loadOrgTree())
  const [grupos, setGrupos] = useState<GrupoHierarquia[]>(() => loadOrgGrupos())
  const [passoGrupo, setPassoGrupo] = useState<'perguntar' | 'pronto'>(grupoQuery ? 'pronto' : 'perguntar')
  const [destino, setDestino] = useState<'existente' | 'novo' | null>(grupoQuery ? 'existente' : null)
  const [grupoId, setGrupoId] = useState(grupoQuery)
  const [nomeGrupo, setNomeGrupo] = useState('')
  const [descGrupo, setDescGrupo] = useState('')
  const [donaId, setDonaId] = useState('')
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
    void hydrateOrgTree().then((proxima) => {
      setTree(proxima)
      void hydrateOrgGrupos(flattenOrg(proxima)).then(setGrupos)
    })
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

  const grupoAlvo = grupos.find((g) => g.id === grupoId) ?? null
  const donas = useMemo(
    () => flat.filter((n) => n.tipo === 'operador_logistico' || n.tipo === 'embarcador'),
    [flat],
  )

  const pais = useMemo(() => {
    if (!tipo) return []
    let base = flat.filter((n) => allowedOrgChildTypes(n.tipo).includes(tipo))
    if (destino === 'existente' && grupoAlvo) {
      const ids = new Set(grupoAlvo.membros.map((m) => m.empresa_id))
      base = base.filter((n) => ids.has(n.id))
    }
    if (destino === 'novo' && donaId) base = base.filter((n) => n.id === donaId)
    return base.map((n) => ({
      id: n.id,
      rotulo: `${ORG_TIPO_LABEL[n.tipo]}: ${n.nome}`,
    }))
  }, [tipo, flat, destino, grupoAlvo, donaId])

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

  function confirmarGrupo() {
    setErro('')
    setMsg('')
    if (destino === 'existente') {
      if (!grupoId) {
        setErro('Escolha a hierarquia.')
        return
      }
      setPassoGrupo('pronto')
      return
    }
    if (destino === 'novo') {
      if (!nomeGrupo.trim()) {
        setErro('Informe o nome do novo grupo.')
        return
      }
      setPassoGrupo('pronto')
      return
    }
    setErro('Escolha se a conta entra numa hierarquia já feita ou num grupo novo.')
  }

  function ligarEmpresaNoGrupo(empresaId: string): string {
    if (!tipo || !destino) return 'Escolha a hierarquia desta conta.'
    let atuais = loadOrgGrupos()
    if (destino === 'novo') {
      const dona = donaId || empresaId
      if (!dona) return 'Escolha a empresa dona do grupo.'
      const criado = criarGrupoHierarquia(atuais, {
        nome: nomeGrupo,
        descricao: descGrupo,
        empresaId: dona,
      })
      if (criado.erro) return criado.erro
      atuais = criado.grupos
      const novo = atuais[atuais.length - 1]
      if (empresaId && empresaId !== dona && novo) {
        const pai = parentId || dona
        const paiNo = flat.find((n) => n.id === pai)
        const aceito = allowedOrgChildTypes(paiNo?.tipo ?? null).includes(tipo)
        const add = adicionarMembroGrupo(atuais, novo.id, empresaId, pai, aceito)
        if (add.erro) return add.erro
        atuais = add.grupos
      }
      saveOrgGrupos(atuais)
      setGrupos(atuais)
      return ''
    }
    if (!empresaId) return 'Não foi possível ligar a empresa à hierarquia.'
    const grupo = atuais.find((g) => g.id === grupoId)
    if (!grupo) return 'Hierarquia não encontrada.'
    if (grupo.membros.some((m) => m.empresa_id === empresaId)) return ''
    const pai = parentId || null
    const paiNo = pai ? flat.find((n) => n.id === pai) : null
    const aceito = allowedOrgChildTypes(paiNo?.tipo ?? null).includes(tipo)
    const add = adicionarMembroGrupo(atuais, grupo.id, empresaId, pai, aceito)
    if (add.erro) return add.erro
    saveOrgGrupos(add.grupos)
    setGrupos(add.grupos)
    return ''
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
    if (passoGrupo !== 'pronto' || !destino) {
      setErro('Escolha se a conta entra numa hierarquia já feita ou num grupo novo.')
      return
    }
    if (destino === 'novo' && !nomeGrupo.trim()) {
      setErro('Informe o nome do novo grupo.')
      return
    }
    if (destino === 'novo' && !donaId && tipo !== 'operador_logistico' && tipo !== 'embarcador') {
      setErro('Escolha a empresa dona do grupo, ou cadastre um operador logístico ou embarcador como dono.')
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
        parent_id: destino === 'novo' && !donaId ? null : parentId || null,
        tipo,
        nome: nomeDaEmpresa,
        cnpj: cnpj.trim() || null,
        ordem: flat.filter((n) => n.parent_id === (parentId || null)).length + 1,
        children: [],
      }
      persistTree(upsertOrgNo(tree, no))
      orgId = no.id
    }

    if (!orgId && transportadorId) {
      const ja = flat.find(
        (n) => n.tipo === 'transportadora' && sameTransportadorId(n.transportador_id, transportadorId),
      )
      if (ja) orgId = ja.id
      else {
        const pai = parentId || donaId || null
        if (!pai) {
          setErro('Escolha em qual empresa da hierarquia esta transportadora fica abaixo.')
          return
        }
        const no: OrgNo = {
          id: `org-${Math.random().toString(36).slice(2, 10)}`,
          parent_id: pai,
          tipo: 'transportadora',
          nome: nomeDaEmpresa || login.trim(),
          transportador_id: transportadorId,
          ordem: 1,
          children: [],
        }
        persistTree(upsertOrgNo(tree, no))
        orgId = no.id
      }
    }

    const falhaGrupo = ligarEmpresaNoGrupo(orgId)
    if (falhaGrupo) {
      setErro(falhaGrupo)
      return
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
    const nomeHierarquia = destino === 'novo' ? nomeGrupo.trim() : grupoAlvo?.nome || 'hierarquia'
    if (destino === 'novo') {
      const ultimo = loadOrgGrupos().at(-1)
      if (ultimo) {
        setDestino('existente')
        setGrupoId(ultimo.id)
      }
    }
    setMsg(`Conta ${created.account.usuario} aberta em ${nomeDaEmpresa || 'empresa'} e ligada a ${nomeHierarquia}.`)
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

  const tiposVisiveis =
    destino === 'novo' && !donaId
      ? TIPOS_CONTA.filter((t) => t.id === 'operador_logistico' || t.id === 'embarcador')
      : TIPOS_CONTA
  const tipoEscolhido = TIPOS_CONTA.find((t) => t.id === tipo) ?? null
  const exigePai = tipo ? !podeNoTopo(tipo) : false

  return (
    <div className="cadastro-page animate-fade-up">
      <h1 className="cadastro-page-title">Nova conta</h1>
      <p style={{ color: '#1a1d21', marginTop: -8, marginBottom: 16, fontSize: '0.92rem', maxWidth: 720 }}>
        Você pode colocar a conta numa hierarquia já feita, ou criar um grupo novo neste cadastro.
        Também dá para criar só o grupo vazio em Hierarquia e incluir empresas depois.
      </p>

      {passoGrupo !== 'pronto' ? (
        <section className="form-card form-card--blue">
          <header className="form-card__head">
            <h2 className="form-card__title">Onde esta conta entra?</h2>
          </header>
          <div className="form-card__body" style={{ display: 'grid', gap: 12 }}>
            <div className="cadastro-ramificacoes" role="list">
              <button
                type="button"
                className={`cadastro-ramificacao${destino === 'existente' ? ' is-on' : ''}`}
                onClick={() => setDestino('existente')}
              >
                <strong>Hierarquia já feita</strong>
                <span>A conta entra num grupo que já existe.</span>
              </button>
              <button
                type="button"
                className={`cadastro-ramificacao${destino === 'novo' ? ' is-on' : ''}`}
                onClick={() => setDestino('novo')}
              >
                <strong>Novo grupo</strong>
                <span>Cria outra hierarquia e coloca a conta nela.</span>
              </button>
            </div>
            {destino === 'existente' ? (
              <label>
                <span className="cadastro-label">Hierarquia</span>
                <select className="cadastro-input" value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
                  <option value="">Selecione</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nome}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {destino === 'novo' ? (
              <div className="hierarquia-form">
                <label>
                  Nome do grupo
                  <input className="cadastro-input" value={nomeGrupo} onChange={(e) => setNomeGrupo(e.target.value)} />
                </label>
                <label>
                  Descrição
                  <input className="cadastro-input" value={descGrupo} onChange={(e) => setDescGrupo(e.target.value)} placeholder="Opcional" />
                </label>
                <label>
                  Empresa dona
                  <select className="cadastro-input" value={donaId} onChange={(e) => setDonaId(e.target.value)}>
                    <option value="">A empresa desta conta</option>
                    {donas.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.nome} — {ORG_TIPO_LABEL[n.tipo]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
            {destino === 'novo' && !donaId ? (
              <p className="portal-login__hint" style={{ margin: 0 }}>
                Sem empresa dona, a conta precisa ser de um operador logístico ou embarcador. Esse cadastro vira o topo do grupo.
              </p>
            ) : null}
            {erro ? <p className="portal-login__erro">{erro}</p> : null}
            <div className="hierarquia-form__acoes">
              <button type="button" className="cadastro-btn cadastro-btn--primary" onClick={confirmarGrupo}>
                Continuar
              </button>
              <Link to="/embarcador/config?aba=usuarios" className="cadastro-btn cadastro-btn--ghost">
                Voltar às contas
              </Link>
            </div>
          </div>
        </section>
      ) : !tipo ? (
        <section className="form-card form-card--blue">
          <header className="form-card__head">
            <h2 className="form-card__title">O que você quer cadastrar?</h2>
          </header>
          <div className="form-card__body">
            <div className="cadastro-ramificacoes" role="list">
              {tiposVisiveis.map((t) => (
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
            <p className="portal-login__hint">
              Hierarquia:{' '}
              <strong>{destino === 'novo' ? nomeGrupo.trim() || 'Novo grupo' : grupoAlvo?.nome || 'Grupo'}</strong>
            </p>
            <p style={{ marginTop: 16 }}>
              <button type="button" className="portal-login__link" onClick={() => setPassoGrupo('perguntar')}>
                Trocar hierarquia
              </button>
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
                  <>
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
                  <label>
                    <span className="cadastro-label">Fica abaixo de</span>
                    <select className="cadastro-input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                      {podeNoTopo(tipo) ? <option value="">Topo da hierarquia</option> : <option value="">Selecione</option>}
                      {pais.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                  </>
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
