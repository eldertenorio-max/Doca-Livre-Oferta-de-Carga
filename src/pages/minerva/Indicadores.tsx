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

export function IndicadoresPage() {
  const { cargas, lances, transportadores, rankingTransportadores, historico, integracoes } =
    useData()
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

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
    const alocadas = cargasFiltradas.filter((c) => c.status === 'alocadas')
    const recusadas = cargasFiltradas.filter((c) => c.status === 'recusadas')
    const canceladas = cargasFiltradas.filter((c) => c.status === 'canceladas')
    const suspensas = cargasFiltradas.filter((c) => c.status === 'suspensas')
    const emNegocio = cargasFiltradas.filter((c) =>
      ['negociando', 'propostas'].includes(c.status),
    )
    const fretesFechados = cargasFiltradas.filter((c) => c.frete_fechado != null)
    const totalLances = lancesFiltrados.length
    const freteMedio =
      alocadas.length > 0
        ? alocadas.reduce((s, c) => s + (c.frete_fechado ?? 0), 0) / alocadas.length
        : 0
    const economia = alocadas.reduce(
      (s, c) => s + (c.frete_tabela - (c.frete_fechado ?? c.frete_tabela)),
      0,
    )
    const margemMedia =
      publicadas.filter((c) => c.margem_percentual != null).length > 0
        ? publicadas
            .filter((c) => c.margem_percentual != null)
            .reduce((s, c) => s + (c.margem_percentual ?? 0), 0) /
          publicadas.filter((c) => c.margem_percentual != null).length
        : 0

    const tempos: number[] = []
    for (const c of fretesFechados) {
      if (!c.publicado_em) continue
      const lanceV = lancesFiltrados.find(
        (l) => l.carga_id === c.id && (l.status === 'vencedor' || l.status === 'recusado'),
      )
      const fim = lanceV?.created_at ?? c.alocacao_expira_em
      if (!fim) continue
      tempos.push(
        (new Date(fim).getTime() - new Date(c.publicado_em).getTime()) / 60_000,
      )
    }
    const tempoMedio =
      tempos.length > 0 ? tempos.reduce((a, b) => a + b, 0) / tempos.length : 0

    const vencedores = new Map<string, number>()
    for (const c of alocadas) {
      if (!c.transportador_vencedor_id) continue
      vencedores.set(
        c.transportador_vencedor_id,
        (vencedores.get(c.transportador_vencedor_id) ?? 0) + 1,
      )
    }

    const porClassificacao = {
      ouro: transportadores.filter((t) => t.classificacao === 'ouro').length,
      prata: transportadores.filter((t) => t.classificacao === 'prata').length,
      bronze: transportadores.filter((t) => t.classificacao === 'bronze').length,
    }

    return {
      publicadas: publicadas.length,
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
      visualizacoes: cargasFiltradas.reduce((s, c) => s + c.visualizacoes, 0),
      porClassificacao,
      ranking: rankingTransportadores().slice(0, 8),
      topVencedores: [...vencedores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      integracoesOk: integracoes.filter((i) => i.status === 'enviado' || i.status === 'simulado')
        .length,
      eventos: historico.length,
    }
  }, [
    cargasFiltradas,
    lancesFiltrados,
    transportadores,
    rankingTransportadores,
    historico,
    integracoes,
  ])

  const cards = [
    { label: 'Cargas publicadas', value: String(stats.publicadas), tone: 'bg-ink' },
    { label: 'Propostas recebidas', value: String(stats.totalLances), tone: 'bg-amber-600' },
    { label: 'Fretes fechados', value: String(stats.fretesFechados), tone: 'bg-blue-600' },
    { label: 'Fretes recusados', value: String(stats.recusadas), tone: 'bg-brand' },
    { label: 'Alocadas', value: String(stats.alocadas), tone: 'bg-emerald-600' },
    { label: 'Em negociação', value: String(stats.emNegocio), tone: 'bg-ink-muted' },
    { label: 'Suspensas', value: String(stats.suspensas), tone: 'bg-violet-600' },
    { label: 'Canceladas', value: String(stats.canceladas), tone: 'bg-slate-500' },
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Indicadores</h2>
          <p className="text-sm text-ink-muted">
            Dashboard da operação: publicações, propostas, fretes, ranking e economia.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white hover:opacity-90"
          onClick={exportar}
        >
          Exportar CSV
        </button>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-ink/10 bg-white p-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-ink-muted">De</span>
          <input
            type="date"
            className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
            value={de}
            onChange={(e) => setDe(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-ink-muted">Até</span>
          <input
            type="date"
            className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
          />
        </label>
        {(de || ate) && (
          <button
            type="button"
            className="text-xs font-bold text-brand hover:underline"
            onClick={() => {
              setDe('')
              setAte('')
            }}
          >
            Limpar período
          </button>
        )}
        <p className="text-xs text-ink-muted sm:ml-auto">
          Filtro por data de publicação (ou criação se não publicada).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl ${c.tone} p-5 text-white shadow-md`}>
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
              <dd className="font-semibold text-emerald-700">{formatCurrency(stats.economia)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Margem média aplicada</dt>
              <dd className="font-semibold">{stats.margemMedia.toFixed(1)}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Tempo médio de negociação</dt>
              <dd className="font-semibold">
                {stats.tempoMedio > 0 ? `${Math.round(stats.tempoMedio)} min` : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Integrações Controle de Fretes</dt>
              <dd className="font-semibold">{stats.integracoesOk}</dd>
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
            Ranking dinâmico: proposta +2 · frete fechado +2 · recusa/sem ação −1. Classificação
            sobe ou cai com a pontuação.
          </p>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-ink/10 bg-white p-5">
          <h3 className="mb-3 font-display font-semibold">Ranking (pontuação)</h3>
          <ol className="space-y-2 text-sm">
            {stats.ranking.map((t, i) => (
              <li key={t.id} className="flex items-center justify-between border-b border-ink/5 pb-1">
                <span>
                  <strong className="mr-2 text-ink-muted">{i + 1}º</strong>
                  {t.nome_fantasia}{' '}
                  <span className="uppercase text-[10px] text-ink-muted">({t.classificacao})</span>
                </span>
                <span className="font-semibold tabular-nums">{t.pontuacao} pts</span>
              </li>
            ))}
            {stats.ranking.length === 0 && (
              <li className="text-ink-muted">Nenhum transportador ativo.</li>
            )}
          </ol>
        </section>

        <section className="rounded-xl border border-ink/10 bg-white p-5">
          <h3 className="mb-3 font-display font-semibold">Transportadores vencedores</h3>
          <ul className="space-y-2 text-sm">
            {stats.topVencedores.map(([id, n]) => {
              const t = transportadores.find((x) => x.id === id)
              return (
                <li key={id} className="flex justify-between border-b border-ink/5 pb-1">
                  <span>{t?.nome_fantasia ?? id}</span>
                  <span className="font-semibold">{n} frete(s)</span>
                </li>
              )
            })}
            {stats.topVencedores.length === 0 && (
              <li className="text-ink-muted">Nenhum frete alocado ainda.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  )
}
