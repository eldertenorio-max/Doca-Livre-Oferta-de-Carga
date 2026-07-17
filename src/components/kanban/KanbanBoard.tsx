import type { ReactNode } from 'react'

interface Column {
  key: string
  title: string
  color: string
  description?: string
  items: ReactNode[]
}

export function KanbanBoard({ columns }: { columns: Column[] }) {
  return (
    <div className="flex h-full gap-3 overflow-x-auto pb-2">
      {columns.map((col) => (
        <section
          key={col.key}
          className="flex w-[260px] shrink-0 flex-col rounded-xl border border-ink/10 bg-white/70 backdrop-blur-sm"
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
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
            {col.items.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-ink-muted/70">Nenhuma carga</p>
            ) : (
              col.items
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
