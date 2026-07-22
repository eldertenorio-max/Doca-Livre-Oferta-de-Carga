import { useEffect, useId, useMemo, useRef, useState, type HTMLAttributes } from 'react'
import { inputClass } from './Modal'

type Props = {
  value: string
  onChange: (value: string) => void
  /** Lista fixa ou função conforme o que o usuário digitou */
  suggestions: string[] | ((query: string) => string[])
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Mínimo de caracteres para abrir a lista (0 = sempre com foco) */
  minChars?: number
  onBlur?: () => void
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
}

export function SuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
  disabled,
  className,
  minChars = 0,
  onBlur,
  inputMode,
}: Props) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const options = useMemo(() => {
    if (typeof suggestions === 'function') return suggestions(value)
    const q = value.trim().toLowerCase()
    if (!q) return suggestions.slice(0, 12)
    return suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 12)
  }, [suggestions, value])

  const show =
    open &&
    !disabled &&
    value.trim().length >= minChars &&
    options.length > 0

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
        inputMode={inputMode}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (!show) return
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
          className="absolute z-40 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-ink/15 bg-white py-1 shadow-lg"
        >
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
