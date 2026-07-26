type StatCard = {
  label: string
  value: number
  accent: string
}

const ACCENTS = {
  ink: 'border-l-[#111]',
  green: 'border-l-emerald-600',
  rose: 'border-l-rose-500',
  blue: 'border-l-sky-600',
  amber: 'border-l-amber-500',
} as const

/** Cards de resumo em listas de cadastro (total / ativos / inativos). */
export function CadastroStatsCards({
  total,
  ativos,
  inativos,
  labels,
  cards: cardsProp,
}: {
  total?: number
  ativos?: number
  inativos?: number
  labels?: { total?: string; ativos?: string; inativos?: string }
  /** Cards customizados (ex.: transportadoras / embarcadores). */
  cards?: Array<{ label: string; value: number; accent?: keyof typeof ACCENTS }>
}) {
  const cards: StatCard[] = cardsProp
    ? cardsProp.map((c) => ({
        label: c.label,
        value: c.value,
        accent: ACCENTS[c.accent ?? 'ink'],
      }))
    : [
        {
          label: labels?.total ?? 'Total cadastrados',
          value: total ?? 0,
          accent: ACCENTS.ink,
        },
        {
          label: labels?.ativos ?? 'Ativos',
          value: ativos ?? 0,
          accent: ACCENTS.green,
        },
        {
          label: labels?.inativos ?? 'Inativos',
          value: inativos ?? 0,
          accent: ACCENTS.rose,
        },
      ]

  const cols =
    cards.length <= 2 ? 'sm:grid-cols-2' : cards.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'

  return (
    <div className={`mb-4 grid gap-3 ${cols}`}>
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
