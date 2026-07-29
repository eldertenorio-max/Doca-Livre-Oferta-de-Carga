import { classPrioridade, labelPrioridade } from '../../lib/tarefasColumns'
import type { Tarefa } from '../../types'

function formatDate(iso?: string | null) {
  if (!iso) return null
  const d = iso.slice(0, 10)
  const [y, m, day] = d.split('-')
  if (!y || !m || !day) return null
  return `${day}/${m}/${y}`
}

type Props = {
  tarefa: Tarefa
  onOpen: (t: Tarefa) => void
}

export function TarefaCard({ tarefa, onOpen }: Props) {
  const prazo = formatDate(tarefa.prazo_entrega)
  const iniciais = (tarefa.responsavel || tarefa.solicitado_por || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const avatar =
    iniciais.length === 0
      ? '?'
      : iniciais.length === 1
        ? iniciais[0].slice(0, 2).toUpperCase()
        : `${iniciais[0][0]}${iniciais[iniciais.length - 1][0]}`.toUpperCase()

  return (
    <button
      type="button"
      className="w-full rounded-xl border border-ink/10 bg-white p-3 text-left shadow-sm transition hover:border-ink/25 hover:shadow-md"
      onClick={() => onOpen(tarefa)}
    >
      <span
        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${classPrioridade(tarefa.prioridade)}`}
      >
        {labelPrioridade(tarefa.prioridade)}
      </span>
      <p className="mt-2 line-clamp-2 text-sm font-bold text-black">{tarefa.titulo}</p>
      {tarefa.descricao ? (
        <p className="mt-1 line-clamp-2 text-[11px] font-medium text-ink-muted">{tarefa.descricao}</p>
      ) : null}
      {tarefa.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {tarefa.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded bg-sand-light px-1.5 py-0.5 text-[10px] font-semibold text-ink"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-ink-muted">{prazo ?? '—'}</span>
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-500 text-[9px] font-bold text-white"
          title={tarefa.responsavel || 'Sem responsável'}
        >
          {avatar}
        </span>
      </div>
    </button>
  )
}
