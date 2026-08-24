import { Field, inputClass } from '../ui/Modal'
import {
  MARCAS_LOCALIZADOR,
  MARCAS_RASTREADOR,
  MARCA_SEM_ESPECIFICA,
} from '../../lib/cargaExigencias'
import { parseTempC } from '../../lib/termicoVeiculo'
import type { Carga } from '../../types'

type Risco = NonNullable<Carga['gerenciamento_risco']>

export function CargaExigenciasFields({
  risco,
  marcaRastreador,
  marcaLocalizador,
  tempMin,
  tempMax,
  exigeAjudante,
  onChange,
  disabled,
}: {
  risco?: Risco | null
  marcaRastreador?: string
  marcaLocalizador?: string
  tempMin?: number
  tempMax?: number
  exigeAjudante?: boolean
  onChange: (patch: Partial<Carga>) => void
  disabled?: boolean
}) {
  const mostraRastreador = risco === 'rastreador' || risco === 'ambos'
  const mostraLocalizador = risco === 'localizador' || risco === 'ambos'

  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {mostraRastreador ? (
        <Field label="Marca do rastreador">
          <select
            className={inputClass}
            disabled={disabled}
            value={marcaRastreador || MARCA_SEM_ESPECIFICA}
            onChange={(e) => onChange({ marca_rastreador: e.target.value })}
          >
            {MARCAS_RASTREADOR.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {mostraLocalizador ? (
        <Field label="Marca do localizador">
          <select
            className={inputClass}
            disabled={disabled}
            value={marcaLocalizador || MARCA_SEM_ESPECIFICA}
            onChange={(e) => onChange({ marca_localizador: e.target.value })}
          >
            {MARCAS_LOCALIZADOR.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Temperatura mínima (°C)">
        <input
          className={inputClass}
          type="number"
          step={0.5}
          min={-50}
          max={40}
          disabled={disabled}
          placeholder="Ex.: -18"
          value={tempMin ?? ''}
          onChange={(e) =>
            onChange({
              temp_min: e.target.value === '' ? undefined : parseTempC(e.target.value),
            })
          }
        />
      </Field>
      <Field label="Temperatura máxima (°C)">
        <input
          className={inputClass}
          type="number"
          step={0.5}
          min={-50}
          max={40}
          disabled={disabled}
          placeholder="Ex.: 7"
          value={tempMax ?? ''}
          onChange={(e) =>
            onChange({
              temp_max: e.target.value === '' ? undefined : parseTempC(e.target.value),
            })
          }
        />
      </Field>
      <Field label="Exige ajudante">
        <select
          className={inputClass}
          disabled={disabled}
          value={exigeAjudante ? 'sim' : 'nao'}
          onChange={(e) => onChange({ exige_ajudante: e.target.value === 'sim' })}
        >
          <option value="nao">Não</option>
          <option value="sim">Sim</option>
        </select>
      </Field>
    </div>
  )
}
