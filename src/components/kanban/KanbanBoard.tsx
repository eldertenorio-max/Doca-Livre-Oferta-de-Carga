import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import '../../styles/kanban-board.css'

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
  /** Texto quando a coluna está vazia */
  emptyLabel?: string
}

type DragPayload = { cardId: string; fromColumn: string }

const DEFAULT_STORAGE_KEY = 'doca-livre-kanban-collapsed-v1'
const TOTAL_KEY = 'todas'

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
  emptyLabel = 'Nenhuma carga',
}: KanbanBoardProps) {
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadCollapsed(storageKey))
  const [filtro, setFiltro] = useState<string>(TOTAL_KEY)

  useEffect(() => {
    setCollapsed(loadCollapsed(storageKey))
  }, [storageKey])

  const dndEnabled = Boolean(onCardDrop)

  const totalItems = useMemo(
    () => columns.reduce((acc, c) => acc + c.items.length, 0),
    [columns],
  )

  const colunasVisiveis = useMemo(() => {
    if (filtro === TOTAL_KEY) return columns
    return columns.filter((c) => c.key === filtro)
  }, [columns, filtro])

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

  function bindDropZone(colKey: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!dndEnabled) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOverKey(colKey)
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!dndEnabled) return
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOverKey((k) => (k === colKey ? null : k))
        }
      },
      onDrop: (e: React.DragEvent) => {
        if (!dndEnabled || !onCardDrop) return
        e.preventDefault()
        setDragOverKey(null)
        setDraggingId(null)
        const payload = parsePayload(e)
        if (!payload?.cardId) return
        if (payload.fromColumn === colKey) return
        onCardDrop(payload.cardId, payload.fromColumn, colKey)
      },
    }
  }

  return (
    <div className="kanban-board">
      <div className="kanban-board__metrics" role="toolbar" aria-label="Resumo por status">
        <button
          type="button"
          className={`kanban-board__metric${filtro === TOTAL_KEY ? ' is-active' : ''}`}
          style={{ ['--metric-color' as string]: '#3b82f6' }}
          onClick={() => setFiltro(TOTAL_KEY)}
        >
          <span className="kanban-board__metric-label">Total</span>
          <span className="kanban-board__metric-value">{totalItems}</span>
        </button>
        {columns.map((col) => (
          <button
            key={col.key}
            type="button"
            className={`kanban-board__metric${filtro === col.key ? ' is-active' : ''}`}
            style={{ ['--metric-color' as string]: col.color }}
            onClick={() => setFiltro(col.key)}
          >
            <span className="kanban-board__metric-label">{col.title}</span>
            <span className="kanban-board__metric-value">{col.items.length}</span>
          </button>
        ))}
      </div>

      <div className="kanban-board__cols">
        {colunasVisiveis.map((col) => {
          const isOver = dragOverKey === col.key
          const isCollapsed = filtro === TOTAL_KEY && collapsed.has(col.key)
          const drop = bindDropZone(col.key)

          if (isCollapsed) {
            return (
              <section
                key={col.key}
                className={`kanban-col kanban-col--collapsed${isOver ? ' is-over' : ''}`}
                style={{ ['--col-color' as string]: col.color }}
                {...drop}
              >
                <button
                  type="button"
                  className="kanban-col__expand"
                  onClick={() => toggleCollapsed(col.key)}
                  title={`Expandir ${col.title}`}
                >
                  <ChevronRight size={16} strokeWidth={2.5} className="shrink-0 text-ink-muted" />
                  <span className="kanban-col__expand-count">{col.items.length}</span>
                  <span className="kanban-col__expand-title">{col.title}</span>
                </button>
              </section>
            )
          }

          return (
            <section
              key={col.key}
              className={`kanban-col${isOver ? ' is-over' : ''}${
                colunasVisiveis.length === 1 ? ' kanban-col--solo' : ''
              }`}
              style={{ ['--col-color' as string]: col.color }}
              {...drop}
            >
              <header className="kanban-col__head">
                <h2 className="kanban-col__title">{col.title}</h2>
                <span className="kanban-col__count">{col.items.length}</span>
                {filtro === TOTAL_KEY ? (
                  <button
                    type="button"
                    className="kanban-col__collapse"
                    onClick={() => toggleCollapsed(col.key)}
                    title={`Minimizar ${col.title}`}
                    aria-label={`Minimizar coluna ${col.title}`}
                  >
                    <ChevronLeft size={16} strokeWidth={2.5} />
                  </button>
                ) : null}
              </header>
              {col.description ? <p className="kanban-col__desc">{col.description}</p> : null}
              <div className={`kanban-col__body${isOver ? ' is-over' : ''}`}>
                {col.items.length === 0 ? (
                  <p className={`kanban-col__empty${isOver ? ' is-drop' : ''}`}>
                    {isOver ? 'Solte o card aqui' : emptyLabel}
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
    </div>
  )
}
