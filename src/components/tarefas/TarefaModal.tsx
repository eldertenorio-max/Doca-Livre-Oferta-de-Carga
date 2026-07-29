import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { isAcceptedImageFile, fileToDataUrl } from '../../lib/veiculoFotos'
import { COLUNAS_TAREFAS, labelPrioridade } from '../../lib/tarefasColumns'
import { newTarefaId, upsertTarefa, excluirTarefa } from '../../lib/tarefasStorage'
import type { PrioridadeTarefa, StatusTarefa, Tarefa } from '../../types'
import { Button, Field, Modal, inputClass } from '../ui/Modal'

type Props = {
  open: boolean
  transportadorId: string
  tarefa: Tarefa | null
  defaultStatus?: StatusTarefa
  onClose: () => void
  onSaved: (t: Tarefa) => void
  onDeleted?: (id: string) => void
}

const PRIORIDADES: PrioridadeTarefa[] = ['baixa', 'media', 'alta', 'urgente']

export function TarefaModal({
  open,
  transportadorId,
  tarefa,
  defaultStatus = 'pendente',
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [status, setStatus] = useState<StatusTarefa>(defaultStatus)
  const [prioridade, setPrioridade] = useState<PrioridadeTarefa>('media')
  const [responsavel, setResponsavel] = useState('')
  const [solicitadoPor, setSolicitadoPor] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [prazo, setPrazo] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [imagens, setImagens] = useState<string[]>([])
  const [erro, setErro] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (tarefa) {
      setTitulo(tarefa.titulo)
      setDescricao(tarefa.descricao ?? '')
      setStatus(tarefa.status)
      setPrioridade(tarefa.prioridade)
      setResponsavel(tarefa.responsavel ?? '')
      setSolicitadoPor(tarefa.solicitado_por ?? '')
      setDataInicio(tarefa.data_inicio?.slice(0, 10) ?? '')
      setPrazo(tarefa.prazo_entrega?.slice(0, 10) ?? '')
      setTags([...(tarefa.tags ?? [])])
      setImagens([...(tarefa.imagens ?? [])])
    } else {
      setTitulo('')
      setDescricao('')
      setStatus(defaultStatus)
      setPrioridade('media')
      setResponsavel('')
      setSolicitadoPor('')
      setDataInicio('')
      setPrazo('')
      setTags([])
      setImagens([])
    }
    setTagDraft('')
    setErro('')
  }, [open, tarefa, defaultStatus])

  async function onPickImage(file: File | null) {
    if (!file) return
    setErro('')
    if (!isAcceptedImageFile(file)) {
      setErro('Use JPG, PNG ou WEBP (máx. 5MB).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErro('Imagem acima de 5MB.')
      return
    }
    if (imagens.length >= 3) {
      setErro('Máximo de 3 imagens.')
      return
    }
    const url = await fileToDataUrl(file)
    setImagens((prev) => [...prev, url].slice(0, 3))
  }

  function addTag() {
    const t = tagDraft.trim()
    if (!t) return
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setTagDraft('')
      return
    }
    setTags((prev) => [...prev, t].slice(0, 8))
    setTagDraft('')
  }

  function save() {
    const t = titulo.trim()
    if (!t) {
      setErro('Informe o título da tarefa.')
      return
    }
    if (!transportadorId) {
      setErro('Transportadora não identificada.')
      return
    }
    const agora = new Date().toISOString()
    const salvo = upsertTarefa({
      id: tarefa?.id ?? newTarefaId(),
      transportador_id: transportadorId,
      titulo: t,
      descricao: descricao.trim() || undefined,
      status,
      prioridade,
      responsavel: responsavel.trim() || undefined,
      solicitado_por: solicitadoPor.trim() || undefined,
      tags,
      imagens,
      data_inicio: dataInicio || null,
      prazo_entrega: prazo || null,
      created_at: tarefa?.created_at ?? agora,
      updated_at: agora,
    })
    onSaved(salvo)
    onClose()
  }

  function remove() {
    if (!tarefa) return
    if (!window.confirm(`Excluir a tarefa "${tarefa.titulo}"?`)) return
    excluirTarefa(tarefa.id)
    onDeleted?.(tarefa.id)
    onClose()
  }

  return (
    <Modal open={open} title={tarefa ? 'Editar tarefa' : 'Nova Tarefa'} onClose={onClose} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <Field label="Título da Tarefa *">
            <input
              className={inputClass}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Ajustar layout do Kanban"
            />
          </Field>
          <Field label="Descrição">
            <textarea
              className={`${inputClass} min-h-28`}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Escreva os detalhes sobre esta atividade…"
            />
          </Field>
          <div>
            <p className="mb-1 text-xs font-bold text-black">
              Imagens de Exemplo ({imagens.length}/3)
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                e.target.value = ''
                void onPickImage(f)
              }}
            />
            <button
              type="button"
              className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-sky-300 bg-sky-50/60 px-3 py-4 text-center text-xs font-semibold text-sky-900"
              onClick={() => fileRef.current?.click()}
              disabled={imagens.length >= 3}
            >
              Clique ou arraste uma imagem aqui
              <span className="font-medium text-sky-700/80">
                PNG, JPG, WEBP (máx 5MB) — {3 - imagens.length} restante(s)
              </span>
            </button>
            {imagens.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {imagens.map((src, i) => (
                  <div key={i} className="relative h-16 w-16 overflow-hidden rounded-md border border-ink/15">
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      className="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[10px] font-bold text-white"
                      onClick={() => setImagens((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Data de Início">
              <input
                type="date"
                className={inputClass}
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </Field>
            <Field label="Prazo de Entrega">
              <input
                type="date"
                className={inputClass}
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="space-y-3">
          <Field label="Status">
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusTarefa)}
            >
              {COLUNAS_TAREFAS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prioridade">
            <select
              className={inputClass}
              value={prioridade}
              onChange={(e) => setPrioridade(e.target.value as PrioridadeTarefa)}
            >
              {PRIORIDADES.map((p) => (
                <option key={p} value={p}>
                  {labelPrioridade(p)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsável">
            <input
              className={inputClass}
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="Nome do responsável"
            />
          </Field>
          <Field label="Solicitado Por">
            <input
              className={inputClass}
              value={solicitadoPor}
              onChange={(e) => setSolicitadoPor(e.target.value)}
              placeholder="Quem pediu a tarefa"
            />
          </Field>
          <Field label="Tags">
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder="Nova tag…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag()
                  }
                }}
              />
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-600 text-white"
                onClick={addTag}
                title="Adicionar tag"
              >
                <Plus size={16} />
              </button>
            </div>
            {tags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="rounded bg-sand-light px-2 py-0.5 text-[11px] font-semibold text-ink hover:bg-red-50 hover:text-red-700"
                    onClick={() => setTags((prev) => prev.filter((x) => x !== tag))}
                    title="Remover"
                  >
                    {tag} ×
                  </button>
                ))}
              </div>
            ) : null}
          </Field>
        </div>
      </div>

      {erro ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
          {erro}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {tarefa ? (
          <Button variant="danger" className="mr-auto" onClick={remove}>
            <Trash2 size={14} /> Excluir
          </Button>
        ) : null}
        <Button variant="ghost" className="border border-ink/15" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" onClick={save}>
          Salvar
        </Button>
      </div>
    </Modal>
  )
}
