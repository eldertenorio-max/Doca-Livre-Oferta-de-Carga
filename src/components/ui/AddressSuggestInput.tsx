import { useEffect, useId, useRef, useState } from 'react'
import {
  aplicarNumeroDigitado,
  sugerirEnderecos,
  type SugestaoEndereco,
} from '../../lib/geocodeEndereco'
import { inputClass } from './Modal'

/** Exemplo de preenchimento (formato BR completo). */
export const PLACEHOLDER_ENDERECO_EXEMPLO =
  'Ex.: Rodovia Castelo Branco, 975 - KM 33 - Itapevi - SP - CEP 06696-000'

type Props = {
  value: string
  onChange: (value: string) => void
  /** Sugestões locais extras (histórico) — só se a busca remota estiver vazia. */
  localSuggestions?: (query: string) => string[]
  placeholder?: string
  disabled?: boolean
  className?: string
  minChars?: number
  onBlur?: () => void
}

/**
 * Campo de endereço com autocomplete estilo Google Maps (Photon / OSM).
 */
export function AddressSuggestInput({
  value,
  onChange,
  localSuggestions,
  placeholder = PLACEHOLDER_ENDERECO_EXEMPLO,
  disabled,
  className,
  minChars = 2,
  onBlur,
}: Props) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const reqId = useRef(0)
  const userIntentRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [remote, setRemote] = useState<SugestaoEndereco[]>([])
  const [loading, setLoading] = useState(false)

  const locais =
    open && remote.length === 0 && value.trim().length >= minChars && localSuggestions
      ? localSuggestions(value).slice(0, 6)
      : []

  const options: Array<{ key: string; label: string; primary: string; secondary: string }> = [
    ...remote.map((r) => ({
      key: `r-${r.label}`,
      label: r.label,
      primary: r.primary,
      secondary: r.secondary,
    })),
    ...locais.map((s) => ({
      key: `l-${s}`,
      label: s,
      primary: s,
      secondary: '',
    })),
  ]

  const show =
    open &&
    !disabled &&
    value.trim().length >= minChars &&
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

  // Debounce curto (estilo Maps)
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
        setRemote(hits)
        setLoading(false)
      })
    }, 220)
    return () => {
      window.clearTimeout(t)
    }
  }, [value, open, disabled, minChars])

  function pick(opt: { label: string }, index: number) {
    const rem = remote[index]
    if (rem && options[index]?.key.startsWith('r-')) {
      onChange(aplicarNumeroDigitado(rem, value))
    } else {
      onChange(opt.label)
    }
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
        spellCheck={false}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        onPointerDown={() => {
          userIntentRef.current = true
        }}
        onFocus={() => {
          if (userIntentRef.current) setOpen(true)
          userIntentRef.current = false
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
            pick(options[active], active)
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
          {loading && options.length === 0 && (
            <li className="px-3 py-2 text-[11px] text-ink-muted">Buscando endereços…</li>
          )}
          {options.map((opt, i) => (
            <li key={`${opt.key}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`block w-full px-3 py-2 text-left ${
                  i === active ? 'bg-brand/10' : 'hover:bg-sand-light'
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt, i)}
                onMouseEnter={() => setActive(i)}
              >
                <span className="block text-sm font-medium text-ink">{opt.primary}</span>
                {opt.secondary ? (
                  <span className="mt-0.5 block text-[11px] text-ink-muted">{opt.secondary}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
