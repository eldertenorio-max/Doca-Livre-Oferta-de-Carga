import { useMemo, type ReactNode } from 'react'
import {
  regrasPontuacao,
  pontosDaRegra,
  type LinhaHistoricoPts,
  type StatsAnuncioPontuacao,
} from '../../lib/pontuacaoAderencia'
import type { ConfigPontuacao } from '../../lib/configPontuacao'
import type { ClassificacaoTransportador, Transportador } from '../../types'

const STATUS_LABEL: Record<string, string> = {
  nova_carga: 'Nova',
  negociando: 'Negociando',
  propostas: 'Propostas',
  recusadas: 'Recusadas',
  alocadas: 'Alocadas',
  canceladas: 'Canceladas',
  suspensas: 'Suspensas',
}

const STATUS_COR: Record<string, string> = {
  nova_carga: '#64748b',
  negociando: '#1d4ed8',
  propostas: '#7c3aed',
  recusadas: '#dc2626',
  alocadas: '#16a34a',
  canceladas: '#94a3b8',
  suspensas: '#ea580c',
}

const CLASS_COR: Record<ClassificacaoTransportador, string> = {
  ouro: '#eab308',
  prata: '#94a3b8',
  bronze: '#c2410c',
}

const REGRA_COR: Record<string, string> = {
  nao_visualizada: '#64748b',
  visualizada_sem_acao: '#ea580c',
  com_proposta: '#1d4ed8',
  frete_fechado: '#16a34a',
  recusada: '#dc2626',
  recusada_contra: '#b45309',
}

type Slice = { label: string; value: number; color: string }

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

function slicePath(cx: number, cy: number, r: number, r0: number, start: number, end: number) {
  const large = end - start > 180 ? 1 : 0
  const p1 = polar(cx, cy, r, start)
  const p2 = polar(cx, cy, r, end)
  if (r0 <= 0) {
    return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y} Z`
  }
  const i1 = polar(cx, cy, r0, start)
  const i2 = polar(cx, cy, r0, end)
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y} L ${i2.x} ${i2.y} A ${r0} ${r0} 0 ${large} 0 ${i1.x} ${i1.y} Z`
}

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-3">
      <h3 className="font-display text-sm font-bold text-ink">{title}</h3>
      {hint ? <p className="mb-2 text-[11px] text-ink-muted">{hint}</p> : <div className="mb-2" />}
      {children}
    </div>
  )
}

function EmptyChart() {
  return <p className="py-8 text-center text-[12px] text-ink-muted">Sem dados para o gráfico.</p>
}

function Legend({ items }: { items: Slice[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {items.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5 text-[11px] text-ink">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
          <strong className="tabular-nums">{s.value}</strong>
        </li>
      ))}
    </ul>
  )
}

function PieDonut({ slices, donut }: { slices: Slice[]; donut?: boolean }) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0)
  if (total <= 0) return <EmptyChart />
  const cx = 90
  const cy = 90
  const r = 80
  const r0 = donut ? 46 : 0
  let angle = 0
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const sweep = (s.value / total) * 360
      const start = angle
      const end = angle + sweep
      angle = end
      return { ...s, start, end: end >= 360 ? 359.99 : end }
    })
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 180 180" className="h-44 w-44" role="img">
        {arcs.map((s) => (
          <path
            key={s.label}
            d={slicePath(cx, cy, r, r0, s.start, s.end)}
            fill={s.color}
          >
            <title>
              {s.label}: {s.value}
            </title>
          </path>
        ))}
        {donut ? (
          <text x={cx} y={cy + 5} textAnchor="middle" className="fill-ink" fontSize="18" fontWeight="800">
            {total}
          </text>
        ) : null}
      </svg>
      <Legend items={slices} />
    </div>
  )
}

function BarrasVerticais({
  items,
  unit,
}: {
  items: { label: string; value: number; color: string }[]
  unit?: string
}) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)))
  if (items.every((i) => i.value === 0)) return <EmptyChart />
  return (
    <div className="flex h-48 items-end gap-2 px-1">
      {items.map((i) => (
        <div key={i.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="text-[11px] font-extrabold tabular-nums text-ink">{i.value}{unit ?? ''}</span>
          <div
            className="w-full max-w-[52px] rounded-t-md"
            style={{
              height: `${Math.max(i.value === 0 ? 0 : 6, (Math.abs(i.value) / max) * 150)}px`,
              background: i.color,
            }}
            title={`${i.label}: ${i.value}`}
          />
          <span className="min-h-[2.2em] text-center text-[10px] leading-tight text-ink-muted">{i.label}</span>
        </div>
      ))}
    </div>
  )
}

function BarrasHorizontais({
  items,
  onClick,
}: {
  items: { id?: string; label: string; value: number; color?: string }[]
  onClick?: (id: string) => void
}) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)))
  if (items.length === 0) return <EmptyChart />
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.id ?? i.label}>
          <button
            type="button"
            className="w-full text-left disabled:cursor-default"
            disabled={!onClick || !i.id}
            onClick={() => i.id && onClick?.(i.id)}
          >
            <div className="mb-0.5 flex items-center justify-between gap-2 text-[12px]">
              <span className="min-w-0 truncate">{i.label}</span>
              <span className="shrink-0 font-extrabold tabular-nums">{i.value} pts</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-sand-light">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(4, (Math.abs(i.value) / max) * 100)}%`,
                  background: i.color ?? '#0f172a',
                }}
              />
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

function BarrasAgrupadas({
  rows,
  series,
}: {
  rows: { label: string; values: number[] }[]
  series: { label: string; color: string }[]
}) {
  const max = Math.max(1, ...rows.flatMap((r) => r.values))
  if (rows.length === 0) return <EmptyChart />
  return (
    <div>
      <div className="flex h-48 items-end gap-3 overflow-x-auto px-1">
        {rows.map((r) => (
          <div key={r.label} className="flex min-w-[72px] flex-1 flex-col items-center gap-1">
            <div className="flex h-[150px] items-end gap-0.5">
              {r.values.map((v, i) => (
                <div
                  key={series[i]?.label ?? i}
                  className="w-3.5 rounded-t-sm"
                  style={{
                    height: `${Math.max(v > 0 ? 6 : 0, (v / max) * 150)}px`,
                    background: series[i]?.color ?? '#94a3b8',
                  }}
                  title={`${r.label} · ${series[i]?.label}: ${v}`}
                />
              ))}
            </div>
            <span className="w-full truncate text-center text-[10px] text-ink-muted">{r.label}</span>
          </div>
        ))}
      </div>
      <Legend items={series.map((s) => ({ label: s.label, value: 0, color: s.color })).map((s, idx) => ({
        ...s,
        value: rows.reduce((acc, r) => acc + (r.values[idx] ?? 0), 0),
      }))} />
    </div>
  )
}

function LinhaArea({
  points,
  area,
  color,
  unit,
}: {
  points: { label: string; value: number }[]
  area?: boolean
  color: string
  unit?: string
}) {
  if (points.length === 0) return <EmptyChart />
  const w = 360
  const h = 160
  const padL = 28
  const padR = 8
  const padT = 12
  const padB = 28
  const innerW = w - padL - padR
  const innerH = h - padT - padB
  const min = Math.min(0, ...points.map((p) => p.value))
  const max = Math.max(1, ...points.map((p) => p.value))
  const span = max - min || 1
  const xy = points.map((p, i) => {
    const x = padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
    const y = padT + innerH - ((p.value - min) / span) * innerH
    return { ...p, x, y }
  })
  const line = xy.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaD = `${line} L ${xy[xy.length - 1].x} ${padT + innerH} L ${xy[0].x} ${padT + innerH} Z`
  const ticks = 4
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full" role="img">
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const y = padT + (innerH * i) / ticks
        const v = Math.round(max - (span * i) / ticks)
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#e8ecf1" strokeWidth="1" />
            <text x={padL - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#64748b">
              {v}
            </text>
          </g>
        )
      })}
      {area ? <path d={areaD} fill={color} opacity="0.18" /> : null}
      <path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
      {xy.map((p) => (
        <circle key={p.label} cx={p.x} cy={p.y} r="3" fill={color}>
          <title>
            {p.label}: {p.value}
            {unit ?? ''}
          </title>
        </circle>
      ))}
      {xy.filter((_, i) => i === 0 || i === xy.length - 1 || i % Math.ceil(xy.length / 6) === 0).map((p) => (
        <text key={p.label} x={p.x} y={h - 6} textAnchor="middle" fontSize="9" fill="#64748b">
          {p.label}
        </text>
      ))}
    </svg>
  )
}

function RadarRegras({ values }: { values: { label: string; value: number; color: string }[] }) {
  const n = values.length
  if (n < 3) return <EmptyChart />
  const max = Math.max(1, ...values.map((v) => v.value))
  const cx = 100
  const cy = 100
  const r = 72
  const pts = (scale: number) =>
    values.map((v, i) => {
      const ang = -90 + (360 / n) * i
      const rr = r * scale * (v.value / max || 0)
      return polar(cx, cy, rr, ang)
    })
  const rings = [0.25, 0.5, 0.75, 1]
  const dataPts = pts(1)
  const poly = dataPts.map((p) => `${p.x},${p.y}`).join(' ')
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 200" className="h-48 w-48" role="img">
        {rings.map((s) => (
          <polygon
            key={s}
            points={values
              .map((_, i) => {
                const p = polar(cx, cy, r * s, -90 + (360 / n) * i)
                return `${p.x},${p.y}`
              })
              .join(' ')}
            fill="none"
            stroke="#e8ecf1"
          />
        ))}
        {values.map((_, i) => {
          const p = polar(cx, cy, r, -90 + (360 / n) * i)
          return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e8ecf1" />
        })}
        <polygon points={poly} fill="#f9db00" fillOpacity="0.35" stroke="#0f172a" strokeWidth="1.6" />
        {dataPts.map((p, i) => (
          <circle key={values[i].label} cx={p.x} cy={p.y} r="3.5" fill={values[i].color}>
            <title>
              {values[i].label}: {values[i].value}
            </title>
          </circle>
        ))}
      </svg>
      <Legend items={values} />
    </div>
  )
}

function StackedEventos({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total <= 0) return <EmptyChart />
  return (
    <div>
      <div className="flex h-8 overflow-hidden rounded-md">
        {slices
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.label}
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
              title={`${s.label}: ${s.value}`}
            />
          ))}
      </div>
      <Legend items={slices} />
    </div>
  )
}

function diaKey(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diaLabel(key: string) {
  const [, m, d] = key.split('-')
  return `${d}/${m}`
}

export function PontuacaoDashboard({
  anuncios,
  ranking,
  historico,
  totais,
  cfg,
  onOpenTransportador,
}: {
  anuncios: StatsAnuncioPontuacao[]
  ranking: Array<
    Transportador & { pontuacao: number; classificacao: ClassificacaoTransportador }
  >
  historico: LinhaHistoricoPts[]
  totais: {
    visualizacoes: number
    lances: number
    aceitaram: number
    recusaramCarga: number
    recusaramContra: number
  }
  cfg?: ConfigPontuacao
  onOpenTransportador?: (id: string) => void
}) {
  const regras = useMemo(() => regrasPontuacao(cfg), [cfg])
  const funil = useMemo(
    () => [
      { label: 'Visualizações', value: totais.visualizacoes, color: '#0f172a' },
      { label: 'Deram lance', value: totais.lances, color: '#f9db00' },
      { label: 'Aceitaram', value: totais.aceitaram, color: '#16a34a' },
      { label: 'Recusou a carga', value: totais.recusaramCarga, color: '#dc2626' },
      { label: 'Recusou a contra-proposta', value: totais.recusaramContra, color: '#b45309' },
    ],
    [totais],
  )

  const statusSlices = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of anuncios) map.set(a.status, (map.get(a.status) ?? 0) + 1)
    return [...map.entries()].map(([status, value]) => ({
      label: STATUS_LABEL[status] ?? status,
      value,
      color: STATUS_COR[status] ?? '#64748b',
    }))
  }, [anuncios])

  const classSlices = useMemo(() => {
    const map: Record<ClassificacaoTransportador, number> = { ouro: 0, prata: 0, bronze: 0 }
    for (const t of ranking) map[t.classificacao] += 1
    return (Object.keys(map) as ClassificacaoTransportador[]).map((k) => ({
      label: k,
      value: map[k],
      color: CLASS_COR[k],
    }))
  }, [ranking])

  const eventosPorTipo = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of regras) map.set(r.id, 0)
    for (const h of historico) map.set(h.tipo, (map.get(h.tipo) ?? 0) + 1)
    return regras.map((r) => ({
      id: r.id,
      label: r.titulo,
      value: map.get(r.id) ?? 0,
      color: REGRA_COR[r.id] ?? '#64748b',
    }))
  }, [historico, regras])

  const pontosPorTipo = useMemo(
    () =>
      eventosPorTipo.map((e) => ({
        ...e,
        value: e.value * pontosDaRegra(e.id as LinhaHistoricoPts['tipo'], 0, cfg),
      })),
    [eventosPorTipo, cfg],
  )

  const rankingBars = useMemo(
    () =>
      ranking.slice(0, 10).map((t) => ({
        id: t.id,
        label: t.nome_fantasia || t.razao_social || t.id,
        value: t.pontuacao,
        color: CLASS_COR[t.classificacao],
      })),
    [ranking],
  )

  const cargasAgrupadas = useMemo(() => {
    const top = [...anuncios]
      .sort((a, b) => b.visualizacoes - a.visualizacoes || b.lances - a.lances)
      .slice(0, 8)
    return top.map((a) => ({
      label: a.numero,
      values: [a.visualizacoes, a.lances, a.aceitaram],
    }))
  }, [anuncios])

  const serieDiaria = useMemo(() => {
    const map = new Map<string, { eventos: number; pontos: number }>()
    for (const h of historico) {
      const k = diaKey(h.created_at)
      if (!k) continue
      const cur = map.get(k) ?? { eventos: 0, pontos: 0 }
      cur.eventos += 1
      cur.pontos += pontosDaRegra(h.tipo, h.pontos, cfg)
      map.set(k, cur)
    }
    const keys = [...map.keys()].sort()
    const last = keys.slice(-14)
    return last.map((k) => {
      const row = map.get(k)!
      return { label: diaLabel(k), eventos: row.eventos, pontos: row.pontos }
    })
  }, [historico, cfg])

  const ganhosPerdas = useMemo(() => {
    let ganho = 0
    let perda = 0
    let zero = 0
    for (const h of historico) {
      const p = pontosDaRegra(h.tipo, h.pontos, cfg)
      if (p > 0) ganho += p
      else if (p < 0) perda += Math.abs(p)
      else zero += 1
    }
    return [
      { label: 'Pontos ganhos', value: ganho, color: '#16a34a' },
      { label: 'Pontos perdidos', value: perda, color: '#dc2626' },
      { label: 'Zero a zero', value: zero, color: '#94a3b8' },
    ]
  }, [historico, cfg])

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ink-muted">
        Visão gráfica da pontuação: funil dos anúncios, status, classificação, ranking, eventos das
        regras e evolução no tempo.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Funil dos anúncios" hint="Barras — visualizações, lances, aceites e recusas">
          <BarrasVerticais items={funil} />
        </ChartCard>
        <ChartCard title="Status dos anúncios" hint="Pizza — quantidade de cargas por situação">
          <PieDonut slices={statusSlices} />
        </ChartCard>
        <ChartCard title="Classificação Ouro / Prata / Bronze" hint="Rosca — faixas do ranking atual">
          <PieDonut slices={classSlices} donut />
        </ChartCard>
        <ChartCard title="Eventos das regras" hint="Barras — quantas vezes cada situação ocorreu">
          <BarrasVerticais
            items={eventosPorTipo.map((e) => ({
              label: e.label.replace('Entrou, ', '').replace('Entrou e ', ''),
              value: e.value,
              color: e.color,
            }))}
          />
        </ChartCard>
        <ChartCard
          title="Top 10 do ranking"
          hint="Barras horizontais — clique para abrir o histórico"
        >
          <BarrasHorizontais items={rankingBars} onClick={onOpenTransportador} />
        </ChartCard>
        <ChartCard title="Ganhos x perdas x zero a zero" hint="Barras — saldo das regras configuradas">
          <BarrasVerticais items={ganhosPerdas} />
        </ChartCard>
        <ChartCard
          title="Anúncios com mais movimento"
          hint="Barras agrupadas — visualizações, lances e aceites por carga"
        >
          <BarrasAgrupadas
            rows={cargasAgrupadas}
            series={[
              { label: 'Visualizações', color: '#0f172a' },
              { label: 'Lances', color: '#f9db00' },
              { label: 'Aceitaram', color: '#16a34a' },
            ]}
          />
        </ChartCard>
        <ChartCard title="Composição dos eventos" hint="Barras empilhadas — participação de cada regra">
          <StackedEventos
            slices={eventosPorTipo.map((e) => ({
              label: e.label,
              value: e.value,
              color: e.color,
            }))}
          />
        </ChartCard>
        <ChartCard title="Eventos por dia" hint="Linha — últimos 14 dias com histórico">
          <LinhaArea
            points={serieDiaria.map((d) => ({ label: d.label, value: d.eventos }))}
            color="#1d4ed8"
          />
        </ChartCard>
        <ChartCard title="Pontos do histórico no tempo" hint="Área — soma diária dos pontos das regras">
          <LinhaArea
            points={serieDiaria.map((d) => ({ label: d.label, value: d.pontos }))}
            area
            color="#0d9488"
            unit=" pts"
          />
        </ChartCard>
        <ChartCard title="Radar das regras" hint="Radar — volume de cada situação de pontuação">
          <RadarRegras
            values={eventosPorTipo.map((e) => ({
              label: e.label,
              value: e.value,
              color: e.color,
            }))}
          />
        </ChartCard>
        <ChartCard title="Impacto em pontos por regra" hint="Barras — eventos × valor do cartão de exemplo">
          <BarrasVerticais
            items={pontosPorTipo.map((e) => ({
              label: e.label.replace('Entrou, ', '').replace('Entrou e ', ''),
              value: e.value,
              color: e.color,
            }))}
          />
        </ChartCard>
      </div>
    </div>
  )
}
