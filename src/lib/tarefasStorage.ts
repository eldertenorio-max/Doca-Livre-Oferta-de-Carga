import type { StatusTarefa, Tarefa } from '../types'

const STORAGE_KEY = 'doca-livre-tarefas-v1'

function loadAll(): Tarefa[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t): t is Tarefa => Boolean(t && typeof t === 'object' && t.id))
  } catch {
    return []
  }
}

function saveAll(list: Tarefa[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export function loadTarefas(transportadorId: string): Tarefa[] {
  if (!transportadorId) return []
  return loadAll()
    .filter((t) => t.transportador_id === transportadorId)
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
}

export function upsertTarefa(tarefa: Tarefa): Tarefa {
  const all = loadAll()
  const idx = all.findIndex((t) => t.id === tarefa.id)
  const salvo: Tarefa = {
    ...tarefa,
    tags: [...(tarefa.tags ?? [])],
    imagens: [...(tarefa.imagens ?? [])].slice(0, 3),
    updated_at: new Date().toISOString(),
  }
  if (idx >= 0) all[idx] = salvo
  else all.unshift(salvo)
  saveAll(all)
  return salvo
}

export function moverTarefa(id: string, status: StatusTarefa): Tarefa | null {
  const all = loadAll()
  const idx = all.findIndex((t) => t.id === id)
  if (idx < 0) return null
  const salvo: Tarefa = {
    ...all[idx],
    status,
    updated_at: new Date().toISOString(),
  }
  all[idx] = salvo
  saveAll(all)
  return salvo
}

export function excluirTarefa(id: string): boolean {
  const all = loadAll()
  const next = all.filter((t) => t.id !== id)
  if (next.length === all.length) return false
  saveAll(next)
  return true
}

export function newTarefaId(): string {
  return `tar-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)}`
}
