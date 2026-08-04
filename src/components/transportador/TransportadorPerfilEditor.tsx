import { useEffect, useRef, useState } from 'react'
import type { Transportador } from '../../types'
import {
  EMPTY_PERFIL_PUBLICO,
  GALERIA_PERFIL_MAX,
  compactGaleriaSlots,
  galeriaSlots,
  listaParaLinhas,
  linhasParaLista,
  normalizePerfilPublico,
  type PerfilPublicoTransportador,
} from '../../lib/perfilPublicoTransportador'
import { fileToDataUrl, isAcceptedImageFile } from '../../lib/veiculoFotos'
import { ImageCropModal } from '../ui/ImageCropModal'
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
  /** 5 slots fixos no editor (ordem igual ao Ver perfil). */
  const [slots, setSlots] = useState<string[]>(() =>
    galeriaSlots(normalizePerfilPublico(value).galeria),
  )
  const [cropSlot, setCropSlot] = useState<number | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [fotoErro, setFotoErro] = useState('')
  const fileRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    const n = normalizePerfilPublico(value)
    setForm(n)
    setEspText(listaParaLinhas(n.especialidades))
    setServText(listaParaLinhas(n.servicos))
    setSlots(galeriaSlots(n.galeria))
  }, [value])

  function patch(partial: Partial<PerfilPublicoTransportador>) {
    const next = { ...form, ...partial }
    setForm(next)
    onChange(next)
  }

  function commitSlots(nextSlots: string[]) {
    setSlots(nextSlots)
    const galeria = compactGaleriaSlots(nextSlots)
    const full = { ...form, galeria }
    setForm(full)
    onChange(full)
  }

  function applySlot(index: number, url: string) {
    const next = [...slots]
    next[index] = url
    commitSlots(next)
  }

  function clearSlot(index: number) {
    const next = [...slots]
    next[index] = ''
    commitSlots(next)
  }

  function onPickFile(index: number, file: File | undefined) {
    if (!file) return
    if (!isAcceptedImageFile(file)) {
      setFotoErro('Use JPG, PNG ou WEBP.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setFotoErro('Cada imagem deve ter no máximo 5 MB.')
      return
    }
    setFotoErro('')
    setCropSlot(index)
    setCropFile(file)
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

      <div className="rounded-xl border border-ink/10 bg-sand-light/40 p-3">
        <p className="text-sm font-semibold text-ink">Personalize sua página</p>
        <p className="mt-1 text-xs text-ink-muted">
          Até {GALERIA_PERFIL_MAX} imagens exibidas abaixo do mapa no “Ver perfil”.
        </p>
        <div
          className="mt-3 grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}
        >
          {slots.map((src, index) => (
            <div
              key={index}
              className="relative flex aspect-square flex-col overflow-hidden rounded-lg border border-ink/12 bg-white"
            >
              {src ? (
                <>
                  <img
                    src={src}
                    alt={`Foto ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    onClick={() => clearSlot(index)}
                  >
                    Remover
                  </button>
                  <button
                    type="button"
                    className="absolute bottom-1 left-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink shadow"
                    onClick={() => fileRefs.current[index]?.click()}
                  >
                    Trocar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-center text-[11px] font-semibold text-ink-muted hover:bg-sand-light"
                  onClick={() => fileRefs.current[index]?.click()}
                >
                  <span className="text-lg leading-none">+</span>
                  Foto {index + 1}
                </button>
              )}
              <input
                ref={(el) => {
                  fileRefs.current[index] = el
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  onPickFile(index, e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
          ))}
        </div>
        {fotoErro ? <p className="mt-2 text-xs text-red-700">{fotoErro}</p> : null}
      </div>

      <ImageCropModal
        open={cropSlot != null && Boolean(cropFile)}
        file={cropFile}
        shape="square"
        title={`Ajustar foto ${cropSlot != null ? cropSlot + 1 : ''}`}
        onCancel={() => {
          setCropSlot(null)
          setCropFile(null)
        }}
        onConfirm={(file) => {
          const idx = cropSlot
          setCropSlot(null)
          setCropFile(null)
          if (idx == null) return
          void fileToDataUrl(file).then((url) => applySlot(idx, url))
        }}
      />
    </div>
  )
}
