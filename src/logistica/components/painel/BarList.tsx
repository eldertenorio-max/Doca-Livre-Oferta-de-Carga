type Item = {
  id: string
  label: string
  qtd: number
  cor: string
  emoji?: string
}

type Props = {
  items: Item[]
  max: number
  onSelect?: (id: string) => void
}

export function BarList({ items, max, onSelect }: Props) {
  const teto = Math.max(1, max)
  return (
    <ul className="dash-bars">
      {items.map((item, i) => (
        <li key={item.id} style={{ animationDelay: `${i * 40}ms` }}>
          <button
            type="button"
            className="dash-bars__row"
            onClick={() => onSelect?.(item.id)}
            disabled={!onSelect}
          >
            <span className="dash-bars__label">
              {item.emoji ? <i aria-hidden>{item.emoji}</i> : null}
              {item.label}
            </span>
            <span className="dash-bars__track">
              <span
                className="dash-bars__fill"
                style={{
                  width: `${Math.max(4, (item.qtd / teto) * 100)}%`,
                  background: `linear-gradient(90deg, color-mix(in srgb, ${item.cor} 55%, #fff), ${item.cor})`,
                }}
              />
            </span>
            <strong>{item.qtd}</strong>
          </button>
        </li>
      ))}
    </ul>
  )
}
