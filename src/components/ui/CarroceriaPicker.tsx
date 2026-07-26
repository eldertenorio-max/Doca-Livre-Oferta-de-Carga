import {
  CARROCERIAS_POR_GRUPO,
  GRUPOS_CARROCERIA,
  toggleCarroceria,
  type GrupoCarroceria,
} from '../../lib/tiposCarroceria'

type Props = {
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  /** Título da seção (default: Carroceria). */
  title?: string
  className?: string
}

/** Multi-seleção de tipos de carroceria (Abertas / Fechadas / Especiais). */
export function CarroceriaPicker({
  value,
  onChange,
  disabled,
  title = 'Carroceria',
  className,
}: Props) {
  const selected = new Set(value)

  return (
    <div className={className}>
      {title ? (
        <h3 className="mb-2 text-base font-bold text-ink">{title}</h3>
      ) : null}
      <div className="space-y-3 rounded-xl border border-ink/10 bg-white px-3 py-3">
        {GRUPOS_CARROCERIA.map((grupo) => (
          <div key={grupo}>
            <p className="mb-1.5 text-sm font-bold text-ink">{grupo}</p>
            <ul className="space-y-1">
              {CARROCERIAS_POR_GRUPO[grupo as GrupoCarroceria].map((item) => {
                const id = `carroceria-${grupo}-${item}`.replace(/\s+/g, '-')
                const checked = selected.has(item)
                return (
                  <li key={item}>
                    <label
                      htmlFor={id}
                      className={`inline-flex cursor-pointer items-center gap-2 text-sm ${
                        disabled ? 'cursor-not-allowed opacity-60' : 'text-ink/80'
                      }`}
                    >
                      <input
                        id={id}
                        type="checkbox"
                        className="h-4 w-4 rounded border-ink/30 text-brand focus:ring-brand/40"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => onChange(toggleCarroceria(value, item))}
                      />
                      <span>{item}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      {value.length > 0 && (
        <p className="mt-1.5 text-[11px] text-ink-muted">
          Selecionado: {value.join(', ')}
        </p>
      )}
    </div>
  )
}
