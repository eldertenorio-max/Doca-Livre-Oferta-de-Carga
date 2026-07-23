import { useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import { formatCurrency, formatDateTime } from '../../lib/businessRules'
import { downloadCsv } from '../../lib/exportCsv'
import {
  colunaTransportador,
  meuLanceAtivoNaRodada,
} from '../../lib/kanbanColumns'

type PeriodoRapido = 'hoje' | '7d' | '30d' | 'tudo'

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

function mesLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, (m || 1) - 1, 1)
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

type Props = {
  transportadorId: string
  /** Esconde cabeçalho quando embutido em outra página */
  compact?: boolean
}

export function TransportadorPainel({ transportadorId, compact }: Props) {
  const {
    cargas,
    lances,
    transportadores,
    veiculos,
    motoristas,
    grupos,
    interacoes,
    rankingTransportadores,
    historicoDoTransportador,
  } = useData()

  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [periodo, setPeriodo] = useState<PeriodoRapido>('tudo')

  const t = transportadores.find((x) => x.id === transportadorId)

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

  const inPeriod = (iso: string | null | undefined) => {
    if (!de && !ate) return true
    if (!iso) return true
    const ts = new Date(iso).getTime()
    if (!Number.isFinite(ts)) return true
    if (de && ts < startOfDay(de)) return false
    if (ate && ts > endOfDay(ate)) return false
    return true
  }

  const stats = useMemo(() => {
    const tid = transportadorId
    const meusLances = lances.filter((l) => l.transportador_id === tid && inPeriod(l.created_at))
    const ganhos = cargas.filter(
      (c) =>
        c.transportador_vencedor_id === tid &&
        c.frete_fechado != null &&
        c.status !== 'canceladas' &&
        inPeriod(c.updated_at ?? c.publicado_em ?? c.created_at),
    )
    const alocadas = ganhos.filter((c) => c.status === 'alocadas')
    const confirmadas = ganhos.filter((c) => c.status !== 'alocadas')
    const valorTotal = ganhos.reduce((s, c) => s + (c.frete_fechado ?? 0), 0)
    const freteMedio = ganhos.length > 0 ? valorTotal / ganhos.length : 0

    const lancesVencedor = meusLances.filter((l) => l.status === 'vencedor').length
    const lancesPerdidos = meusLances.filter((l) =>
      ['perdido', 'recusado'].includes(l.status),
    ).length
    const lancesAtivos = meusLances.filter((l) => l.status === 'ativo').length
    const lancesCancelados = meusLances.filter((l) => l.status === 'cancelado').length
    const decisoes = lancesVencedor + lancesPerdidos
    const taxaVitoria = pct(lancesVencedor, decisoes)

    const visiveis = cargas.filter((c) => {
      // pipeline atual (sem filtro de período no kanban vivo)
      const temMeu = meuLanceAtivoNaRodada(c, lances, tid)
      const col = colunaTransportador(c, tid, temMeu)
      return col != null
    })
    const pipeline = {
      nova: visiveis.filter((c) => {
        const temMeu = meuLanceAtivoNaRodada(c, lances, tid)
        return colunaTransportador(c, tid, temMeu) === 'nova_carga'
      }).length,
      propostas: visiveis.filter((c) => {
        const temMeu = meuLanceAtivoNaRodada(c, lances, tid)
        return colunaTransportador(c, tid, temMeu) === 'propostas'
      }).length,
      confirmadas: visiveis.filter((c) => {
        const temMeu = meuLanceAtivoNaRodada(c, lances, tid)
        return colunaTransportador(c, tid, temMeu) === 'confirmadas'
      }).length,
      alocadas: visiveis.filter((c) => {
        const temMeu = meuLanceAtivoNaRodada(c, lances, tid)
        return colunaTransportador(c, tid, temMeu) === 'alocadas'
      }).length,
    }

    const funil = [
      { key: 'propostas', label: 'Propostas enviadas', value: meusLances.filter((l) => l.status !== 'cancelado').length },
      { key: 'ganhos', label: 'Fretes ganhos', value: ganhos.length },
      { key: 'alocadas', label: 'Alocadas', value: alocadas.length },
    ]
    const funilMax = Math.max(...funil.map((f) => f.value), 1)

    // Últimos 6 meses (calendário)
    const meses: { key: string; qtd: number; valor: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      meses.push({ key, qtd: 0, valor: 0 })
    }
    for (const c of ganhos) {
      const ref = c.updated_at ?? c.publicado_em ?? c.created_at
      if (!ref) continue
      const dt = new Date(ref)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      const slot = meses.find((m) => m.key === key)
      if (slot) {
        slot.qtd += 1
        slot.valor += c.frete_fechado ?? 0
      }
    }
    const maxMesQtd = Math.max(...meses.map((m) => m.qtd), 1)
    const maxMesValor = Math.max(...meses.map((m) => m.valor), 1)

    // Top rotas
    const rotaMap = new Map<string, { qtd: number; valor: number }>()
    for (const c of ganhos) {
      const label = `${c.origem || '?'} → ${c.destino || '?'}`
      const cur = rotaMap.get(label) ?? { qtd: 0, valor: 0 }
      cur.qtd += 1
      cur.valor += c.frete_fechado ?? 0
      rotaMap.set(label, cur)
    }
    const topRotas = [...rotaMap.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.qtd - a.qtd || b.valor - a.valor)
      .slice(0, 6)
    const maxRota = topRotas[0]?.qtd ?? 1

    const meusPts = interacoes.filter((i) => i.transportador_id === tid)
    const ptsPorTipo = {
      frete_fechado: meusPts.filter((i) => i.tipo === 'frete_fechado').reduce((s, i) => s + i.pontos, 0),
      com_proposta: meusPts.filter((i) => i.tipo === 'com_proposta').reduce((s, i) => s + i.pontos, 0),
      recusada: meusPts.filter((i) => i.tipo === 'recusada').reduce((s, i) => s + i.pontos, 0),
      visualizada_sem_acao: meusPts
        .filter((i) => i.tipo === 'visualizada_sem_acao')
        .reduce((s, i) => s + i.pontos, 0),
      nao_visualizada: meusPts
        .filter((i) => i.tipo === 'nao_visualizada')
        .reduce((s, i) => s + i.pontos, 0),
    }

    const ranking = rankingTransportadores()
    const pos = ranking.findIndex((x) => x.id === tid) + 1
    const nVeiculos = veiculos.filter((v) => v.transportador_id === tid).length
    const nMotoristas = motoristas.filter((m) => m.transportador_id === tid).length
    const nGrupos = grupos.filter((g) => g.transportador_ids.includes(tid)).length

    const hist = historicoDoTransportador(tid).slice(0, 12)

    return {
      ganhos,
      alocadas: alocadas.length,
      confirmadas: confirmadas.length,
      valorTotal,
      freteMedio,
      totalLances: meusLances.length,
      lancesVencedor,
      lancesPerdidos,
      lancesAtivos,
      lancesCancelados,
      taxaVitoria,
      pipeline,
      funil,
      funilMax,
      meses,
      maxMesQtd,
      maxMesValor,
      topRotas,
      maxRota,
      ptsPorTipo,
      pos,
      nVeiculos,
      nMotoristas,
      nGrupos,
      hist,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inPeriod fecha sobre de/ate
  }, [
    transportadorId,
    cargas,
    lances,
    interacoes,
    veiculos,
    motoristas,
    grupos,
    rankingTransportadores,
    historicoDoTransportador,
    de,
    ate,
  ])

  const atalhos: { id: PeriodoRapido; label: string }[] = [
    { id: 'hoje', label: 'Hoje' },
    { id: '7d', label: '7 dias' },
    { id: '30d', label: '30 dias' },
    { id: 'tudo', label: 'Tudo' },
  ]

  const kpis = [
    { label: 'Fretes ganhos', value: String(stats.ganhos.length), accent: 'border-l-teal-600' },
    {
      label: 'Valor total',
      value: formatCurrency(stats.valorTotal),
      accent: 'border-l-emerald-600',
    },
    {
      label: 'Frete médio',
      value: formatCurrency(stats.freteMedio),
      accent: 'border-l-sky-500',
    },
    { label: 'Alocadas', value: String(stats.alocadas), accent: 'border-l-[#2f9e6a]' },
    {
      label: 'Taxa de vitória',
      value: formatPct(stats.taxaVitoria),
      accent: 'border-l-amber-500',
    },
    {
      label: 'Propostas',
      value: String(stats.totalLances),
      accent: 'border-l-[#3b82f6]',
    },
  ]

  function exportar() {
    downloadCsv(
      `painel-${(t?.nome_fantasia || transportadorId).replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'numero',
        'origem',
        'destino',
        'status',
        'frete_fechado',
        'placa',
        'motorista',
        'atualizado_em',
      ],
      stats.ganhos.map((c) => [
        c.numero,
        c.origem,
        c.destino,
        c.status,
        c.frete_fechado ?? '',
        c.placa ?? '',
        c.motorista ?? '',
        c.updated_at ?? '',
      ]),
    )
  }

  if (!t) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Transportadora não encontrada.
      </p>
    )
  }

  const classChip =
    t.classificacao === 'ouro'
      ? 'bg-[#f5e6a8] text-ink'
      : t.classificacao === 'prata'
        ? 'bg-slate-200 text-ink'
        : 'bg-[#c4a484] text-ink'

  return (
    <div className={`space-y-6 ${compact ? '' : 'animate-fade-up pb-8'}`}>
      {!compact && (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Painel</h2>
            <p className="text-sm text-ink-muted">
              Desempenho de <strong>{t.nome_fantasia}</strong>
              <span
                className={`ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${classChip}`}
              >
                {t.classificacao}
              </span>
              <span className="ml-2 text-ink-muted">
                {t.pontuacao} pts
                {stats.pos > 0 ? ` · ${stats.pos}º no ranking` : ''}
              </span>
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg bg-ink px-4 py-2 text-xs font-bold text-white hover:bg-ink-deep"
            onClick={exportar}
            disabled={stats.ganhos.length === 0}
          >
            Exportar CSV
          </button>
        </header>
      )}

      {compact && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-muted">
            <span
              className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${classChip}`}
            >
              {t.classificacao}
            </span>
            {t.pontuacao} pts
            {stats.pos > 0 ? ` · ${stats.pos}º no ranking` : ''} · {stats.nVeiculos} veículo(s) ·{' '}
            {stats.nMotoristas} motorista(s) · {stats.nGrupos} grupo(s)
          </p>
          <button
            type="button"
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white hover:bg-ink-deep"
            onClick={exportar}
            disabled={stats.ganhos.length === 0}
          >
            Exportar CSV
          </button>
        </div>
      )}

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
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={`rounded-xl border border-ink/10 border-l-4 bg-white p-4 shadow-sm ${k.accent}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {k.label}
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-ink sm:text-3xl">
              {k.value}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm lg:col-span-3">
          <h3 className="mb-4 font-display text-lg font-semibold text-ink">
            Fretes ganhos — últimos 6 meses
          </h3>
          <div className="flex h-44 items-end gap-2">
            {stats.meses.map((m) => (
              <div key={m.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-semibold tabular-nums text-ink-muted">
                  {m.qtd || ''}
                </span>
                <div className="flex h-32 w-full items-end justify-center gap-0.5">
                  <div
                    className="w-[45%] max-w-[28px] rounded-t bg-teal-600 transition-all"
                    style={{ height: `${Math.max(m.qtd ? 8 : 2, (m.qtd / stats.maxMesQtd) * 100)}%` }}
                    title={`${m.qtd} frete(s)`}
                  />
                  <div
                    className="w-[45%] max-w-[28px] rounded-t bg-emerald-300 transition-all"
                    style={{
                      height: `${Math.max(m.valor ? 8 : 2, (m.valor / stats.maxMesValor) * 100)}%`,
                    }}
                    title={formatCurrency(m.valor)}
                  />
                </div>
                <span className="truncate text-[10px] font-medium uppercase text-ink-muted">
                  {mesLabel(m.key)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-ink-muted">
            <span className="mr-3 inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-teal-600" /> Quantidade
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-emerald-300" /> Valor
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="mb-4 font-display text-lg font-semibold text-ink">Funil</h3>
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
          <dl className="mt-5 space-y-2 border-t border-ink/5 pt-4 text-sm">
            <Row label="Lances vencedores" value={String(stats.lancesVencedor)} />
            <Row label="Lances perdidos" value={String(stats.lancesPerdidos)} />
            <Row label="Lances ativos" value={String(stats.lancesAtivos)} />
            <Row label="Aguardando alocação" value={String(stats.confirmadas)} />
          </dl>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-display text-lg font-semibold text-ink">Kanban agora</h3>
          <ul className="space-y-2.5 text-sm">
            {(
              [
                ['Nova carga', stats.pipeline.nova, '#0d9488'],
                ['Propostas', stats.pipeline.propostas, '#3b82f6'],
                ['Confirmadas', stats.pipeline.confirmadas, '#f59e0b'],
                ['Alocadas', stats.pipeline.alocadas, '#2f9e6a'],
              ] as const
            ).map(([label, n, color]) => (
              <li key={label} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                  {label}
                </span>
                <span className="font-display font-bold tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
          {!compact && (
            <p className="mt-4 text-[11px] text-ink-muted">
              Frota: {stats.nVeiculos} veículo(s) · {stats.nMotoristas} motorista(s) ·{' '}
              {stats.nGrupos} grupo(s)
            </p>
          )}
        </div>

        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-display text-lg font-semibold text-ink">Pontuação</h3>
          <dl className="space-y-2 text-sm">
            <Row label="Saldo atual" value={`${t.pontuacao} pts`} highlight />
            <Row label="Fretes fechados" value={`${stats.ptsPorTipo.frete_fechado >= 0 ? '+' : ''}${stats.ptsPorTipo.frete_fechado}`} />
            <Row label="Propostas" value={`${stats.ptsPorTipo.com_proposta >= 0 ? '+' : ''}${stats.ptsPorTipo.com_proposta}`} />
            <Row label="Recusas" value={String(stats.ptsPorTipo.recusada)} />
            <Row
              label="Sem ação / não vista"
              value={String(
                stats.ptsPorTipo.visualizada_sem_acao + stats.ptsPorTipo.nao_visualizada,
              )}
            />
          </dl>
        </div>

        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-display text-lg font-semibold text-ink">Top rotas</h3>
          {stats.topRotas.length === 0 ? (
            <p className="text-sm text-ink-muted">Nenhum frete ganho no período.</p>
          ) : (
            <ol className="space-y-2.5">
              {stats.topRotas.map((r) => (
                <li key={r.label}>
                  <div className="mb-0.5 flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{r.label}</span>
                    <span className="shrink-0 tabular-nums text-ink-muted">
                      {r.qtd}× · {formatCurrency(r.valor)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-sand-light">
                    <div
                      className="h-full rounded-full bg-teal-600"
                      style={{ width: `${Math.max(6, (r.qtd / stats.maxRota) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-display text-lg font-semibold text-ink">
          Fretes ganhos no período
        </h3>
        {stats.ganhos.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhum frete no filtro selecionado.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase text-ink-muted">
                <tr>
                  <th className="px-2 py-2">Carga</th>
                  <th className="px-2 py-2">Rota</th>
                  <th className="px-2 py-2">Valor</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Alocação</th>
                  <th className="px-2 py-2">Atualizado</th>
                </tr>
              </thead>
              <tbody>
                {stats.ganhos
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.updated_at ?? 0).getTime() -
                      new Date(a.updated_at ?? 0).getTime(),
                  )
                  .slice(0, 40)
                  .map((c) => (
                    <tr key={c.id} className="border-t border-ink/5">
                      <td className="px-2 py-2 font-semibold">{c.numero}</td>
                      <td className="px-2 py-2">
                        {c.origem} → {c.destino}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {formatCurrency(c.frete_fechado ?? 0)}
                      </td>
                      <td className="px-2 py-2 capitalize">{c.status.replace(/_/g, ' ')}</td>
                      <td className="px-2 py-2 text-ink-muted">
                        {c.placa || c.motorista
                          ? `${c.placa || '—'} · ${c.motorista || '—'}`
                          : '—'}
                      </td>
                      <td className="px-2 py-2 text-xs text-ink-muted">
                        {c.updated_at ? formatDateTime(c.updated_at) : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {stats.hist.length > 0 && (
        <section className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-display text-lg font-semibold text-ink">
            Últimos eventos
          </h3>
          <ul className="space-y-1.5 text-sm">
            {stats.hist.map((h) => (
              <li key={h.id} className="border-b border-ink/5 py-1.5 last:border-0">
                <strong>{h.titulo}</strong>
                {h.detalhe ? (
                  <span className="ml-2 text-xs text-ink-muted">{h.detalhe}</span>
                ) : null}
                <span className="ml-2 text-[11px] text-ink-muted">
                  {formatDateTime(h.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Row({
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
