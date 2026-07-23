import { useMemo } from 'react'
import { formatCnpj, isValidCnpj, cnpjDigits } from '../../lib/cnpj'
import { filtrarSugestoes } from '../../lib/cidadesBrasil'
import { SuggestInput } from './SuggestInput'

type Props = {
  value: string
  onChange: (value: string) => void
  suggestions?: string[]
  placeholder?: string
  disabled?: boolean
  required?: boolean
  /** Quando false, oculta o texto de validação (útil se o pai mostra status próprio). */
  showHint?: boolean
}

export function CnpjInput({
  value,
  onChange,
  suggestions = [],
  placeholder = '00.000.000/0000-00',
  disabled,
  showHint = true,
}: Props) {
  const digits = cnpjDigits(value)
  const completo = digits.length === 14
  const valido = completo && isValidCnpj(value)

  const sugFn = useMemo(
    () => (q: string) => {
      const formattedHist = suggestions.map((s) => formatCnpj(s)).filter(Boolean)
      return filtrarSugestoes(formatCnpj(q) || q, [formattedHist], 8)
    },
    [suggestions],
  )

  return (
    <div className="space-y-1">
      <SuggestInput
        value={value}
        onChange={(raw) => onChange(formatCnpj(raw))}
        suggestions={sugFn}
        placeholder={placeholder}
        disabled={disabled}
        inputMode="numeric"
      />
      {showHint && digits.length > 0 && (
        <p
          className={`text-[11px] ${
            completo
              ? valido
                ? 'text-emerald-700'
                : 'text-brand'
              : 'text-ink-muted'
          }`}
        >
          {completo
            ? valido
              ? 'CNPJ reconhecido e válido.'
              : 'CNPJ incompleto ou inválido — confira os dígitos.'
            : `Digitando CNPJ… ${digits.length}/14`}
        </p>
      )}
    </div>
  )
}
