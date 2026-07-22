import { useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import { CnpjInput } from '../../components/ui/CnpjInput'
import { formatCnpj } from '../../lib/cnpj'
import { formatPhoneBr } from '../../lib/phoneBr'
import { labelDocumento } from '../../lib/transportadorDocs'
import type { ClassificacaoTransportador, SituacaoTransportador, Transportador } from '../../types'
import '../../styles/cadastro.css'

type FilterSit = 'todos' | SituacaoTransportador

const emptyForm = (): Partial<Transportador> => ({
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  inscricao_estadual: '',
  inscricao_municipal: '',
  rntrc: '',
  cidade: '',
  uf: 'SP',
  endereco: '',
  numero: '',
  bairro: '',
  complemento: '',
  cep: '',
  classificacao: 'bronze',
  pontuacao: 50,
  situacao: 'ativo',
  telefone: '',
  email: '',
  contato_nome: '',
  contato_telefone: '',
})

export function TransportadoresPage() {
  const {
    transportadores,
    salvarTransportador,
    excluirTransportador,
    vinculosTransportador,
    documentosDoTransportador,
    aprovarTransportador,
    recusarTransportador,
    historicoDoTransportador,
    lances,
    cargas,
    grupos,
    rankingTransportadores,
  } = useData()
  const [mode, setMode] = useState<'lista' | 'form' | 'revisao' | 'ficha'>('lista')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [revisaoId, setRevisaoId] = useState<string | null>(null)
  const [fichaId, setFichaId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Transportador>>(emptyForm)
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState<FilterSit>('todos')
  const [error, setError] = useState('')
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    let list = transportadores
    if (filtro !== 'todos') list = list.filter((t) => t.situacao === filtro)
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (t) =>
        t.nome_fantasia.toLowerCase().includes(q) ||
        t.razao_social.toLowerCase().includes(q) ||
        t.cnpj.includes(q) ||
        t.cidade.toLowerCase().includes(q),
    )
  }, [transportadores, search, filtro])

  const pendentesCount = transportadores.filter((t) => t.situacao === 'pendente').length
  const revisao = revisaoId ? transportadores.find((t) => t.id === revisaoId) : null
  const docsRevisao = revisaoId ? documentosDoTransportador(revisaoId) : []

  function openNew() {
    setEditingId(null)
    setForm(emptyForm())
    setError('')
    setMode('form')
  }

  function openEdit(t: Transportador) {
    setEditingId(t.id)
    setForm({ ...t, cnpj: formatCnpj(t.cnpj || '') })
    setError('')
    setMode('form')
  }

  function openRevisao(t: Transportador) {
    setRevisaoId(t.id)
    setMotivoRecusa(t.motivo_recusa ?? '')
    setError('')
    setMode('revisao')
  }

  function openFicha(t: Transportador) {
    setFichaId(t.id)
    setMode('ficha')
  }

  function confirmarExclusao(t: Transportador) {
    const v = vinculosTransportador(t.id)
    const linhas = [
      `Excluir a transportadora "${t.nome_fantasia}"?`,
      '',
      'Itens vinculados que também serão removidos:',
      '',
      v.placas.length
        ? `Placas (${v.placas.length}): ${v.placas.join(', ')}`
        : 'Placas: nenhuma',
      v.motoristas.length
        ? `Motoristas (${v.motoristas.length}): ${v.motoristas.join(', ')}`
        : 'Motoristas: nenhum',
      v.documentos > 0 ? `Documentos: ${v.documentos}` : 'Documentos: nenhum',
      v.grupos.length
        ? `Grupos: ${v.grupos.join(', ')}`
        : 'Grupos: nenhum',
      v.lances > 0 ? `Lances/propostas: ${v.lances}` : 'Lances/propostas: nenhum',
      v.cargasVencedor.length
        ? `Cargas como vencedor: ${v.cargasVencedor.join(', ')}`
        : null,
      '',
      'Esta ação não pode ser desfeita.',
    ].filter((x) => x !== null)

    if (!window.confirm(linhas.join('\n'))) return
    const res = excluirTransportador(t.id)
    if (!res.ok) {
      window.alert(res.error ?? 'Falha ao excluir')
    }
  }

  const ficha = fichaId ? transportadores.find((t) => t.id === fichaId) : null
  const fichaHist = fichaId ? historicoDoTransportador(fichaId) : []
  const fichaLances = fichaId ? lances.filter((l) => l.transportador_id === fichaId) : []
  const fichaFretes = fichaId
    ? cargas.filter((c) => c.transportador_vencedor_id === fichaId)
    : []
  const fichaGrupos = fichaId
    ? grupos.filter((g) => g.transportador_ids.includes(fichaId))
    : []
  const ranking = rankingTransportadores()

  function set<K extends keyof Transportador>(key: K, value: Transportador[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function save() {
    if (!form.razao_social?.trim() || !form.nome_fantasia?.trim() || !form.cnpj?.trim()) {
      setError('Preencha Razão Social, Nome Fantasia e CNPJ.')
      return
    }
    const t: Transportador = {
      id: editingId ?? `t-${Math.random().toString(36).slice(2, 8)}`,
      razao_social: form.razao_social!.trim(),
      nome_fantasia: form.nome_fantasia!.trim(),
      cnpj: formatCnpj(form.cnpj ?? ''),
      inscricao_estadual: form.inscricao_estadual,
      inscricao_municipal: form.inscricao_municipal,
      rntrc: form.rntrc,
      cidade: form.cidade ?? '',
      uf: (form.uf ?? 'SP').toUpperCase(),
      endereco: form.endereco,
      numero: form.numero,
      bairro: form.bairro,
      complemento: form.complemento,
      cep: form.cep,
      classificacao: (form.classificacao as ClassificacaoTransportador) ?? 'bronze',
      pontuacao: Number(form.pontuacao) || 0,
      situacao: (form.situacao as SituacaoTransportador) ?? 'ativo',
      telefone: form.telefone,
      email: form.email,
      contato_nome: form.contato_nome,
      contato_telefone: form.contato_telefone,
    }
    salvarTransportador(t)
    setMode('lista')
  }

  async function handleAprovar() {
    if (!revisaoId) return
    setBusy(true)
    const res = await aprovarTransportador(revisaoId)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'Falha ao aprovar.')
      return
    }
    setMode('lista')
    setRevisaoId(null)
  }

  async function handleRecusar() {
    if (!revisaoId) return
    setBusy(true)
    const res = await recusarTransportador(revisaoId, motivoRecusa.trim() || undefined)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'Falha ao recusar.')
      return
    }
    setMode('lista')
    setRevisaoId(null)
  }

  if (mode === 'ficha' && ficha) {
    const pos = ranking.findIndex((t) => t.id === ficha.id) + 1
    return (
      <div className="cadastro-page animate-fade-up">
        <button type="button" className="cadastro-back" onClick={() => setMode('lista')}>
          ← Voltar para Lista
        </button>
        <h1 className="cadastro-page-title">
          Desempenho — {ficha.nome_fantasia}
        </h1>
        <div className="grid gap-4 lg:grid-cols-3 mb-4">
          <div className="rounded-xl border border-ink/10 bg-white p-4">
            <p className="text-xs text-ink-muted">Pontuação / Ranking</p>
            <p className="font-display text-2xl font-bold">
              {ficha.pontuacao} pts · {pos > 0 ? `${pos}º` : '—'}
            </p>
            <p className="text-xs uppercase">{ficha.classificacao}</p>
          </div>
          <div className="rounded-xl border border-ink/10 bg-white p-4">
            <p className="text-xs text-ink-muted">Propostas</p>
            <p className="font-display text-2xl font-bold">{fichaLances.length}</p>
          </div>
          <div className="rounded-xl border border-ink/10 bg-white p-4">
            <p className="text-xs text-ink-muted">Fretes ganhos</p>
            <p className="font-display text-2xl font-bold">
              {cargas.filter((c) => c.transportador_vencedor_id === ficha.id && c.frete_fechado).length}
            </p>
          </div>
        </div>
        <section className="form-card form-card--blue mb-4">
          <header className="form-card__head">
            <h2 className="form-card__title">Grupos</h2>
          </header>
          <div className="form-card__body text-sm">
            {fichaGrupos.length === 0
              ? 'Não participa de grupos.'
              : fichaGrupos.map((g) => g.descricao).join(', ')}
          </div>
        </section>
        <section className="form-card form-card--green mb-4">
          <header className="form-card__head">
            <h2 className="form-card__title">Histórico de propostas / fretes</h2>
          </header>
          <div className="form-card__body">
            <ul className="space-y-1 text-sm">
              {fichaHist.slice(0, 40).map((h) => (
                <li key={h.id} className="border-b border-ink/5 py-1">
                  <strong>{h.titulo}</strong>
                  <span className="ml-2 text-xs text-ink-muted">{h.detalhe}</span>
                </li>
              ))}
              {fichaHist.length === 0 && (
                <li className="text-ink-muted">Sem eventos ainda.</li>
              )}
            </ul>
            {fichaFretes.length > 0 && (
              <p className="mt-3 text-xs text-ink-muted">
                Cargas vinculadas: {fichaFretes.map((c) => c.numero).join(', ')}
              </p>
            )}
          </div>
        </section>
      </div>
    )
  }

  if (mode === 'revisao' && revisao) {
    return (
      <div className="cadastro-page animate-fade-up">
        <button type="button" className="cadastro-back" onClick={() => setMode('lista')}>
          ← Voltar para Lista
        </button>
        <h1 className="cadastro-page-title">
          <IconBuilding />
          Revisar cadastro — {revisao.nome_fantasia}
        </h1>

        <div className="cadastro-grid" style={{ gap: 16 }}>
          <section className="form-card form-card--blue">
            <header className="form-card__head">
              <h2 className="form-card__title">Dados enviados</h2>
            </header>
            <div className="form-card__body">
              <dl className="revisao-dl">
                <div>
                  <dt>Razão social</dt>
                  <dd>{revisao.razao_social}</dd>
                </div>
                <div>
                  <dt>CNPJ</dt>
                  <dd>{revisao.cnpj}</dd>
                </div>
                <div>
                  <dt>RNTRC</dt>
                  <dd>{revisao.rntrc || '—'}</dd>
                </div>
                <div>
                  <dt>Endereço</dt>
                  <dd>
                    {[revisao.endereco, revisao.numero, revisao.bairro, revisao.cidade, revisao.uf]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt>Contato</dt>
                  <dd>
                    {revisao.contato_nome || '—'} · {revisao.telefone || '—'}
                    {revisao.email ? ` · ${revisao.email}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>Situação</dt>
                  <dd>
                    <span className={`badge-situacao badge-situacao--${revisao.situacao}`}>
                      {revisao.situacao}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="form-card form-card--green">
            <header className="form-card__head">
              <h2 className="form-card__title">Documentos anexados</h2>
            </header>
            <div className="form-card__body">
              {docsRevisao.length === 0 ? (
                <p className="cadastro-empty">Nenhum documento anexado.</p>
              ) : (
                <ul className="doc-review-list">
                  {docsRevisao.map((d) => (
                    <li key={d.id}>
                      <strong>{labelDocumento(d.tipo)}</strong>
                      <span>{d.nome_arquivo}</span>
                      <a href={d.url} target="_blank" rel="noreferrer" className="cadastro-link">
                        Abrir
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {revisao.situacao === 'pendente' && (
          <section className="form-card form-card--orange" style={{ marginTop: 16 }}>
            <header className="form-card__head">
              <h2 className="form-card__title">Decisão</h2>
            </header>
            <div className="form-card__body">
              <div className="form-field">
                <label>Motivo da recusa (opcional)</label>
                <input
                  value={motivoRecusa}
                  onChange={(e) => setMotivoRecusa(e.target.value)}
                  placeholder="Informe se for recusar..."
                />
              </div>
              {error && <p style={{ color: '#dc2626', marginTop: 10 }}>{error}</p>}
              <div className="cadastro-actions" style={{ gap: 12 }}>
                <button
                  type="button"
                  className="cadastro-btn cadastro-btn--ghost"
                  disabled={busy}
                  onClick={handleRecusar}
                  style={{ color: '#dc2626' }}
                >
                  Recusar
                </button>
                <button
                  type="button"
                  className="cadastro-btn cadastro-btn--save"
                  disabled={busy}
                  onClick={handleAprovar}
                >
                  {busy ? 'Salvando…' : 'Aprovar e liberar login'}
                </button>
              </div>
            </div>
          </section>
        )}

        {revisao.situacao !== 'pendente' && (
          <div className="cadastro-actions">
            <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={() => openEdit(revisao)}>
              Editar cadastro
            </button>
          </div>
        )}
      </div>
    )
  }

  if (mode === 'lista') {
    return (
      <div className="cadastro-page animate-fade-up">
        <h1 className="cadastro-page-title">
          <IconBuilding />
          Cadastro de Transportadora
        </h1>

        <div className="cadastro-toolbar">
          <input
            className="cadastro-search"
            placeholder="Pesquisar transportadora..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className="cadastro-btn cadastro-btn--primary" onClick={openNew}>
            + Nova Transportadora
          </button>
        </div>

        <div className="cadastro-filtros">
          {(
            [
              ['todos', 'Todos'],
              ['pendente', `Pendentes${pendentesCount ? ` (${pendentesCount})` : ''}`],
              ['ativo', 'Ativos'],
              ['recusado', 'Recusados'],
              ['inativo', 'Inativos'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`cadastro-btn ${filtro === id ? 'cadastro-btn--primary' : 'cadastro-btn--ghost'}`}
              onClick={() => setFiltro(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="cadastro-table-wrap">
          {filtered.length === 0 ? (
            <p className="cadastro-empty">Nenhuma transportadora encontrada.</p>
          ) : (
            <table className="cadastro-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CNPJ</th>
                  <th>Cidade</th>
                  <th>Classificação</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.nome_fantasia}</strong>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{t.razao_social}</div>
                    </td>
                    <td>{t.cnpj}</td>
                    <td>
                      {t.cidade}/{t.uf}
                    </td>
                    <td>{t.classificacao}</td>
                    <td>
                      <span className={`badge-situacao badge-situacao--${t.situacao}`}>
                        {t.situacao}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {(t.situacao === 'pendente' || t.situacao === 'recusado') && (
                        <button type="button" className="cadastro-link" onClick={() => openRevisao(t)}>
                          Revisar
                        </button>
                      )}
                      <button type="button" className="cadastro-link" onClick={() => openFicha(t)}>
                        Desempenho
                      </button>
                      <button type="button" className="cadastro-link" onClick={() => openEdit(t)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="cadastro-link"
                        style={{ color: '#b91c1c' }}
                        onClick={() => confirmarExclusao(t)}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="cadastro-page animate-fade-up">
      <button type="button" className="cadastro-back" onClick={() => setMode('lista')}>
        ← Voltar para Lista
      </button>
      <h1 className="cadastro-page-title">
        <IconBuilding />
        {editingId ? 'Editar Transportadora' : 'Cadastro de Transportadora'}
      </h1>

      <div className="cadastro-grid" style={{ gap: 16 }}>
        <section className="form-card form-card--blue">
          <header className="form-card__head">
            <IconBuilding />
            <h2 className="form-card__title">Dados da Empresa</h2>
          </header>
          <div className="form-card__body">
            <div className="form-fields">
              <Field label="Razão Social" required>
                <input value={form.razao_social ?? ''} onChange={(e) => set('razao_social', e.target.value)} />
              </Field>
              <Field label="Nome Fantasia" required>
                <input value={form.nome_fantasia ?? ''} onChange={(e) => set('nome_fantasia', e.target.value)} />
              </Field>
              <Field label="CNPJ" required>
                <CnpjInput
                  value={form.cnpj ?? ''}
                  onChange={(v) => set('cnpj', formatCnpj(v))}
                />
              </Field>
              <Field label="RNTRC">
                <input value={form.rntrc ?? ''} onChange={(e) => set('rntrc', e.target.value)} />
              </Field>
              <Field label="Inscrição Estadual">
                <input value={form.inscricao_estadual ?? ''} onChange={(e) => set('inscricao_estadual', e.target.value)} />
              </Field>
              <Field label="Inscrição Municipal">
                <input value={form.inscricao_municipal ?? ''} onChange={(e) => set('inscricao_municipal', e.target.value)} />
              </Field>
              <Field label="Classificação">
                <select
                  value={form.classificacao ?? 'bronze'}
                  onChange={(e) => set('classificacao', e.target.value as ClassificacaoTransportador)}
                >
                  <option value="ouro">Ouro</option>
                  <option value="prata">Prata</option>
                  <option value="bronze">Bronze</option>
                </select>
              </Field>
              <Field label="Situação">
                <select
                  value={form.situacao ?? 'ativo'}
                  onChange={(e) => set('situacao', e.target.value as SituacaoTransportador)}
                >
                  <option value="pendente">Pendente</option>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                  <option value="recusado">Recusado</option>
                </select>
              </Field>
              <Field label="Pontuação">
                <input
                  type="number"
                  value={form.pontuacao ?? 0}
                  onChange={(e) => set('pontuacao', Number(e.target.value))}
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="form-card form-card--green">
          <header className="form-card__head">
            <IconPin />
            <h2 className="form-card__title">Endereço</h2>
          </header>
          <div className="form-card__body">
            <div className="form-fields">
              <Field label="CEP">
                <input value={form.cep ?? ''} onChange={(e) => set('cep', e.target.value)} />
              </Field>
              <Field label="Cidade" required>
                <input value={form.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} />
              </Field>
              <Field label="UF" required>
                <input maxLength={2} value={form.uf ?? ''} onChange={(e) => set('uf', e.target.value.toUpperCase())} />
              </Field>
              <Field label="Endereço" className="form-field--span2">
                <input value={form.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} />
              </Field>
              <Field label="Número">
                <input value={form.numero ?? ''} onChange={(e) => set('numero', e.target.value)} />
              </Field>
              <Field label="Bairro">
                <input value={form.bairro ?? ''} onChange={(e) => set('bairro', e.target.value)} />
              </Field>
              <Field label="Complemento" className="form-field--span2">
                <input value={form.complemento ?? ''} onChange={(e) => set('complemento', e.target.value)} />
              </Field>
            </div>
          </div>
        </section>

        <section className="form-card form-card--orange">
          <header className="form-card__head">
            <IconPhone />
            <h2 className="form-card__title">Contato</h2>
          </header>
          <div className="form-card__body">
            <div className="form-fields">
              <Field label="Telefone">
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(00) 00000-0000"
                  value={form.telefone ?? ''}
                  onChange={(e) => set('telefone', formatPhoneBr(e.target.value))}
                />
              </Field>
              <Field label="E-mail">
                <input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label="Nome do Contato">
                <input value={form.contato_nome ?? ''} onChange={(e) => set('contato_nome', e.target.value)} />
              </Field>
              <Field label="Telefone do Contato">
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="(00) 00000-0000"
                  value={form.contato_telefone ?? ''}
                  onChange={(e) => set('contato_telefone', formatPhoneBr(e.target.value))}
                />
              </Field>
            </div>
          </div>
        </section>
      </div>

      {error && <p style={{ color: '#dc2626', marginTop: 12, textAlign: 'center' }}>{error}</p>}

      <div className="cadastro-actions">
        <button type="button" className="cadastro-btn cadastro-btn--save" onClick={save}>
          Salvar Transportadora
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  children,
  className = '',
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`form-field ${className}`.trim()}>
      <label>
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children}
    </div>
  )
}

function IconBuilding() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
      <path d="M4 20V6l8-3 8 3v14M9 20v-6h6v6" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  )
}

function IconPin() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
      <path
        d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4 1.5v3A2 2 0 0 1 18 19 14 14 0 0 1 5 6a2 2 0 0 1 1.5-2.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}
