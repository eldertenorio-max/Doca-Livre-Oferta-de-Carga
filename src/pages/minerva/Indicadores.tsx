import { useMemo } from 'react'
import { useData } from '../../context/DataContext'
import { formatCurrency } from '../../lib/businessRules'

export function IndicadoresPage() {
  const { cargas, lances, transportadores } = useData()

  const stats = useMemo(() => {
    const publicadas = cargas.filter((c) => c.publicado_em)
    const alocadas = cargas.filter((c) => c.status === 'alocadas')
    const recusadas = cargas.filter((c) => c.status === 'recusadas')
    const emNegocio = cargas.filter((c) =>
      ['negociando', 'propostas'].includes(c.status),
    )
    const totalLances = lances.length
    const freteMedio =
      alocadas.length > 0
        ? alocadas.reduce((s, c) => s + (c.frete_fechado ?? 0), 0) / alocadas.length
        : 0
    const economia =
      alocadas.reduce((s, c) => s + (c.frete_tabela - (c.frete_fechado ?? c.frete_tabela)), 0)

    const porClassificacao = {
      ouro: transportadores.filter((t) => t.classificacao === 'ouro').length,
      prata: transportadores.filter((t) => t.classificacao === 'prata').length,
      bronze: transportadores.filter((t) => t.classificacao === 'bronze').length,
    }

    return {
      publicadas: publicadas.length,
      alocadas: alocadas.length,
      recusadas: recusadas.length,
      emNegocio: emNegocio.length,
      totalLances,
      freteMedio,
      economia,
      visualizacoes: cargas.reduce((s, c) => s + c.visualizacoes, 0),
      porClassificacao,
    }
  }, [cargas, lances, transportadores])

  const cards = [
    { label: 'Cargas publicadas', value: String(stats.publicadas), tone: 'bg-ink' },
    { label: 'Em negociação', value: String(stats.emNegocio), tone: 'bg-blue-600' },
    { label: 'Alocadas', value: String(stats.alocadas), tone: 'bg-emerald-600' },
    { label: 'Recusadas', value: String(stats.recusadas), tone: 'bg-brand' },
    { label: 'Lances recebidos', value: String(stats.totalLances), tone: 'bg-amber-600' },
    { label: 'Visualizações', value: String(stats.visualizacoes), tone: 'bg-ink-muted' },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
      <header>
        <h2 className="font-display text-2xl font-bold">Indicadores</h2>
        <p className="text-sm text-ink-muted">
          Visão consolidada da operação de oferta de cargas e aderência dos transportadores.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`rounded-xl ${c.tone} p-5 text-white shadow-md`}
          >
            <p className="text-xs font-medium text-white/70">{c.label}</p>
            <p className="mt-1 font-display text-3xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-ink/10 bg-white p-5">
          <h3 className="mb-3 font-display font-semibold">Resultado financeiro</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Frete médio alocado</dt>
              <dd className="font-semibold">{formatCurrency(stats.freteMedio)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Economia vs tabela</dt>
              <dd className="font-semibold text-emerald-700">
                {formatCurrency(stats.economia)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-ink/10 bg-white p-5">
          <h3 className="mb-3 font-display font-semibold">Classificação transportadores</h3>
          <div className="flex gap-3">
            {(
              [
                ['ouro', stats.porClassificacao.ouro, 'bg-amber-400'],
                ['prata', stats.porClassificacao.prata, 'bg-slate-300'],
                ['bronze', stats.porClassificacao.bronze, 'bg-orange-700 text-white'],
              ] as const
            ).map(([label, n, cls]) => (
              <div key={label} className={`flex-1 rounded-lg ${cls} p-4 text-center`}>
                <p className="font-display text-2xl font-bold">{n}</p>
                <p className="text-xs font-semibold capitalize">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Pontuação: visualização sem ação −1 · não visualizada −1 · recusa −1 · proposta +2
            · frete fechado +2
          </p>
        </section>
      </div>
    </div>
  )
}
