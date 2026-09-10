import { useId, useMemo, useState } from 'react'

export type FatiaDonut = {
  id: string
  label: string
  qtd: number
  cor: string
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function fatiaPath(cx: number, cy: number, rIn: number, rOut: number, start: number, end: number) {
  const span = Math.max(0, end - start)
  if (span < 0.4) return ''
  if (span >= 359.2) {
    const a = polar(cx, cy, rOut, 0)
    const b = polar(cx, cy, rOut, 180)
    const c = polar(cx, cy, rIn, 180)
    const d = polar(cx, cy, rIn, 0)
    return [
      `M ${a.x} ${a.y}`,
      `A ${rOut} ${rOut} 0 1 1 ${b.x} ${b.y}`,
      `A ${rOut} ${rOut} 0 1 1 ${a.x} ${a.y}`,
      `L ${d.x} ${d.y}`,
      `A ${rIn} ${rIn} 0 1 0 ${c.x} ${c.y}`,
      `A ${rIn} ${rIn} 0 1 0 ${d.x} ${d.y}`,
      'Z',
    ].join(' ')
  }
  const a0 = polar(cx, cy, rOut, start)
  const a1 = polar(cx, cy, rOut, end)
  const b0 = polar(cx, cy, rIn, end)
  const b1 = polar(cx, cy, rIn, start)
  const large = span > 180 ? 1 : 0
  return `M ${a0.x} ${a0.y} A ${rOut} ${rOut} 0 ${large} 1 ${a1.x} ${a1.y} L ${b0.x} ${b0.y} A ${rIn} ${rIn} 0 ${large} 0 ${b1.x} ${b1.y} Z`
}

type Props = {
  series: FatiaDonut[]
  centro: string
  onSelect?: (id: string) => void
}

export function DonutChart({ series, centro, onSelect }: Props) {
  const uid = useId()
  const [ativa, setAtiva] = useState<string | null>(null)
  const total = series.reduce((s, x) => s + x.qtd, 0) || 1
  const fatias = useMemo(() => {
    let acc = 0
    const gap = series.filter((s) => s.qtd > 0).length > 1 ? 1.4 : 0
    return series
      .filter((s) => s.qtd > 0)
      .map((s) => {
        const start = (acc / total) * 360
        acc += s.qtd
        const end = (acc / total) * 360
        return { ...s, start, end: Math.max(start, end - gap), pct: (s.qtd / total) * 100 }
      })
  }, [series, total])

  const destaque = fatias.find((f) => f.id === ativa) ?? fatias[0]

  return (
    <div className="dash-donut">
      <svg viewBox="0 0 180 180" className="dash-donut__svg" role="img" aria-label={centro}>
        <defs>
          {fatias.map((f) => (
            <linearGradient key={f.id} id={`${uid}-${f.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={f.cor} />
              <stop offset="100%" stopColor={f.cor} stopOpacity="0.72" />
            </linearGradient>
          ))}
        </defs>
        <circle cx="90" cy="90" r="78" fill="#f8fafc" />
        {fatias.map((f) => (
          <path
            key={f.id}
            d={fatiaPath(90, 90, 48, 78, f.start, f.end)}
            fill={`url(#${uid}-${f.id})`}
            className={`dash-donut__fatia${ativa === f.id ? ' is-on' : ''}`}
            onMouseEnter={() => setAtiva(f.id)}
            onMouseLeave={() => setAtiva(null)}
            onClick={() => onSelect?.(f.id)}
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
          >
            <title>
              {f.label}: {f.qtd} ({f.pct.toFixed(0)}%)
            </title>
          </path>
        ))}
        <circle cx="90" cy="90" r="42" fill="#fff" />
        <text x="90" y="86" textAnchor="middle" className="dash-donut__val">
          {destaque ? destaque.qtd : total}
        </text>
        <text x="90" y="104" textAnchor="middle" className="dash-donut__sub">
          {destaque && ativa
            ? destaque.label.length > 18
              ? `${destaque.label.slice(0, 17)}…`
              : destaque.label
            : centro}
        </text>
      </svg>
      <ul className="dash-donut__legenda">
        {series.map((s) => (
          <li
            key={s.id}
            className={ativa === s.id ? 'is-on' : undefined}
            onMouseEnter={() => setAtiva(s.id)}
            onMouseLeave={() => setAtiva(null)}
            onClick={() => onSelect?.(s.id)}
            style={{ cursor: onSelect ? 'pointer' : undefined }}
          >
            <span className="dash-swatch" style={{ background: s.cor }} />
            <span className="dash-donut__nome">{s.label}</span>
            <strong>{s.qtd}</strong>
            <em>{((s.qtd / total) * 100).toFixed(0)}%</em>
          </li>
        ))}
      </ul>
    </div>
  )
}
