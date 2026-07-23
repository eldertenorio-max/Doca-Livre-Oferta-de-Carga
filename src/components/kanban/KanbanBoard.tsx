import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface KanbanItem {
  id: string
  node: ReactNode
}

interface Column {
  key: string
  title: string
  color: string
  description?: string
  items: KanbanItem[]
}

interface KanbanBoardProps {
  columns: Column[]
  /** Quando definido, habilita arrastar cards entre colunas */
  onCardDrop?: (cardId: string, fromColumn: string, toColumn: string) => void
  /** Chave localStorage para lembrar colunas minimizadas (por Kanban) */
  storageKey?: string
}

type DragPayload = { cardId: string; fromColumn: string }

const DEFAULT_STORAGE_KEY = 'doca-livre-kanban-collapsed-v1'

function loadCollapsed(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((k): k is string => typeof k === 'string'))
  } catch {
    return new Set()
  }
}

function saveCollapsed(storageKey: string, keys: Set<string>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...keys]))
  } catch {
    /* ignore */
  }
}

export function KanbanBoard({
  columns,
  onCardDrop,
  storageKey = DEFAULT_STORAGE_KEY,
}: KanbanBoardProps) {
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadCollapsed(storageKey))

  useEffect(() => {
    setCollapsed(loadCollapsed(storageKey))
  }, [storageKey])

  const dndEnabled = Boolean(onCardDrop)

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveCollapsed(storageKey, next)
      return next
    })
  }

  function parsePayload(e: React.DragEvent): DragPayload | null {
    try {
      const raw = e.dataTransfer.getData('application/x-kanban-card')
      if (!raw) return null
      return JSON.parse(raw) as DragPayload
    } catch {
      return null
    }
  }

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-x-auto overflow-y-hidden pb-2 [-webkit-overflow-scrolling:touch]">
      {columns.map((col) => {
        const isOver = dragOverKey === col.key
        const isCollapsed = collapsed.has(col.key)

        if (isCollapsed) {
          return (
            <section
              key={col.key}
              className={`flex w-11 shrink-0 flex-col overflow-hidden rounded-xl border transition-all duration-200 ${
                isOver
                  ? 'border-brand ring-2 ring-brand/50 bg-brand/5'
                  : 'border-ink/10 bg-white/70'
              }`}
              onDragOver={(e) => {
                if (!dndEnabled) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOverKey(col.key)
              }}
              onDragLeave={(e) => {
                if (!dndEnabled) return
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverKey((k) => (k === col.key ? null : k))
                }
              }}
              onDrop={(e) => {
                if (!dndEnabled || !onCardDrop) return
                e.preventDefault()
                setDragOverKey(null)
                setDraggingId(null)
                const payload = parsePayload(e)
                if (!payload?.cardId) return
                if (payload.fromColumn === col.key) return
                onCardDrop(payload.cardId, payload.fromColumn, col.key)
              }}
            >
              <button
                type="button"
                onClick={() => toggleCollapsed(col.key)}
                title={`Expandir ${col.title}`}
                className="flex h-full min-h-[12rem] w-full flex-col items-center gap-2 px-1 py-2 text-white transition hover:brightness-110"
                style={{ backgroundColor: col.color }}
              >
                <ChevronRight size={16} strokeWidth={2.5} className="shrink-0" />
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
                  {col.items.length}
                </span>
                <span
                  className="mt-1 max-h-full flex-1 origin-center font-display text-[10px] font-bold tracking-wide uppercase"
                  style={{
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                  }}
                >
                  {col.title}
                </span>
              </button>
            </section>
          )
        }

        return (
          <section
            key={col.key}
            className={`flex w-[min(280px,calc(100vw-5.75rem))] shrink-0 flex-col rounded-xl border bg-white/70 backdrop-blur-sm transition-all duration-200 ${
              isOver
                ? 'border-brand ring-2 ring-brand/50 bg-brand/5'
                : 'border-ink/10'
            }`}
            onDragOver={(e) => {
              if (!dndEnabled) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDragOverKey(col.key)
            }}
            onDragLeave={(e) => {
              if (!dndEnabled) return
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverKey((k) => (k === col.key ? null : k))
              }
            }}
            onDrop={(e) => {
              if (!dndEnabled || !onCardDrop) return
              e.preventDefault()
              setDragOverKey(null)
              setDraggingId(null)
              const payload = parsePayload(e)
              if (!payload?.cardId) return
              if (payload.fromColumn === col.key) return
              onCardDrop(payload.cardId, payload.fromColumn, col.key)
            }}
          >
            <header
              className="rounded-t-xl px-3 py-2.5 text-white"
              style={{ backgroundColor: col.color }}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="min-w-0 flex-1 truncate font-display text-xs font-bold tracking-wide uppercase">
                  {col.title}
                </h2>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
                    {col.items.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(col.key)}
                    title={`Minimizar ${col.title}`}
                    className="rounded-md p-1 text-white/90 transition hover:bg-white/15 hover:text-white"
                    aria-label={`Minimizar coluna ${col.title}`}
                  >
                    <ChevronLeft size={16} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              {col.description && (
                <p className="mt-1 text-[10px] leading-snug text-white/85">{col.description}</p>
              )}
            </header>
            <div
              className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors ${
                isOver ? 'bg-brand/10' : ''
              }`}
            >
              {col.items.length === 0 ? (
                <p
                  className={`px-2 py-6 text-center text-xs ${
                    isOver ? 'font-semibold text-ink' : 'text-ink-muted/70'
                  }`}
                >
                  {isOver ? 'Solte o card aqui' : 'Nenhuma carga'}
                </p>
              ) : (
                col.items.map((item) => (
                  <div
                    key={item.id}
                    draggable={dndEnabled}
                    onDragStart={(e) => {
                      if (!dndEnabled) return
                      const payload: DragPayload = {
                        cardId: item.id,
                        fromColumn: col.key,
                      }
                      e.dataTransfer.setData(
                        'application/x-kanban-card',
                        JSON.stringify(payload),
                      )
                      e.dataTransfer.setData('text/plain', item.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setDraggingId(item.id)
                      // evita abrir o painel ao soltar
                      e.dataTransfer.setDragImage(
                        e.currentTarget,
                        e.currentTarget.clientWidth / 2,
                        20,
                      )
                    }}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setDragOverKey(null)
                    }}
                    className={`kanban-drag-item ${
                      dndEnabled ? 'cursor-grab active:cursor-grabbing' : ''
                    } ${draggingId === item.id ? 'opacity-40 scale-[0.98]' : ''} transition-all`}
                  >
                    {item.node}
                  </div>
                ))
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
