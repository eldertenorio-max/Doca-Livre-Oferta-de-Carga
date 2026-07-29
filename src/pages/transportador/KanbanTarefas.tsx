import { useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { KanbanBoard } from '../../components/kanban/KanbanBoard'
import { TarefaCard } from '../../components/tarefas/TarefaCard'
import { TarefaModal } from '../../components/tarefas/TarefaModal'
import { COLUNAS_TAREFAS, isStatusTarefa } from '../../lib/tarefasColumns'
import { loadTarefas, moverTarefa } from '../../lib/tarefasStorage'
import { DEMO_TRANSPORTADOR } from '../../lib/portalAuth'
import { isSuperSession } from '../../lib/superUsers'
import { canEditModulo } from '../../lib/portalModules'
import { normalizarTexto } from '../../lib/cidadesBrasil'
import type { StatusTarefa, Tarefa } from '../../types'
import { Button, inputClass } from '../../components/ui/Modal'

const VIEW_AS_STORAGE_KEY = 'doca-livre-kanban-transportador-view-as'

function readStoredViewAs(): string {
  try {
    return sessionStorage.getItem(VIEW_AS_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function KanbanTarefasPage() {
  const {
    user,
    transportadores,
    setActingTransportadorId,
    effectiveTransportadorId,
  } = useData()

  const isSuper = isSuperSession(user)
  const canPickTransportador = isSuper || !user?.transportador_id
  const canEdit =
    canEditModulo(user?.permissoes_modulos, 'tarefas_transportador') ||
    Boolean(user?.is_superuser) ||
    isSuper ||
    user?.role === 'transportador'

  const transportadoresAtivos = useMemo(
    () =>
      [...transportadores]
        .filter((t) => t.situacao !== 'inativo')
        .sort((a, b) => a.nome_fantasia.localeCompare(b.nome_fantasia, 'pt-BR')),
    [transportadores],
  )

  const defaultViewAs =
    (canPickTransportador ? readStoredViewAs() : '') ||
    user?.transportador_id ||
    transportadoresAtivos.find((t) => t.id === DEMO_TRANSPORTADOR.transportador_id)?.id ||
    transportadoresAtivos[0]?.id ||
    ''

  const [viewAsId, setViewAsId] = useState(defaultViewAs)
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [busca, setBusca] = useState('')
  const [filtroPrioridade, setFiltroPrioridade] = useState('todas')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Tarefa | null>(null)

  const tid = effectiveTransportadorId || viewAsId

  useEffect(() => {
    if (!viewAsId && defaultViewAs) setViewAsId(defaultViewAs)
  }, [defaultViewAs, viewAsId])

  useEffect(() => {
    if (canPickTransportador) {
      setActingTransportadorId(viewAsId || null)
      try {
        if (viewAsId) sessionStorage.setItem(VIEW_AS_STORAGE_KEY, viewAsId)
      } catch {
        /* ignore */
      }
    } else {
      setActingTransportadorId(null)
    }
  }, [canPickTransportador, viewAsId, setActingTransportadorId])

  useEffect(() => {
    setTarefas(tid ? loadTarefas(tid) : [])
  }, [tid])

  const filtradas = useMemo(() => {
    const q = normalizarTexto(busca)
    return tarefas.filter((t) => {
      if (filtroPrioridade !== 'todas' && t.prioridade !== filtroPrioridade) return false
      if (!q) return true
      const blob = normalizarTexto(
        [t.titulo, t.descricao, t.responsavel, t.solicitado_por, ...(t.tags ?? [])].join(' '),
      )
      return blob.includes(q)
    })
  }, [tarefas, busca, filtroPrioridade])

  const columns = useMemo(
    () =>
      COLUNAS_TAREFAS.map((col) => ({
        key: col.key,
        title: col.title,
        color: col.color,
        items: filtradas
          .filter((t) => t.status === col.key)
          .map((t) => ({
            id: t.id,
            node: (
              <TarefaCard
                tarefa={t}
                onOpen={(task) => {
                  setEditing(task)
                  setModalOpen(true)
                }}
              />
            ),
          })),
      })),
    [filtradas],
  )

  function refresh() {
    if (tid) setTarefas(loadTarefas(tid))
  }

  function handleDrop(cardId: string, _from: string, toColumn: string) {
    if (!canEdit) return
    if (!isStatusTarefa(toColumn)) return
    const moved = moverTarefa(cardId, toColumn as StatusTarefa)
    if (moved) refresh()
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 animate-fade-up">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-black">Kanban de Tarefas</h2>
          <p className="text-sm font-medium text-ink-muted">
            Arraste os cards entre as colunas para atualizar o status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPickTransportador ? (
            <select
              className={`${inputClass} !w-auto min-w-[180px]`}
              value={viewAsId}
              onChange={(e) => setViewAsId(e.target.value)}
              title="Ver como"
            >
              {transportadoresAtivos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome_fantasia}
                </option>
              ))}
            </select>
          ) : null}
          {canEdit ? (
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null)
                setModalOpen(true)
              }}
            >
              <Plus size={16} /> Nova Tarefa
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-muted"
          />
          <input
            className={`${inputClass} pl-8`}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar por título, descrição ou tag…"
          />
        </div>
        <select
          className={`${inputClass} !w-auto`}
          value={filtroPrioridade}
          onChange={(e) => setFiltroPrioridade(e.target.value)}
        >
          <option value="todas">Todas Prioridades</option>
          <option value="baixa">Baixa</option>
          <option value="media">Média</option>
          <option value="alta">Alta</option>
          <option value="urgente">Urgente</option>
        </select>
        {(busca || filtroPrioridade !== 'todas') && (
          <Button
            variant="ghost"
            className="border border-ink/15"
            onClick={() => {
              setBusca('')
              setFiltroPrioridade('todas')
            }}
          >
            Limpar
          </Button>
        )}
      </div>

      {!tid ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Selecione uma transportadora para ver as tarefas.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <KanbanBoard
            columns={columns}
            onCardDrop={canEdit ? handleDrop : undefined}
            storageKey="doca-livre-kanban-tarefas-collapsed-v1"
            emptyLabel="Nenhuma tarefa"
          />
        </div>
      )}

      <TarefaModal
        open={modalOpen}
        transportadorId={tid || ''}
        tarefa={editing}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
        }}
        onSaved={() => refresh()}
        onDeleted={() => refresh()}
      />
    </div>
  )
}
