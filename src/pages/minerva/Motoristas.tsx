import { useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import { CadastroStatsCards } from '../../components/cadastro/CadastroStatsCards'
import { inputClass } from '../../components/ui/Modal'
import type { Motorista } from '../../types'
import '../../styles/cadastro.css'

/** Categorias oficiais de CNH (ordem de exibição). Sem A (só moto). */
const CATEGORIAS_CNH = ['B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const

const emptyForm = (): Partial<Motorista> => ({
  nome: '',
  transportador_id: '',
  veiculo_id: '',
  autonomo: false,
  cpf: '',
  cnh: '',
  categoria_cnh: 'E',
  validade_cnh: '',
  telefone: '',
  situacao: 'ativo',
})

export function MotoristasPage() {
  const {
    motoristas,
    veiculos,
    transportadores,
    salvarMotorista,
    excluirMotorista,
    transportadorById,
    user,
  } = useData()
  const [mode, setMode] = useState<'lista' | 'form'>('lista')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Motorista>>(emptyForm)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const lista = motoristas ?? []
  const listaVeiculos = veiculos ?? []
  const listaTransportadores = transportadores ?? []
  const isTransportador = user?.role === 'transportador' && Boolean(user.transportador_id)

  const scoped = useMemo(() => {
    if (isTransportador && user?.transportador_id) {
      return lista.filter(
        (m) => m.transportador_id === user.transportador_id || m.autonomo === false,
      ).filter((m) => m.transportador_id === user.transportador_id)
    }
    return lista
  }, [lista, user, isTransportador])

  const scopedTransportadores = useMemo(() => {
    if (isTransportador && user?.transportador_id) {
      return listaTransportadores.filter((t) => t.id === user.transportador_id)
    }
    return listaTransportadores.filter((t) => t.situacao === 'ativo' || t.situacao === 'pendente')
  }, [listaTransportadores, user, isTransportador])

  const veiculosDisponiveis = useMemo(() => {
    if (form.autonomo) {
      return listaVeiculos.filter(
        (v) =>
          v.situacao === 'ativo' &&
          (v.transportador_id == null ||
            v.id === form.veiculo_id ||
            !lista.some((m) => m.veiculo_id === v.id && m.id !== editingId && !m.autonomo)),
      )
    }
    const tid = form.transportador_id
    if (!tid) return []
    return listaVeiculos.filter(
      (v) =>
        v.situacao === 'ativo' &&
        (v.transportador_id === tid || v.id === form.veiculo_id),
    )
  }, [form.autonomo, form.transportador_id, form.veiculo_id, listaVeiculos, lista, editingId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return scoped
    return scoped.filter((m) => {
      const emp = m.autonomo
        ? 'autônomo'
        : (transportadorById(m.transportador_id ?? '')?.nome_fantasia ?? '')
      const placa = listaVeiculos.find((v) => v.id === m.veiculo_id)?.placa ?? ''
      return (
        m.nome.toLowerCase().includes(q) ||
        (m.cpf ?? '').includes(q) ||
        (m.cnh ?? '').includes(q) ||
        emp.toLowerCase().includes(q) ||
        placa.toLowerCase().includes(q)
      )
    })
  }, [scoped, search, transportadorById, listaVeiculos])

  const statsCadastro = useMemo(() => {
    const total = scoped.length
    const ativos = scoped.filter((m) => m.situacao === 'ativo').length
    const inativos = scoped.filter((m) => m.situacao === 'inativo').length
    return { total, ativos, inativos }
  }, [scoped])

  /** Quantidade por categoria de habilitação (CNH). */
  const porCategoria = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of CATEGORIAS_CNH) map.set(c, 0)
    for (const m of scoped) {
      const cat = (m.categoria_cnh || '').trim().toUpperCase() || '—'
      map.set(cat, (map.get(cat) ?? 0) + 1)
    }
    const catalog = CATEGORIAS_CNH.map((cat) => ({ cat, qtd: map.get(cat) ?? 0 }))
    const extras = [...map.entries()]
      .filter(([cat]) => !(CATEGORIAS_CNH as readonly string[]).includes(cat))
      .map(([cat, qtd]) => ({ cat, qtd }))
      .sort((a, b) => b.qtd - a.qtd || a.cat.localeCompare(b.cat))
    return [...catalog, ...extras]
  }, [scoped])

  function openNew() {
    setEditingId(null)
    setForm({
      ...emptyForm(),
      transportador_id: isTransportador ? user!.transportador_id! : '',
      autonomo: false,
    })
    setError('')
    setMode('form')
  }

  function openEdit(m: Motorista) {
    setEditingId(m.id)
    setForm({
      ...m,
      transportador_id: m.transportador_id ?? '',
      veiculo_id: m.veiculo_id ?? '',
    })
    setError('')
    setMode('form')
  }

  function set<K extends keyof Motorista>(key: K, value: Motorista[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function setAutonomo(checked: boolean) {
    setForm((prev) => ({
      ...prev,
      autonomo: checked,
      transportador_id: checked ? null : prev.transportador_id || '',
      veiculo_id: '',
    }))
  }

  function save() {
    if (!form.nome?.trim()) {
      setError('Informe o nome do motorista.')
      return
    }
    if (!form.veiculo_id) {
      setError('Vincule uma placa (veículo) ao motorista.')
      return
    }
    if (!form.autonomo && !form.transportador_id) {
      setError('Selecione a transportadora ou marque Motorista autônomo.')
      return
    }
    const veiculo = listaVeiculos.find((v) => v.id === form.veiculo_id)
    if (!veiculo) {
      setError('Veículo selecionado não encontrado.')
      return
    }
    if (!form.autonomo && veiculo.transportador_id && veiculo.transportador_id !== form.transportador_id) {
      setError('A placa selecionada pertence a outra transportadora.')
      return
    }

    const now = new Date().toISOString()
    salvarMotorista({
      id: editingId ?? `m-${Date.now()}`,
      transportador_id: form.autonomo ? null : (form.transportador_id as string),
      veiculo_id: form.veiculo_id as string,
      autonomo: Boolean(form.autonomo),
      nome: form.nome.trim(),
      cpf: form.cpf?.trim() || undefined,
      cnh: form.cnh?.trim() || undefined,
      categoria_cnh: form.categoria_cnh?.trim() || undefined,
      validade_cnh: form.validade_cnh || undefined,
      telefone: form.telefone?.trim() || undefined,
      situacao: form.situacao ?? 'ativo',
      created_at: form.created_at ?? now,
    })
    setMode('lista')
  }

  return (
    <div className="cadastro-page animate-fade-up">
      {mode === 'lista' ? (
        <>
          <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="cadastro-page-title">Motoristas</h1>
              <p className="text-sm text-ink-muted">
                Vincule motorista + placa + transportadora (ou autônomo).
              </p>
            </div>
            <button type="button" className="cadastro-btn cadastro-btn--primary" onClick={openNew}>
              Novo motorista
            </button>
          </header>

          <CadastroStatsCards
            total={statsCadastro.total}
            ativos={statsCadastro.ativos}
            inativos={statsCadastro.inativos}
          />

          <section className="mb-3 rounded-xl border border-ink/10 bg-white p-3 shadow-sm">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Por categoria de habilitação
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {porCategoria.map((p) => (
                <span
                  key={p.cat}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
                    p.qtd > 0
                      ? 'border-ink/15 bg-sand-light/70 text-ink'
                      : 'border-ink/5 bg-white text-ink-muted'
                  }`}
                  title={`${p.qtd} motorista(s) categoria ${p.cat}`}
                >
                  <span className="font-medium text-ink-muted">Cat. {p.cat}</span>
                  <strong className="tabular-nums font-bold">{p.qtd}</strong>
                </span>
              ))}
            </div>
          </section>

          <input
            className="cadastro-search mb-3 max-w-md"
            placeholder="Buscar por nome, CPF, CNH, placa ou transportadora…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs text-ink-muted">
                  <th className="p-3">Nome</th>
                  <th className="p-3">Placa</th>
                  <th className="p-3">Transportadora</th>
                  <th className="p-3">CNH</th>
                  <th className="p-3">Telefone</th>
                  <th className="p-3">Situação</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const placa = listaVeiculos.find((v) => v.id === m.veiculo_id)?.placa
                  return (
                    <tr key={m.id} className="border-b border-ink/5">
                      <td className="p-3 font-medium">{m.nome}</td>
                      <td className="p-3 font-semibold tabular-nums">{placa ?? '—'}</td>
                      <td className="p-3">
                        {m.autonomo
                          ? 'Motorista autônomo'
                          : (transportadorById(m.transportador_id ?? '')?.nome_fantasia ?? '—')}
                      </td>
                      <td className="p-3">
                        {m.cnh ?? '—'}
                        {m.categoria_cnh ? ` (${m.categoria_cnh})` : ''}
                      </td>
                      <td className="p-3">{m.telefone ?? '—'}</td>
                      <td className="p-3 capitalize">{m.situacao}</td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          type="button"
                          className="text-xs font-bold text-brand hover:underline"
                          onClick={() => openEdit(m)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="text-xs font-bold text-ink-muted hover:underline"
                          onClick={() => {
                            if (window.confirm('Excluir este motorista?')) excluirMotorista(m.id)
                          }}
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-ink-muted">
                      Nenhum motorista cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <header className="mb-4">
            <h1 className="cadastro-page-title">
              {editingId ? 'Editar motorista' : 'Novo motorista'}
            </h1>
            <p className="text-sm text-ink-muted">
              Os três devem ficar vinculados: motorista, placa e transportadora — ou motorista
              autônomo com placa.
            </p>
          </header>

          <div className="max-w-xl space-y-3 rounded-xl border border-ink/10 bg-white p-4">
            {!isTransportador && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(form.autonomo)}
                  onChange={(e) => setAutonomo(e.target.checked)}
                />
                Motorista autônomo (sem transportadora)
              </label>
            )}

            {!form.autonomo && (
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-ink-muted">
                  Transportadora
                </span>
                <select
                  className={inputClass}
                  value={form.transportador_id ?? ''}
                  disabled={isTransportador}
                  onChange={(e) => {
                    set('transportador_id', e.target.value)
                    set('veiculo_id', null)
                  }}
                >
                  <option value="">Selecione…</option>
                  {scopedTransportadores.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome_fantasia}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-ink-muted">
                Placa / veículo vinculado
              </span>
              <select
                className={inputClass}
                value={form.veiculo_id ?? ''}
                onChange={(e) => set('veiculo_id', e.target.value || null)}
                disabled={!form.autonomo && !form.transportador_id}
              >
                <option value="">
                  {form.autonomo || form.transportador_id
                    ? 'Selecione a placa…'
                    : 'Selecione a transportadora primeiro…'}
                </option>
                {veiculosDisponiveis.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa}
                    {v.tipo ? ` — ${v.tipo}` : ''}
                    {v.transportador_id == null ? ' (sem transportadora)' : ''}
                  </option>
                ))}
              </select>
              {form.autonomo && (
                <p className="mt-1 text-[11px] text-ink-muted">
                  Cadastre o veículo em Veículos sem empresa, ou use uma placa sem transportadora.
                </p>
              )}
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-ink-muted">Nome</span>
              <input
                className={inputClass}
                value={form.nome ?? ''}
                onChange={(e) => set('nome', e.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-ink-muted">CPF</span>
                <input
                  className={inputClass}
                  value={form.cpf ?? ''}
                  onChange={(e) => set('cpf', e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-ink-muted">Telefone</span>
                <input
                  className={inputClass}
                  value={form.telefone ?? ''}
                  onChange={(e) => set('telefone', e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-ink-muted">CNH</span>
                <input
                  className={inputClass}
                  value={form.cnh ?? ''}
                  onChange={(e) => set('cnh', e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-ink-muted">Categoria</span>
                <select
                  className={inputClass}
                  value={form.categoria_cnh ?? ''}
                  onChange={(e) => set('categoria_cnh', e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {CATEGORIAS_CNH.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-ink-muted">
                  Validade CNH
                </span>
                <input
                  type="date"
                  className={inputClass}
                  value={form.validade_cnh ?? ''}
                  onChange={(e) => set('validade_cnh', e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-ink-muted">Situação</span>
                <select
                  className={inputClass}
                  value={form.situacao ?? 'ativo'}
                  onChange={(e) => set('situacao', e.target.value as Motorista['situacao'])}
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
            </div>

            {error && <p className="text-sm text-brand">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button type="button" className="cadastro-btn cadastro-btn--save" onClick={save}>
                Salvar
              </button>
              <button
                type="button"
                className="cadastro-btn cadastro-btn--ghost"
                onClick={() => setMode('lista')}
              >
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
