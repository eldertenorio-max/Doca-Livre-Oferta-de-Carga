import { useState } from 'react'
import { useData } from '../../context/DataContext'
import type { GrupoTransportador } from '../../types'
import { Button, Field, inputClass } from '../../components/ui/Modal'

export function GruposPage() {
  const { grupos, transportadores, salvarGrupo } = useData()
  const [form, setForm] = useState<Partial<GrupoTransportador>>({
    descricao: '',
    situacao: 'ativo',
    observacao: '',
    transportador_ids: [],
  })
  const [editingId, setEditingId] = useState<string | null>(null)

  function toggleMember(id: string) {
    const ids = form.transportador_ids ?? []
    setForm({
      ...form,
      transportador_ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    })
  }

  function save() {
    if (!form.descricao) return
    const g: GrupoTransportador = {
      id: editingId ?? `g-${Math.random().toString(36).slice(2, 8)}`,
      descricao: form.descricao!,
      situacao: (form.situacao as 'ativo' | 'inativo') ?? 'ativo',
      observacao: form.observacao,
      transportador_ids: form.transportador_ids ?? [],
    }
    salvarGrupo(g)
    setEditingId(null)
    setForm({ descricao: '', situacao: 'ativo', observacao: '', transportador_ids: [] })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
      <header>
        <h2 className="font-display text-2xl font-bold">Grupos de Transportadores</h2>
        <p className="text-sm text-ink-muted">
          Na publicação, se nem todos os grupos forem selecionados, os demais são notificados
          automaticamente na metade do prazo.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {grupos.map((g) => (
          <article
            key={g.id}
            className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm"
          >
            <div className="mb-2 flex items-start justify-between">
              <h3 className="font-display font-semibold">{g.descricao}</h3>
              <span className="rounded-full bg-sand-light px-2 py-0.5 text-[10px] font-bold capitalize">
                {g.situacao}
              </span>
            </div>
            <p className="mb-3 text-xs text-ink-muted">{g.observacao || '—'}</p>
            <p className="text-xs font-medium text-ink">
              {g.transportador_ids.length} transportador(es)
            </p>
            <ul className="mt-1 text-xs text-ink-muted">
              {g.transportador_ids.map((id) => {
                const t = transportadores.find((x) => x.id === id)
                return <li key={id}>• {t?.nome_fantasia ?? id}</li>
              })}
            </ul>
            <button
              type="button"
              className="mt-3 text-xs font-semibold text-brand hover:underline"
              onClick={() => {
                setEditingId(g.id)
                setForm(g)
              }}
            >
              Editar
            </button>
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-ink/10 bg-white p-4">
        <h3 className="mb-3 font-display font-semibold">
          {editingId ? 'Editar grupo' : 'Novo grupo'}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Descrição">
            <input
              className={inputClass}
              value={form.descricao ?? ''}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </Field>
          <Field label="Situação">
            <select
              className={inputClass}
              value={form.situacao}
              onChange={(e) =>
                setForm({ ...form, situacao: e.target.value as 'ativo' | 'inativo' })
              }
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </Field>
          <Field label="Observação" className="sm:col-span-2">
            <textarea
              className={`${inputClass} min-h-20`}
              value={form.observacao ?? ''}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </Field>
          <Field label="Transportadores" className="sm:col-span-2">
            <div className="grid gap-1 rounded-lg border border-ink/15 p-3 sm:grid-cols-2">
              {transportadores.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={(form.transportador_ids ?? []).includes(t.id)}
                    onChange={() => toggleMember(t.id)}
                  />
                  {t.nome_fantasia}{' '}
                  <span className="text-xs capitalize text-ink-muted">({t.classificacao})</span>
                </label>
              ))}
            </div>
          </Field>
        </div>
        <Button variant="success" className="mt-4" onClick={save}>
          {editingId ? 'Salvar' : 'Adicionar'}
        </Button>
      </div>
    </div>
  )
}
