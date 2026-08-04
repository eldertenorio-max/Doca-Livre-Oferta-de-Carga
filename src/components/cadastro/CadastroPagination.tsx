import { useEffect, useMemo, useState } from 'react'

export const PAGE_SIZE_CADASTRO = 15

export function usePaginatedList<T>(items: T[], pageSize = PAGE_SIZE_CADASTRO) {
  const [page, setPage] = useState(1)
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)

  // Volta à 1ª página quando a lista filtrada muda (busca / filtro)
  const resetKey = useMemo(() => {
    const first = items[0] as { id?: string } | undefined
    const last = items[items.length - 1] as { id?: string } | undefined
    return `${total}|${first?.id ?? ''}|${last?.id ?? ''}`
  }, [items, total])

  useEffect(() => {
    setPage(1)
  }, [resetKey, pageSize])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, page, pageSize])

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return {
    page,
    setPage,
    pageItems,
    total,
    totalPages,
    from,
    to,
    pageSize,
  }
}

type Props = {
  page: number
  totalPages: number
  total: number
  from: number
  to: number
  onPageChange: (page: number) => void
  className?: string
}

export function CadastroPagination({
  page,
  totalPages,
  total,
  from,
  to,
  onPageChange,
  className = '',
}: Props) {
  if (total === 0) return null

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 bg-white px-3 py-2.5 text-xs sm:text-sm ${className}`}
    >
      <p className="font-medium text-ink-muted">
        Mostrando <strong className="text-ink">{from}</strong>–
        <strong className="text-ink">{to}</strong> de{' '}
        <strong className="text-ink">{total}</strong>
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="cadastro-btn cadastro-btn--ghost !px-2.5 !py-1 text-xs disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Página anterior"
        >
          Anterior
        </button>
        <span className="min-w-[4.5rem] text-center font-semibold tabular-nums text-ink">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="cadastro-btn cadastro-btn--ghost !px-2.5 !py-1 text-xs disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Próxima página"
        >
          Próxima
        </button>
      </div>
    </div>
  )
}
