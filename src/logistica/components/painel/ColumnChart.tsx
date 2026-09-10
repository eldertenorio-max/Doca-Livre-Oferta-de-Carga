type Coluna = {
  id: string
  label: string
  qtd: number
}

type Props = {
  items: Coluna[]
  max: number
  cor?: string
}

export function ColumnChart({ items, max, cor = '#ca8a04' }: Props) {
  const teto = Math.max(1, max)
  const h = 160
  const gap = 8
  const w = Math.max(items.length * 28, 220)
  const barW = Math.max(10, (w - gap * (items.length + 1)) / items.length)

  return (
    <div className="dash-cols">
      <svg viewBox={`0 0 ${w} ${h + 28}`} className="dash-cols__svg" role="img" aria-label="Empresas por estado">
        {[0.25, 0.5, 0.75, 1].map((p) => (
          <line
            key={p}
            x1={0}
            x2={w}
            y1={h - p * h}
            y2={h - p * h}
            className="dash-cols__grid"
          />
        ))}
        {items.map((item, i) => {
          const bh = Math.max(4, (item.qtd / teto) * h)
          const x = gap + i * (barW + gap)
          const y = h - bh
          return (
            <g key={item.id}>
              <title>
                {item.label}: {item.qtd}
              </title>
              <rect
                x={x}
                y={y}
                width={barW}
                height={bh}
                rx="4"
                fill={cor}
                className="dash-cols__bar"
                style={{ animationDelay: `${i * 35}ms` }}
              />
              <text x={x + barW / 2} y={h + 16} textAnchor="middle" className="dash-cols__lbl">
                {item.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
