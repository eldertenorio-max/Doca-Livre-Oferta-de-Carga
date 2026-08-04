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
    | 'id'
  >
}

export function TransportadorPerfilEditor({ value, onChange, empresa }: Props) {
  const [form, setForm] = useState<PerfilPublicoTransportador>(() =>
    normalizePerfilPublico(value ?? EMPTY_PERFIL_PUBLICO),
  )
  const formRef = useRef(form)
  formRef.current = form

  const [espText, setEspText] = useState(() =>
    listaParaLinhas(normalizePerfilPublico(value).especialidades),
  )
  const [servText, setServText] = useState(() =>
    listaParaLinhas(normalizePerfilPublico(value).servicos),
  )
  const [slots, setSlots] = useState<string[]>(() =>
    galeriaSlots(normalizePerfilPublico(value).galeria),
  )
  const [fotoErro, setFotoErro] = useState('')
  const [fotoBusy, setFotoBusy] = useState(false)
  const [cropSlot, setCropSlot] = useState<number | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const cropSlotRef = useRef<number | null>(null)

  // Hidrata só ao trocar de empresa (evita apagar fotos enquanto o usuário edita)
  const empresaKey = empresa?.id ?? 'sem-empresa'
  useEffect(() => {
    const n = normalizePerfilPublico(value)
    setForm(n)
    formRef.current = n
    setEspText(listaParaLinhas(n.especialidades))
    setServText(listaParaLinhas(n.servicos))
    setSlots(galeriaSlots(n.galeria))
    setFotoErro('')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value só na troca de empresa
  }, [empresaKey])

  function patch(partial: Partial<PerfilPublicoTransportador>) {
    const next = { ...formRef.current, ...partial }
    formRef.current = next
    setForm(next)
    onChange(next)
  }

  function applySlotUrl(index: number, url: string) {
    setSlots((prev) => {
      const next = [...prev]
      next[index] = url
      const galeria = compactGaleriaSlots(next)
      const full = { ...formRef.current, galeria }
      formRef.current = full
      setForm(full)
      onChange(full)
      return next
    })
  }

  function clearSlot(index: number) {
    setSlots((prev) => {
      const next = [...prev]
      next[index] = ''
      const galeria = compactGaleriaSlots(next)
      const full = { ...formRef.current, galeria }
      formRef.current = full
      setForm(full)
      onChange(full)
      return next
    })
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
    cropSlotRef.current = index
    setCropSlot(index)
    setCropFile(file)
  }

  function fecharCrop() {
    cropSlotRef.current = null
    setCropSlot(null)
    setCropFile(null)
    setFotoBusy(false)
  }

  function confirmarCrop(file: File) {
    const idx = cropSlotRef.current
    if (idx == null) {
      fecharCrop()
      return
    }
    setFotoBusy(true)
    void fileToDataUrl(file)
      .then((url) => {
        applySlotUrl(idx, url)
        fecharCrop()
      })
      .catch(() => {
        setFotoErro('Não foi possível aplicar o recorte. Tente outra foto.')
        setFotoBusy(false)
      })
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
          Até {GALERIA_PERFIL_MAX} imagens abaixo do mapa no “Ver perfil”. Clique no
          quadro, escolha a foto e ajuste o recorte (zoom e posição).
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
                <img
                  src={src}
                  alt={`Foto ${index + 1}`}
                  className="pointer-events-none h-full w-full object-cover"
                />
              ) : (
                <div className="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-center text-[11px] font-semibold text-ink-muted">
                  <span className="text-lg leading-none">+</span>
                  Foto {index + 1}
                </div>
              )}

              <label
                className="absolute inset-0 z-[1] cursor-pointer"
                title={src ? 'Trocar / editar foto' : `Adicionar foto ${index + 1}`}
              >
                <span
                  style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: 'hidden',
                    clip: 'rect(0,0,0,0)',
                    whiteSpace: 'nowrap',
                    border: 0,
                  }}
                >
                  {src ? `Editar foto ${index + 1}` : `Adicionar foto ${index + 1}`}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/jpg,.jpg,.jpeg,.png,.webp"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  disabled={fotoBusy || cropFile != null}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    onPickFile(index, f)
                  }}
                />
              </label>

              {src ? (
                <button
                  type="button"
                  className="absolute right-1 top-1 z-[2] rounded bg-ink/85 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    clearSlot(index)
                  }}
                >
                  Remover
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {fotoErro ? <p className="mt-2 text-xs text-red-700">{fotoErro}</p> : null}
      </div>

      <ImageCropModal
        open={cropSlot != null && Boolean(cropFile)}
        file={cropFile}
        shape="square"
        title={
          cropSlot != null ? `Ajustar foto ${cropSlot + 1}` : 'Ajustar foto'
        }
        busy={fotoBusy}
        onCancel={fecharCrop}
        onConfirm={confirmarCrop}
      />
    </div>
  )
}
