import { useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import { formatCurrency } from '../../lib/businessRules'
import { downloadCsv } from '../../lib/exportCsv'

function startOfDay(iso: string) {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function endOfDay(iso: string) {
  const d = new Date(iso)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

function toInputDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function pct(num: number, den: number) {
  if (den <= 0) return 0
  return (num / den) * 100
}

function formatPct(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '—'
  return `${n.toFixed(0)}%`
}

type PeriodoRapido = 'hoje' | '7d' | '30d' | 'tudo'

export function IndicadoresPage() {
  const { cargas, lances, transportadores, rankingTransportadores, historico, integracoes } =
    useData()
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [periodo, setPeriodo] = useState<PeriodoRapido>('tudo')

  function aplicarPeriodo(p: PeriodoRapido) {
    setPeriodo(p)
    if (p === 'tudo') {
      setDe('')
      setAte('')
      return
    }
    const now = new Date()
    const ateStr = toInputDate(now)
    if (p === 'hoje') {
      setDe(ateStr)
      setAte(ateStr)
      return
    }
    const from = new Date(now)
    from.setDate(from.getDate() - (p === '7d' ? 6 : 29))
    setDe(toInputDate(from))
    setAte(ateStr)
  }

  const cargasFiltradas = useMemo(() => {
    if (!de && !ate) return cargas
    const from = de ? startOfDay(de) : null
    const to = ate ? endOfDay(ate) : null
    return cargas.filter((c) => {
      const ref = c.publicado_em ?? c.created_at
      if (!ref) return true
      const t = new Date(ref).getTime()
      if (from != null && t < from) return false
      if (to != null && t > to) return false
      return true
    })
  }, [cargas, de, ate])

  const lancesFiltrados = useMemo(() => {
    const ids = new Set(cargasFiltradas.map((c) => c.id))
    return lances.filter((l) => ids.has(l.carga_id))
  }, [lances, cargasFiltradas])

  const stats = useMemo(() => {
    const publicadas = cargasFiltradas.filter((c) => c.publicado_em)
    const comPropostas = publicadas.filter((c) =>
      lancesFiltrados.some((l) => l.carga_id === c.id),
    )
    const alocadas = cargasFiltradas.filter((c) => c.status === 'alocadas')
    const recusadas = cargasFiltradas.filter((c) => c.status === 'recusadas')
    const canceladas = cargasFiltradas.filter((c) => c.status === 'canceladas')
    const suspensas = cargasFiltradas.filter((c) => c.status === 'suspensas')
    const emNegocio = cargasFiltradas.filter(
      (c) =>
        ['negociando', 'propostas'].includes(c.status) && !c.transportador_vencedor_id,
    )
    const fretesFechados = cargasFiltradas.filter((c) => c.frete_fechado != null)
    const totalLances = lancesFiltrados.length

    const freteMedio =
      alocadas.length > 0
        ? alocadas.reduce((s, c) => s + (c.frete_fechado ?? 0), 0) / alocadas.length
        : fretesFechados.length > 0
          ? fretesFechados.reduce((s, c) => s + (c.frete_fechado ?? 0), 0) /
            fretesFechados.length
          : 0

    const economiaBase = alocadas.length > 0 ? alocadas : fretesFechados
    const economia = economiaBase.reduce(
      (s, c) => s + (c.frete_tabela - (c.frete_fechado ?? c.frete_tabela)),
      0,
    )

    const comMargem = publicadas.filter((c) => c.margem_percentual != null)
    const margemMedia =
      comMargem.length > 0
        ? comMargem.reduce((s, c) => s + (c.margem_percentual ?? 0), 0) / comMargem.length
        : 0

    const temposNeg: number[] = []
    for (const c of fretesFechados) {
      if (!c.publicado_em) continue
      const lanceV = lancesFiltrados.find(
        (l) => l.carga_id === c.id && (l.status === 'vencedor' || l.status === 'recusado'),
      )
      const fim = lanceV?.updated_at ?? lanceV?.created_at
      if (!fim) continue
      temposNeg.push(
        (new Date(fim).getTime() - new Date(c.publicado_em).getTime()) / 60_000,
      )
    }
    const tempoMedio =
      temposNeg.length > 0 ? temposNeg.reduce((a, b) => a + b, 0) / temposNeg.length : 0

    // SLA alocação: hist carga_alocada vs alocacao_expira_em
    let slaOk = 0
    let slaTotal = 0
    const temposAloc: number[] = []
    for (const c of alocadas) {
      const evAloc = historico.find(
        (h) => h.carga_id === c.id && h.tipo === 'carga_alocada',
      )
      const alocadoEm = evAloc?.created_at ?? c.updated_at
      if (!alocadoEm) continue

      if (c.alocacao_expira_em) {
        slaTotal += 1
        if (new Date(alocadoEm).getTime() <= new Date(c.alocacao_expira_em).getTime()) {
          slaOk += 1
        }
      }

      const fechadoEm = lancesFiltrados.find(
        (l) => l.carga_id === c.id && l.status === 'vencedor',
      )?.created_at
      if (fechadoEm) {
        temposAloc.push(
          (new Date(alocadoEm).getTime() - new Date(fechadoEm).getTime()) / 60_000,
        )
      }
    }
    const slaAlocacaoPct = slaTotal > 0 ? pct(slaOk, slaTotal) : 0
    const tempoMedioAlocacaoMin =
      temposAloc.length > 0
        ? temposAloc.reduce((a, b) => a + b, 0) / temposAloc.length
        : 0

    const conversaoFechamento = pct(fretesFechados.length, publicadas.length)
    const conversaoAlocacao = pct(alocadas.length, fretesFechados.length)

    const vencedores = new Map<string, number>()
    for (const c of [...alocadas, ...fretesFechados]) {
      if (!c.transportador_vencedor_id) continue
      vencedores.set(
        c.transportador_vencedor_id,
        (vencedores.get(c.transportador_vencedor_id) ?? 0) + 1,
      )
    }
    const topVencedores = [...vencedores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    const maxVencedor = topVencedores[0]?.[1] ?? 1

    const ranking = rankingTransportadores().slice(0, 8)
    const maxPts = ranking[0]?.pontuacao ?? 1

    const porClassificacao = {
      ouro: transportadores.filter((t) => t.classificacao === 'ouro' && t.situacao === 'ativo')
        .length,
      prata: transportadores.filter((t) => t.classificacao === 'prata' && t.situacao === 'ativo')
        .length,
      bronze: transportadores.filter(
        (t) => t.classificacao === 'bronze' && t.situacao === 'ativo',
      ).length,
    }

    const funil = [
      { key: 'publicadas', label: 'Publicadas', value: publicadas.length },
      { key: 'propostas', label: 'Com propostas', value: comPropostas.length },
      { key: 'fechados', label: 'Fretes fechados', value: fretesFechados.length },
      { key: 'alocadas', label: 'Alocadas', value: alocadas.length },
    ]
    const funilMax = Math.max(...funil.map((f) => f.value), 1)

    return {
      publicadas: publicadas.length,
      comPropostas: comPropostas.length,
      alocadas: alocadas.length,
      recusadas: recusadas.length,
      canceladas: canceladas.length,
      suspensas: suspensas.length,
      emNegocio: emNegocio.length,
      fretesFechados: fretesFechados.length,
      totalLances,
      freteMedio,
      economia,
      margemMedia,
      tempoMedio,
      tempoMedioAlocacaoMin,
      conversaoFechamento,
      conversaoAlocacao,
      slaAlocacaoPct,
      slaOk,
      slaTotal,
      visualizacoes: cargasFiltradas.reduce((s, c) => s + c.visualizacoes, 0),
      porClassificacao,
      ranking,
      maxPts,
      topVencedores,
      maxVencedor,
      funil,
      funilMax,
      integracoesOk: integracoes.filter((i) => i.status === 'enviado' || i.status === 'simulado')
        .length,
    }
  }, [
    cargasFiltradas,
    lancesFiltrados,
    transportadores,
    rankingTransportadores,
    historico,
    integracoes,
  ])

  const kpis = [
    { label: 'Publicadas', value: stats.publicadas, accent: 'border-l-[#111]' },
    { label: 'Propostas', value: stats.totalLances, accent: 'border-l-amber-500' },
    { label: 'Fretes fechados', value: stats.fretesFechados, accent: 'border-l-teal-600' },
    { label: 'Recusadas', value: stats.recusadas, accent: 'border-l-rose-500' },
    { label: 'Alocadas', value: stats.alocadas, accent: 'border-l-emerald-600' },
    { label: 'Em negociação', value: stats.emNegocio, accent: 'border-l-sky-500' },
  ]

  function exportar() {
    downloadCsv(
      `indicadores-oferta-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'numero',
        'status',
        'origem',
        'destino',
        'frete_tabela',
        'frete_oferta',
        'frete_fechado',
        'publicado_em',
        'transportador_vencedor',
      ],
      cargasFiltradas.map((c) => [
        c.numero,
        c.status,
        c.origem,
        c.destino,
        c.frete_tabela,
        c.frete_oferta ?? '',
        c.frete_fechado ?? '',
        c.publicado_em ?? '',
        transportadores.find((t) => t.id === c.transportador_vencedor_id)?.nome_fantasia ?? '',
      ]),
    )
  }

  const atalhos: { id: PeriodoRapido; label: string }[] = [
    { id: 'hoje', label: 'Hoje' },
    { id: '7d', label: '7 dias' },
    { id: '30d', label: '30 dias' },
    { id: 'tudo', label: 'Tudo' },
  ]

  return (
    <div className="w-full space-y-6 animate-fade-up pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink">Indicadores</h2>
          <p className="text-sm text-ink-muted">
            Operação de ofertas: conversão, economia, SLA e ranking.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-ink px-4 py-2 text-xs font-bold text-white hover:bg-ink-deep"
          onClick={exportar}
        >
          Exportar CSV
        </button>
      </header>

      {/* Filtros */}
      <section className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1.5">
            {atalhos.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => aplicarPeriodo(a.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  periodo === a.id
                    ? 'bg-ink text-white'
                    : 'bg-sand-light text-ink-muted hover:text-ink'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <label className="text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              De
            </span>
            <input
              type="date"
              className="rounded-lg border border-ink/15 px-2.5 py-1.5 text-sm outline-none focus:border-ink"
              value={de}
              onChange={(e) => {
                setDe(e.target.value)
                setPeriodo('tudo')
              }}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Até
            </span>
            <input
              type="date"
              className="rounded-lg border border-ink/15 px-2.5 py-1.5 text-sm outline-none focus:border-ink"
              value={ate}
              onChange={(e) => {
                setAte(e.target.value)
                setPeriodo('tudo')
              }}
            />
          </label>
          {(de || ate) && (
            <button
              type="button"
              className="text-xs font-bold text-ink underline-offset-2 hover:underline"
              onClick={() => aplicarPeriodo('tudo')}
            >
              Limpar
            </button>
          )}
          <p className="w-full text-[11px] text-ink-muted sm:ml-auto sm:w-auto">
            Por data de publicação · {cargasFiltradas.length} carga(s) no filtro
          </p>
        </div>
      </section>

      {/* KPI strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={`rounded-xl border border-ink/10 border-l-4 bg-white p-4 shadow-sm ${k.accent}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {k.label}
            </p>
            <p className="mt-1 font-display text-3xl font-bold tabular-nums text-ink">{k.value}</p>
          </div>
        ))}
      </section>

      {/* Funil + conversão */}
      <section className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm lg:col-span-3">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-lg font-semibold text-ink">Funil de conversão</h3>
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="rounded-md bg-teal-50 px-2 py-1 font-bold text-teal-800">
                Pub. → fechamento {formatPct(stats.conversaoFechamento)}
              </span>
              <span className="rounded-md bg-emerald-50 px-2 py-1 font-bold text-emerald-800">
                Fech. → alocação {formatPct(stats.conversaoAlocacao)}
              </span>
            </div>
          </div>
          <ul className="space-y-3">
            {stats.funil.map((step, i) => (
              <li key={step.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">
                    <span className="mr-2 text-ink-muted">{i + 1}.</span>
                    {step.label}
                  </span>
                  <span className="font-display font-bold tabular-nums">{step.value}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-sand-light">
                  <div
                    className="h-full rounded-full bg-ink transition-all duration-500"
                    style={{ width: `${Math.max(4, (step.value / stats.funilMax) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-ink-muted">
            Suspensas {stats.suspensas} · Canceladas {stats.canceladas} · Visualizações{' '}
            {stats.visualizacoes}
          </p>
        </div>

        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="mb-4 font-display text-lg font-semibold text-ink">Resultado financeiro</h3>
          <dl className="space-y-3 text-sm">
            <MetricRow label="Frete médio" value={formatCurrency(stats.freteMedio)} />
            <MetricRow
              label="Economia vs tabela"
              value={formatCurrency(stats.economia)}
              highlight
            />
            <MetricRow
              label="Margem média aplicada"
              value={stats.margemMedia !== 0 ? `${stats.margemMedia.toFixed(1)}%` : '—'}
            />
            <MetricRow
              label="Tempo médio negociação"
              value={stats.tempoMedio > 0 ? `${Math.round(stats.tempoMedio)} min` : '—'}
            />
            <MetricRow
              label="SLA alocação no prazo"
              value={
                stats.slaTotal > 0
                  ? `${formatPct(stats.slaAlocacaoPct)} (${stats.slaOk}/${stats.slaTotal})`
                  : '—'
              }
            />
            <MetricRow
              label="Tempo médio até alocar"
              value={
                stats.tempoMedioAlocacaoMin > 0
                  ? `${Math.round(stats.tempoMedioAlocacaoMin)} min`
                  : '—'
              }
            />
            <MetricRow label="Integrações Fretes" value={String(stats.integracoesOk)} />
          </dl>
        </div>
      </section>

      {/* Classificação + rankings */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-display text-lg font-semibold text-ink">Classificação</h3>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['ouro', stats.porClassificacao.ouro, 'bg-[#f5e6a8] text-ink'],
                ['prata', stats.porClassificacao.prata, 'bg-slate-200 text-ink'],
                ['bronze', stats.porClassificacao.bronze, 'bg-[#c4a484] text-ink'],
              ] as const
            ).map(([label, n, cls]) => (
              <div key={label} className={`rounded-lg ${cls} px-2 py-3 text-center`}>
                <p className="font-display text-2xl font-bold tabular-nums">{n}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-ink-muted">
            Pontuação: proposta +2 · frete fechado +2 · recusa/sem ação −1.
          </p>
        </div>

        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-display text-lg font-semibold text-ink">Ranking (pontuação)</h3>
          <ol className="space-y-2.5">
            {stats.ranking.map((t, i) => (
              <li key={t.id}>
                <div className="mb-0.5 flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <strong className="mr-1.5 text-ink-muted">{i + 1}º</strong>
                    {t.nome_fantasia}
                    <ClassChip tipo={t.classificacao} />
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">
                    {t.pontuacao} pts
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-sand-light">
                  <div
                    className="h-full rounded-full bg-teal-600"
                    style={{
                      width: `${Math.max(6, (t.pontuacao / Math.max(stats.maxPts, 1)) * 100)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
            {stats.ranking.length === 0 && (
              <li className="text-sm text-ink-muted">Nenhum transportador ativo.</li>
            )}
          </ol>
        </div>

        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-display text-lg font-semibold text-ink">
            Transportadores vencedores
          </h3>
          <ul className="space-y-2.5">
            {stats.topVencedores.map(([id, n]) => {
              const t = transportadores.find((x) => x.id === id)
              return (
                <li key={id}>
                  <div className="mb-0.5 flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      {t?.nome_fantasia ?? id}
                      {t && <ClassChip tipo={t.classificacao} />}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{n} frete(s)</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-sand-light">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{
                        width: `${Math.max(6, (n / Math.max(stats.maxVencedor, 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </li>
              )
            })}
            {stats.topVencedores.length === 0 && (
              <li className="text-sm text-ink-muted">Nenhum frete fechado/alocado ainda.</li>
            )}
          </ul>
        </div>
      </section>
    </div>
  )
}

function MetricRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink/5 pb-2 last:border-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd
        className={`font-display font-bold tabular-nums ${
          highlight ? 'text-emerald-700' : 'text-ink'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

function ClassChip({ tipo }: { tipo: string }) {
  const cls =
    tipo === 'ouro'
      ? 'bg-[#f5e6a8] text-ink'
      : tipo === 'prata'
        ? 'bg-slate-200 text-ink'
        : 'bg-[#c4a484] text-ink'
  return (
    <span
      className={`ml-1.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${cls}`}
    >
      {tipo}
    </span>
  )
}
