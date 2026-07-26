import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  GRUPOS_VEICULO,
  VEICULOS_POR_GRUPO,
  type GrupoVeiculo,
} from '../../lib/tiposVeiculo'
import { inputClass } from './Modal'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  onBlur?: () => void
}

type FlatOpt = { grupo: GrupoVeiculo; item: string }

/**
 * Campo de veículo com sugestões agrupadas: Pesados / Médios / Leves.
 */
export function VeiculoSuggestInput({
  value,
  onChange,
  placeholder = 'Carreta, Truck, Fiorino…',
  disabled,
  className,
  onBlur,
}: Props) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const flat = useMemo(() => {
    const q = value.trim().toLowerCase()
    const exact = GRUPOS_VEICULO.some((g) =>
      VEICULOS_POR_GRUPO[g].some((t) => t.toLowerCase() === q),
    )
    const out: FlatOpt[] = []
    for (const grupo of GRUPOS_VEICULO) {
      for (const item of VEICULOS_POR_GRUPO[grupo]) {
        if (!q || exact || item.toLowerCase().includes(q)) {
          out.push({ grupo, item })
        }
      }
    }
    if (out.length === 0) {
      for (const grupo of GRUPOS_VEICULO) {
        for (const item of VEICULOS_POR_GRUPO[grupo]) {
          out.push({ grupo, item })
        }
      }
    }
    return out
  }, [value])

  const grouped = useMemo(() => {
    const map = new Map<GrupoVeiculo, string[]>()
    for (const { grupo, item } of flat) {
      const list = map.get(grupo) ?? []
      list.push(item)
      map.set(grupo, list)
    }
    return GRUPOS_VEICULO.map((g) => ({ grupo: g, items: map.get(g) ?? [] })).filter(
      (g) => g.items.length > 0,
    )
  }, [flat])

  const show = open && !disabled && flat.length > 0

  useEffect(() => {
    setActive(0)
  }, [value, open])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(opt: string) {
    onChange(opt)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        className={className ?? inputClass}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={(e) => {
          setOpen(true)
          e.currentTarget.select()
        }}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (!show) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => Math.min(i + 1, flat.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' && flat[active]) {
            e.preventDefault()
            pick(flat[active].item)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {show && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-ink/15 bg-white py-1 shadow-lg"
        >
          {(() => {
            let idx = 0
            return grouped.map(({ grupo, items }) => (
              <li key={grupo} className="list-none">
                <div className="sticky top-0 bg-white px-3 pb-0.5 pt-2 text-xs font-bold text-ink">
                  {grupo}
                </div>
                <ul>
                  {items.map((item) => {
                    const i = idx++
                    return (
                      <li key={item} role="option" aria-selected={i === active}>
                        <button
                          type="button"
                          className={`block w-full px-3 py-1.5 text-left text-xs ${
                            i === active
                              ? 'bg-brand/10 font-semibold text-ink'
                              : 'text-ink/80 hover:bg-sand-light'
                          }`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pick(item)}
                          onMouseEnter={() => setActive(i)}
                        >
                          {item}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))
          })()}
        </ul>
      )}
    </div>
  )
}
