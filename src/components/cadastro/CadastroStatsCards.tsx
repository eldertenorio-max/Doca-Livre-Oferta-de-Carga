type StatCard = {
  label: string
  value: number
  accent: string
}

/** Cards de resumo em listas de cadastro (total / ativos / inativos). */
export function CadastroStatsCards({
  total,
  ativos,
  inativos,
  labels,
}: {
  total: number
  ativos: number
  inativos: number
  labels?: { total?: string; ativos?: string; inativos?: string }
}) {
  const cards: StatCard[] = [
    {
      label: labels?.total ?? 'Total cadastrados',
      value: total,
      accent: 'border-l-[#111]',
    },
    {
      label: labels?.ativos ?? 'Ativos',
      value: ativos,
      accent: 'border-l-emerald-600',
    },
    {
      label: labels?.inativos ?? 'Inativos',
      value: inativos,
      accent: 'border-l-rose-500',
    },
  ]

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-xl border border-ink/10 border-l-4 bg-white px-4 py-3 shadow-sm ${c.accent}`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {c.label}
          </p>
          <p className="mt-1 font-display text-3xl font-bold tabular-nums text-ink">{c.value}</p>
        </div>
      ))}
    </div>
  )
}
