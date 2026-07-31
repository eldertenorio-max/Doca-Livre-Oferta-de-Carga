import { useEffect, useState } from 'react'
import type { Transportador } from '../../types'
import {
  EMPTY_PERFIL_PUBLICO,
  listaParaLinhas,
  linhasParaLista,
  normalizePerfilPublico,
  type PerfilPublicoTransportador,
} from '../../lib/perfilPublicoTransportador'
import { Field, inputClass } from '../ui/Modal'

type Props = {
  value: PerfilPublicoTransportador | null | undefined
  onChange: (next: PerfilPublicoTransportador) => void
  /** Dados da empresa para preview do cabeçalho. */
  empresa?: Pick<
    Transportador,
    | 'nome_fantasia'
    | 'razao_social'
    | 'cidade'
    | 'uf'
    | 'origem_cidade'
    | 'origem_uf'
    | 'cnpj'
    | 'inscricao_estadual'
    | 'logo_url'
  >
}

export function TransportadorPerfilEditor({ value, onChange, empresa }: Props) {
  const [form, setForm] = useState<PerfilPublicoTransportador>(() =>
    normalizePerfilPublico(value ?? EMPTY_PERFIL_PUBLICO),
  )
  const [espText, setEspText] = useState(() =>
    listaParaLinhas(normalizePerfilPublico(value).especialidades),
  )
  const [servText, setServText] = useState(() =>
    listaParaLinhas(normalizePerfilPublico(value).servicos),
  )

  useEffect(() => {
    const n = normalizePerfilPublico(value)
    setForm(n)
    setEspText(listaParaLinhas(n.especialidades))
    setServText(listaParaLinhas(n.servicos))
  }, [value])

  function patch(partial: Partial<PerfilPublicoTransportador>) {
    const next = { ...form, ...partial }
    setForm(next)
    onChange(next)
  }

  const cidade = [empresa?.origem_cidade || empresa?.cidade, empresa?.origem_uf || empresa?.uf]
    .filter(Boolean)
    .join('-')

  return (
    <div className="space-y-3">
      {empresa ? (
        <div className="rounded-lg border border-ink/10 bg-sand-light/50 px-3 py-2 text-xs text-ink-muted">
          Título no perfil:{' '}
          <strong className="text-ink">
            {empresa.nome_fantasia || empresa.razao_social}
            {cidade ? ` ${cidade}` : ''}
          </strong>
        </div>
      ) : null}

      <Field label="Especialidades (uma por linha)">
        <textarea
          className={`${inputClass} min-h-20`}
          placeholder={'Carga Fracionada\nCarga Lotação\nEntregas Urgentes'}
          value={espText}
          onChange={(e) => {
            setEspText(e.target.value)
            patch({ especialidades: linhasParaLista(e.target.value) })
          }}
        />
      </Field>

      <Field label="Apresentação">
        <textarea
          className={`${inputClass} min-h-28`}
          placeholder="Conte a história e o diferencial da transportadora…"
          value={form.apresentacao}
          onChange={(e) => patch({ apresentacao: e.target.value })}
        />
      </Field>

      <Field label="Serviços — introdução">
        <input
          className={inputClass}
          placeholder="Transportando cargas com segurança para todo Brasil."
          value={form.servicos_intro}
          onChange={(e) => patch({ servicos_intro: e.target.value })}
        />
      </Field>

      <Field label="Lista de serviços (um por linha)">
        <textarea
          className={`${inputClass} min-h-24`}
          placeholder={'Carga Fracionada\nCarga Lotação\nArmazenagem'}
          value={servText}
          onChange={(e) => {
            setServText(e.target.value)
            patch({ servicos: linhasParaLista(e.target.value) })
          }}
        />
      </Field>

      <Field label="Referências">
        <textarea
          className={`${inputClass} min-h-20`}
          placeholder="Clientes, parceiros ou depoimentos…"
          value={form.referencias}
          onChange={(e) => patch({ referencias: e.target.value })}
        />
      </Field>

      <Field label="Cobertura / área de atuação">
        <textarea
          className={`${inputClass} min-h-16`}
          placeholder="Ex.: Todo o Brasil, com foco em SP, PR e SC."
          value={form.cobertura}
          onChange={(e) => patch({ cobertura: e.target.value })}
        />
      </Field>

      <Field label="Site (opcional)">
        <input
          className={inputClass}
          type="url"
          placeholder="https://…"
          value={form.site_url}
          onChange={(e) => patch({ site_url: e.target.value })}
        />
      </Field>
    </div>
  )
}
