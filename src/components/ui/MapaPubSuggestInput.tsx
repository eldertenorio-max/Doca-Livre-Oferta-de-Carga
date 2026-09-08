import { useEffect, useId, useRef, useState } from 'react'
import { sugerirEnderecos } from '../../lib/geocodeEndereco'

export type SugestaoPub = {
  key: string
  label: string
  hint: string
  lat?: number
  lng?: number
  kind:
    | 'tipo'
    | 'carroceria'
    | 'cidade'
    | 'uf'
    | 'regiao'
    | 'endereco'
    | 'transportadora'
    | 'texto'
  grupo?: string
  cidade?: string
  uf?: string
  transportadorId?: string
}

type Props = {
  value: string
  onChange: (value: string) => void
  onPick: (item: SugestaoPub) => void
  onSubmit: (value: string) => void
  localSuggestions: (query: string) => SugestaoPub[]
  placeholder?: string
  disabled?: boolean
  className?: string
  minChars?: number
  fetchRemote?: boolean
}

export function MapaPubSuggestInput({
  value,
  onChange,
  onPick,
  onSubmit,
  localSuggestions,
  placeholder,
  disabled,
  className = 'mapa-frota__input',
  minChars = 1,
  fetchRemote = true,
}: Props) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const reqId = useRef(0)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [remote, setRemote] = useState<SugestaoPub[]>([])
  const [loading, setLoading] = useState(false)

  const locais = value.trim().length >= minChars ? localSuggestions(value) : []
  const seen = new Set(locais.map((x) => x.label.toLowerCase()))
  const options = [
    ...locais,
    ...remote.filter((r) => !seen.has(r.label.toLowerCase())),
  ].slice(0, 12)

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

  useEffect(() => {
    const q = value.trim()
    if (!fetchRemote || !open || disabled || q.length < 2) {
      setRemote([])
      setLoading(false)
      return
    }
    const id = ++reqId.current
    setLoading(true)
    const t = window.setTimeout(() => {
      void sugerirEnderecos(q, 8).then((hits) => {
        if (id !== reqId.current) return
        setRemote(
          hits.map((h, i) => ({
            key: `end-${i}-${h.label}`,
            label: h.label,
            hint: h.secondary || 'Endereço',
            lat: h.lat,
            lng: h.lng,
            kind: 'endereco' as const,
            cidade: h.primary,
          })),
        )
        setLoading(false)
      })
    }, 220)
    return () => window.clearTimeout(t)
  }, [value, open, disabled, fetchRemote])

  function pick(item: SugestaoPub) {
    onChange(item.label)
    onPick(item)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="mapa-pub-suggest">
      <input
        className={className}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            return
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            if (show && options[active]) pick(options[active])
            else onSubmit(value)
            setOpen(false)
            return
          }
          if (!show || options.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => Math.min(i + 1, options.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          }
        }}
      />
      {show ? (
        <ul id={listId} role="listbox" className="mapa-pub-suggest__list">
          {loading && options.length === 0 ? (
            <li className="mapa-pub-suggest__empty">Buscando sugestões…</li>
          ) : null}
          {options.map((opt, i) => (
            <li key={opt.key} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`mapa-pub-suggest__item${i === active ? ' is-on' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
                onMouseEnter={() => setActive(i)}
              >
                <strong>{opt.label}</strong>
                <span>{opt.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
