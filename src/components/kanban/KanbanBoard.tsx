import { useState, type ReactNode } from 'react'

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
}

type DragPayload = { cardId: string; fromColumn: string }

export function KanbanBoard({ columns, onCardDrop }: KanbanBoardProps) {
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const dndEnabled = Boolean(onCardDrop)

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
    <div className="flex h-full gap-3 overflow-x-auto pb-2">
      {columns.map((col) => {
        const isOver = dragOverKey === col.key
        return (
          <section
            key={col.key}
            className={`flex w-[280px] shrink-0 flex-col rounded-xl border bg-white/70 backdrop-blur-sm transition-all duration-200 ${
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
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xs font-bold tracking-wide uppercase">
                  {col.title}
                </h2>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
                  {col.items.length}
                </span>
              </div>
              {col.description && (
                <p className="mt-1 text-[10px] leading-snug text-white/85">{col.description}</p>
              )}
            </header>
            <div
              className={`flex flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors ${
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
