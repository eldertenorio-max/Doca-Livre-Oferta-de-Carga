import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  CARROCERIAS_POR_GRUPO,
  GRUPOS_CARROCERIA,
  TIPOS_CARROCERIA,
  toggleCarroceria,
} from '../../lib/tiposCarroceria'

type Props = {
  value: string[]
  onChange: (next: string[]) => void
  /** Classe no wrapper (ex.: mapa-frota). */
  className?: string
  label?: string
}

/**
 * Um só campo de filtro: lista todas as carrocerias em painel compacto (multi-select).
 */
export function CarroceriaFilterSelect({
  value,
  onChange,
  className = '',
  label = 'Carroceria',
}: Props) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const summary = useMemo(() => {
    if (value.length === 0) return 'Todas as carrocerias'
    if (value.length === 1) return value[0]
    if (value.length <= 3) return value.join(', ')
    return `${value.slice(0, 2).join(', ')} +${value.length - 2}`
  }, [value])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle(item: string) {
    onChange(toggleCarroceria(value, item))
  }

  return (
    <div
      ref={wrapRef}
      className={`carroceria-filter ${className}`.trim()}
      data-open={open ? 'true' : 'false'}
    >
      {label ? <p className="mapa-frota__tipos-label">{label}</p> : null}
      <button
        type="button"
        className="carroceria-filter__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="carroceria-filter__summary">{summary}</span>
        <span className="carroceria-filter__chev" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open ? (
        <div id={listId} className="carroceria-filter__panel" role="listbox" aria-multiselectable>
          <div className="carroceria-filter__panel-head">
            <button
              type="button"
              className="carroceria-filter__link"
              onClick={() => onChange([])}
            >
              Limpar
            </button>
            <button
              type="button"
              className="carroceria-filter__link"
              onClick={() => onChange([...TIPOS_CARROCERIA])}
            >
              Todas
            </button>
          </div>
          {GRUPOS_CARROCERIA.map((grupo) => (
            <div key={grupo} className="carroceria-filter__grupo">
              <p className="carroceria-filter__grupo-title">{grupo}</p>
              <ul className="carroceria-filter__list">
                {CARROCERIAS_POR_GRUPO[grupo].map((item) => {
                  const on = value.includes(item)
                  return (
                    <li key={item}>
                      <label className={`carroceria-filter__item${on ? ' is-on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(item)}
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
      ) : null}
    </div>
  )
}
