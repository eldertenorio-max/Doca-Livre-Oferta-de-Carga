import { Field, inputClass } from '../ui/Modal'
import {
  MODELOS_LOCALIZADOR,
  MODELOS_RASTREADOR,
  labelModeloRisco,
  parseModeloRiscoOpcao,
  type ModeloRiscoOpcao,
} from '../../lib/cargaExigencias'
import { parseTempC } from '../../lib/termicoVeiculo'
import type { Carga } from '../../types'

type Risco = NonNullable<Carga['gerenciamento_risco']>

export function CargaExigenciasFields({
  risco,
  marcaRastreador,
  marcaLocalizador,
  modeloRastreador,
  modeloLocalizador,
  tempMin,
  tempMax,
  exigeAjudante,
  onChange,
  disabled,
  somenteRisco,
  catalogoRastreador = MODELOS_RASTREADOR,
  catalogoLocalizador = MODELOS_LOCALIZADOR,
}: {
  risco?: Risco | null
  marcaRastreador?: string
  marcaLocalizador?: string
  modeloRastreador?: string
  modeloLocalizador?: string
  tempMin?: number
  tempMax?: number
  exigeAjudante?: boolean
  onChange: (patch: Partial<Carga>) => void
  disabled?: boolean
  /** Só rastreador/localizador + modelo (formulário de distribuição). */
  somenteRisco?: boolean
  catalogoRastreador?: ModeloRiscoOpcao[]
  catalogoLocalizador?: ModeloRiscoOpcao[]
}) {
  const mostraRastreador = risco === 'rastreador' || risco === 'ambos'
  const mostraLocalizador = risco === 'localizador' || risco === 'ambos'

  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {mostraRastreador ? (
        <Field label="Modelo do rastreador">
          <select
            className={inputClass}
            disabled={disabled}
            value={labelModeloRisco(marcaRastreador, modeloRastreador, catalogoRastreador)}
            onChange={(e) => {
              const p = parseModeloRiscoOpcao(e.target.value, catalogoRastreador)
              onChange({
                marca_rastreador: p.marca,
                modelo_rastreador: p.modelo,
              })
            }}
          >
            {catalogoRastreador.map((m) => (
              <option key={m.label} value={m.label}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            Escolha 1 modelo. Só vê a oferta quem tiver esse rastreador na frota.
          </p>
        </Field>
      ) : null}
      {mostraLocalizador ? (
        <Field label="Modelo do localizador">
          <select
            className={inputClass}
            disabled={disabled}
            value={labelModeloRisco(
              marcaLocalizador,
              modeloLocalizador,
              catalogoLocalizador,
            )}
            onChange={(e) => {
              const p = parseModeloRiscoOpcao(e.target.value, catalogoLocalizador)
              onChange({
                marca_localizador: p.marca,
                modelo_localizador: p.modelo,
              })
            }}
          >
            {catalogoLocalizador.map((m) => (
              <option key={m.label} value={m.label}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            Escolha 1 modelo. Só vê a oferta quem tiver esse localizador na frota.
          </p>
        </Field>
      ) : null}
      {somenteRisco ? null : (
        <>
          <div className="col-span-full grid grid-cols-2 gap-1.5">
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
          </div>
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
        </>
      )}
    </div>
  )
}
