import { useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import { canonicalTransportadorId, sameTransportadorId } from '../../lib/transportadorIds'
import type { GrupoTransportador, Transportador } from '../../types'
import { Button, Field, inputClass } from '../../components/ui/Modal'

function dedupeTransportadores(list: Transportador[]): Transportador[] {
  const map = new Map<string, Transportador>()
  for (const t of list) {
    const key = canonicalTransportadorId(t.id) ?? t.id
    const prev = map.get(key)
    if (!prev) {
      map.set(key, t)
      continue
    }
    // Prefere UUID canônico / registro ativo
    if (t.id === key || (prev.situacao !== 'ativo' && t.situacao === 'ativo')) {
      map.set(key, t)
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.nome_fantasia.localeCompare(b.nome_fantasia, 'pt-BR'),
  )
}

export function GruposPage() {
  const { grupos, transportadores, salvarGrupo } = useData()
  const [form, setForm] = useState<Partial<GrupoTransportador>>({
    descricao: '',
    situacao: 'ativo',
    observacao: '',
    transportador_ids: [],
  })
  const [editingId, setEditingId] = useState<string | null>(null)

  const opcoes = useMemo(
    () =>
      dedupeTransportadores(
        transportadores.filter((t) => t.situacao !== 'inativo' && t.situacao !== 'recusado'),
      ),
    [transportadores],
  )

  function isSelected(id: string) {
    return (form.transportador_ids ?? []).some((x) => sameTransportadorId(x, id))
  }

  function toggleMember(id: string) {
    const ids = form.transportador_ids ?? []
    const canon = canonicalTransportadorId(id) ?? id
    if (isSelected(id)) {
      // Remove todas as formas do mesmo transportador (legado t1 + UUID)
      setForm({
        ...form,
        transportador_ids: ids.filter((x) => !sameTransportadorId(x, id)),
      })
      return
    }
    setForm({
      ...form,
      transportador_ids: [...ids.filter((x) => !sameTransportadorId(x, id)), canon],
    })
  }

  function save() {
    if (!form.descricao) return
    const g: GrupoTransportador = {
      id: editingId ?? `g-${Math.random().toString(36).slice(2, 8)}`,
      descricao: form.descricao!,
      situacao: (form.situacao as 'ativo' | 'inativo') ?? 'ativo',
      observacao: form.observacao,
      transportador_ids: Array.from(
        new Set(
          (form.transportador_ids ?? [])
            .map((id) => canonicalTransportadorId(id) ?? id)
            .filter(Boolean),
        ),
      ),
    }
    salvarGrupo(g)
    setEditingId(null)
    setForm({ descricao: '', situacao: 'ativo', observacao: '', transportador_ids: [] })
  }

  return (
    <div className="w-full space-y-6 animate-fade-up">
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
                const t = transportadores.find((x) => sameTransportadorId(x.id, id))
                return <li key={id}>• {t?.nome_fantasia ?? id}</li>
              })}
            </ul>
            <button
              type="button"
              className="mt-3 text-xs font-semibold text-black hover:underline"
              onClick={() => {
                setEditingId(g.id)
                setForm({
                  ...g,
                  transportador_ids: Array.from(
                    new Set(
                      (g.transportador_ids ?? [])
                        .map((id) => canonicalTransportadorId(id) ?? id)
                        .filter(Boolean),
                    ),
                  ),
                })
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
          <Field label="Transportadores do grupo" className="sm:col-span-2">
            <p className="mb-2 text-[11px] text-ink-muted">
              Marque quem entra neste grupo. O rótulo entre parênteses (ouro/prata/bronze) é a
              classificação por pontuação — não é o grupo.
            </p>
            <div className="grid gap-1 rounded-lg border border-ink/15 p-3 sm:grid-cols-2">
              {opcoes.map((t) => (
                <label key={canonicalTransportadorId(t.id) ?? t.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isSelected(t.id)}
                    onChange={() => toggleMember(t.id)}
                  />
                  {t.nome_fantasia}{' '}
                  <span className="text-xs capitalize text-ink-muted">
                    (classificação: {t.classificacao})
                  </span>
                </label>
              ))}
            </div>
          </Field>
        </div>
        <Button variant="success" className="mt-4" onClick={save}>
          {editingId ? 'Salvar grupo' : 'Adicionar grupo'}
        </Button>
        {editingId ? (
          <button
            type="button"
            className="ml-3 mt-4 text-xs font-semibold text-ink-muted hover:underline"
            onClick={() => {
              setEditingId(null)
              setForm({ descricao: '', situacao: 'ativo', observacao: '', transportador_ids: [] })
            }}
          >
            Cancelar edição
          </button>
        ) : null}
      </div>
    </div>
  )
}
