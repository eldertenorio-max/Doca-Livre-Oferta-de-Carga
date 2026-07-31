import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { canonicalTransportadorId, sameTransportadorId } from '../../lib/transportadorIds'
import type { GrupoTransportador, Transportador } from '../../types'
import { Button, Field, inputClass } from '../../components/ui/Modal'

function nomeFantasiaCadastro(t: Transportador): string {
  return (t.nome_fantasia || t.razao_social || t.cnpj || t.id).trim()
}

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
    nomeFantasiaCadastro(a).localeCompare(nomeFantasiaCadastro(b), 'pt-BR'),
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
  const [aberto, setAberto] = useState(false)
  const [buscaTransp, setBuscaTransp] = useState('')
  const selectRef = useRef<HTMLDivElement>(null)

  const opcoes = useMemo(
    () =>
      dedupeTransportadores(
        transportadores.filter((t) => t.situacao !== 'inativo' && t.situacao !== 'recusado'),
      ),
    [transportadores],
  )

  const opcoesFiltradas = useMemo(() => {
    const q = buscaTransp.trim().toLowerCase()
    if (!q) return opcoes
    return opcoes.filter((t) => nomeFantasiaCadastro(t).toLowerCase().includes(q))
  }, [opcoes, buscaTransp])

  const selecionados = form.transportador_ids ?? []

  const rotuloCampo = useMemo(() => {
    if (selecionados.length === 0) return 'Selecione os transportadores…'
    const nomes = selecionados
      .map((id) => {
        const t = opcoes.find((x) => sameTransportadorId(x.id, id))
        return t ? nomeFantasiaCadastro(t) : null
      })
      .filter(Boolean) as string[]
    if (nomes.length <= 2) return nomes.join(', ')
    return `${nomes.slice(0, 2).join(', ')} +${nomes.length - 2}`
  }, [selecionados, opcoes])

  useEffect(() => {
    if (!aberto) return
    const onDoc = (e: MouseEvent) => {
      if (!selectRef.current?.contains(e.target as Node)) {
        setAberto(false)
        setBuscaTransp('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [aberto])

  function isSelected(id: string) {
    return selecionados.some((x) => sameTransportadorId(x, id))
  }

  function toggleMember(id: string) {
    const ids = form.transportador_ids ?? []
    const canon = canonicalTransportadorId(id) ?? id
    if (isSelected(id)) {
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
    setAberto(false)
    setBuscaTransp('')
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
                return <li key={id}>• {t ? nomeFantasiaCadastro(t) : id}</li>
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
            <div ref={selectRef} className="relative">
              <button
                type="button"
                className={`${inputClass} flex w-full items-center justify-between gap-2 text-left`}
                onClick={() => setAberto((v) => !v)}
                aria-expanded={aberto}
                aria-haspopup="listbox"
              >
                <span
                  className={
                    selecionados.length === 0 ? 'truncate text-ink-muted' : 'truncate text-ink'
                  }
                >
                  {rotuloCampo}
                </span>
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-ink-muted transition ${aberto ? 'rotate-180' : ''}`}
                />
              </button>
              {aberto ? (
                <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-lg border border-ink/15 bg-white shadow-lg">
                  <input
                    className="w-full border-0 border-b border-ink/10 px-3 py-2 text-sm outline-none"
                    value={buscaTransp}
                    onChange={(e) => setBuscaTransp(e.target.value)}
                    placeholder="Digite para filtrar…"
                    autoFocus
                  />
                  <ul
                    className="max-h-56 overflow-y-auto py-1"
                    role="listbox"
                    aria-multiselectable="true"
                  >
                    {opcoesFiltradas.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-ink-muted">
                        Nenhum transportador encontrado.
                      </li>
                    ) : (
                      opcoesFiltradas.map((t) => {
                        const id = canonicalTransportadorId(t.id) ?? t.id
                        const on = isSelected(t.id)
                        return (
                          <li key={id} role="option" aria-selected={on}>
                            <button
                              type="button"
                              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink/5 ${
                                on ? 'bg-ink/5 font-semibold' : ''
                              }`}
                              onClick={() => toggleMember(t.id)}
                            >
                              <span
                                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                                  on
                                    ? 'border-ink bg-ink text-white'
                                    : 'border-ink/30 bg-white text-transparent'
                                }`}
                                aria-hidden
                              >
                                ✓
                              </span>
                              <span className="truncate">{nomeFantasiaCadastro(t)}</span>
                            </button>
                          </li>
                        )
                      })
                    )}
                  </ul>
                </div>
              ) : null}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-muted">
              {selecionados.length} selecionado(s)
            </p>
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
              setAberto(false)
              setBuscaTransp('')
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
