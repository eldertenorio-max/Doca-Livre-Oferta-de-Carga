import { useEffect, useId, useRef, useState } from 'react'
import { sugerirEnderecos } from '../../lib/geocodeEndereco'
import { inputClass } from './Modal'

type Props = {
  value: string
  onChange: (value: string) => void
  /** Sugestões locais extras (cidades, histórico) — aparecem junto com o Maps. */
  localSuggestions?: (query: string) => string[]
  placeholder?: string
  disabled?: boolean
  className?: string
  minChars?: number
  onBlur?: () => void
}

/**
 * Campo de endereço com sugestões estilo Maps (Nominatim) + lista local opcional.
 */
export function AddressSuggestInput({
  value,
  onChange,
  localSuggestions,
  placeholder,
  disabled,
  className,
  minChars = 3,
  onBlur,
}: Props) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const reqId = useRef(0)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [remote, setRemote] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const locais =
    open && value.trim().length >= Math.min(2, minChars) && localSuggestions
      ? localSuggestions(value)
      : []

  // Remotas primeiro (endereço completo); locais preenchem o restante sem duplicar
  const options: string[] = []
  const seen = new Set<string>()
  for (const s of [...remote, ...locais]) {
    const k = s.trim().toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    options.push(s)
    if (options.length >= 12) break
  }

  const show =
    open &&
    !disabled &&
    value.trim().length >= Math.min(2, minChars) &&
    (options.length > 0 || loading)

  useEffect(() => {
    setActive(0)
  }, [value, open, remote])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Debounce da busca no Nominatim
  useEffect(() => {
    const q = value.trim()
    if (!open || disabled || q.length < minChars) {
      setRemote([])
      setLoading(false)
      return
    }
    const id = ++reqId.current
    setLoading(true)
    const t = window.setTimeout(() => {
      void sugerirEnderecos(q, 8).then((hits) => {
        if (id !== reqId.current) return
        setRemote(hits.map((h) => h.label))
        setLoading(false)
      })
    }, 380)
    return () => {
      window.clearTimeout(t)
    }
  }, [value, open, disabled, minChars])

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
          if (!show || options.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => Math.min(i + 1, options.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' && options[active]) {
            e.preventDefault()
            pick(options[active])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {show && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-ink/15 bg-white py-1 shadow-lg"
        >
          {loading && options.length === 0 && (
            <li className="px-3 py-2 text-[11px] text-ink-muted">Buscando endereços…</li>
          )}
          {options.map((opt, i) => (
            <li key={`${opt}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-xs ${
                  i === active ? 'bg-brand/10 font-semibold text-ink' : 'text-ink hover:bg-sand-light'
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
                onMouseEnter={() => setActive(i)}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
