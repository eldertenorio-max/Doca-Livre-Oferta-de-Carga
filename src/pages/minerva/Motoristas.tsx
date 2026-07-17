import { useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import { inputClass } from '../../components/ui/Modal'
import type { Motorista } from '../../types'
import '../../styles/cadastro.css'

const emptyForm = (): Partial<Motorista> => ({
  nome: '',
  transportador_id: '',
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
  const listaTransportadores = transportadores ?? []

  const scoped = useMemo(() => {
    if (user?.role === 'transportador' && user.transportador_id) {
      return lista.filter((m) => m.transportador_id === user.transportador_id)
    }
    return lista
  }, [lista, user])

  const scopedTransportadores = useMemo(() => {
    if (user?.role === 'transportador' && user.transportador_id) {
      return listaTransportadores.filter((t) => t.id === user.transportador_id)
    }
    return listaTransportadores
  }, [listaTransportadores, user])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return scoped
    return scoped.filter((m) => {
      const emp = transportadorById(m.transportador_id)?.nome_fantasia ?? ''
      return (
        m.nome.toLowerCase().includes(q) ||
        (m.cpf ?? '').includes(q) ||
        (m.cnh ?? '').includes(q) ||
        emp.toLowerCase().includes(q)
      )
    })
  }, [scoped, search, transportadorById])

  function openNew() {
    setEditingId(null)
    setForm({
      ...emptyForm(),
      transportador_id:
        user?.role === 'transportador' && user.transportador_id
          ? user.transportador_id
          : scopedTransportadores[0]?.id ?? '',
    })
    setError('')
    setMode('form')
  }

  function openEdit(m: Motorista) {
    setEditingId(m.id)
    setForm({ ...m })
    setError('')
    setMode('form')
  }

  function set<K extends keyof Motorista>(key: K, value: Motorista[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function save() {
    if (!form.nome?.trim()) {
      setError('Informe o nome do motorista.')
      return
    }
    if (!form.transportador_id) {
      setError('Selecione a transportadora.')
      return
    }
    const now = new Date().toISOString()
    salvarMotorista({
      id: editingId ?? `m-${Date.now()}`,
      transportador_id: form.transportador_id,
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
                Cadastro de condutores para alocação por composição.
              </p>
            </div>
            <button type="button" className="cadastro-btn cadastro-btn--primary" onClick={openNew}>
              Novo motorista
            </button>
          </header>

          <input
            className="cadastro-search mb-3 max-w-md"
            placeholder="Buscar por nome, CPF, CNH ou transportadora…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs text-ink-muted">
                  <th className="p-3">Nome</th>
                  <th className="p-3">Transportadora</th>
                  <th className="p-3">CNH</th>
                  <th className="p-3">Telefone</th>
                  <th className="p-3">Situação</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className="border-b border-ink/5">
                    <td className="p-3 font-medium">{m.nome}</td>
                    <td className="p-3">
                      {transportadorById(m.transportador_id)?.nome_fantasia ?? '—'}
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
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-ink-muted">
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
          </header>

          <div className="max-w-xl space-y-3 rounded-xl border border-ink/10 bg-white p-4">
            {user?.role !== 'transportador' && (
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-ink-muted">
                  Transportadora
                </span>
                <select
                  className={inputClass}
                  value={form.transportador_id ?? ''}
                  onChange={(e) => set('transportador_id', e.target.value)}
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
                <input
                  className={inputClass}
                  value={form.categoria_cnh ?? ''}
                  onChange={(e) => set('categoria_cnh', e.target.value)}
                />
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
