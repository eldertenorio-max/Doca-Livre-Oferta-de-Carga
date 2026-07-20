import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { CargoCard } from '../../components/kanban/CargoCard'
import { KanbanBoard } from '../../components/kanban/KanbanBoard'
import { PublishPanel } from '../../components/carga/PublishPanel'
import { Button } from '../../components/ui/Modal'
import {
  colunaMinerva,
  ordenarCargasKanban,
  temLanceAtivoNaRodada,
  type ColunaMinerva,
} from '../../lib/kanbanColumns'
import type { Carga } from '../../types'

const COLUMNS: {
  key: ColunaMinerva
  title: string
  color: string
  description: string
}[] = [
  {
    key: 'nova_carga',
    title: 'Nova Carga',
    color: '#385463',
    description: 'Rascunho ou publicada — aguardando o 1º lance',
  },
  {
    key: 'negociando',
    title: 'Negociando',
    color: '#3b82f6',
    description: 'Já recebeu lance(s) — frete ainda aberto',
  },
  {
    key: 'confirmadas',
    title: 'Confirmadas',
    color: '#ea580c',
    description: 'Frete fechado — aguarda alocação',
  },
  {
    key: 'suspensas',
    title: 'Suspensas',
    color: '#8b5cf6',
    description: 'Negociação pausada',
  },
  {
    key: 'recusadas',
    title: 'Recusadas',
    color: '#e84752',
    description: 'Frete fechado e depois recusado',
  },
  {
    key: 'canceladas',
    title: 'Canceladas',
    color: '#64748b',
    description: 'Publicação cancelada',
  },
  {
    key: 'alocadas',
    title: 'Alocadas',
    color: '#2f9e6a',
    description: 'Placa e motorista confirmados',
  },
]

export function KanbanMinerva() {
  const { cargas, lances, lancesDaCarga, criarCarga, moverCargaKanban } = useData()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Carga | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [initialTab, setInitialTab] = useState<'dados' | 'publicar'>('dados')
  const [dragMsg, setDragMsg] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? cargas.filter(
          (c) =>
            c.numero.includes(q) ||
            c.origem.toLowerCase().includes(q) ||
            c.destino.toLowerCase().includes(q),
        )
      : cargas
    return [...list].sort(ordenarCargasKanban)
  }, [cargas, search])

  const liveSelected = selected ? (cargas.find((c) => c.id === selected.id) ?? null) : null

  function openPanel(c: Carga, tab: 'dados' | 'publicar') {
    setSelected(c)
    setInitialTab(tab)
    setPanelOpen(true)
  }

  function showDragMsg(text: string) {
    setDragMsg(text)
    window.setTimeout(() => setDragMsg(null), 3200)
  }

  function handleCardDrop(cardId: string, _from: string, toColumn: string) {
    const carga = cargas.find((c) => c.id === cardId)
    const result = moverCargaKanban(cardId, toColumn)
    if (result.needsPublish && carga) {
      openPanel(carga, 'publicar')
      showDragMsg(result.error ?? 'Publique a carga para negociar')
      return
    }
    if (!result.ok) {
      showDragMsg(result.error ?? 'Movimento não permitido')
    }
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar cargas..."
              className="w-full rounded-lg border border-ink/15 bg-white py-2 pr-3 pl-9 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <Button
            variant="success"
            onClick={() => {
              const c = criarCarga()
              openPanel(c, 'dados')
            }}
          >
            <Plus size={16} /> Nova carga
          </Button>
        </div>

        {dragMsg && (
          <p className="animate-fade-up rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            {dragMsg}
          </p>
        )}

        <p className="text-[11px] text-ink-muted">
          Fluxo: Nova Carga (publicada) → Negociando (1º lance) → Confirmadas → Alocadas.
        </p>

        <KanbanBoard
          onCardDrop={handleCardDrop}
          columns={COLUMNS.map((col) => ({
            ...col,
            items: filtered
              .filter((c) => colunaMinerva(c, temLanceAtivoNaRodada(c, lances)) === col.key)
              .map((c) => ({
                id: c.id,
                node: (
                  <CargoCard
                    carga={c}
                    mode="minerva"
                    selected={liveSelected?.id === c.id}
                    ofertasCount={
                      col.key === 'negociando'
                        ? lancesDaCarga(c.id).filter(
                            (l) => l.status === 'ativo' || l.status === 'vencedor',
                          ).length
                        : undefined
                    }
                    onSelect={() =>
                      openPanel(c, c.status === 'nova_carga' ? 'dados' : 'publicar')
                    }
                    onView={() =>
                      openPanel(c, c.status === 'nova_carga' ? 'dados' : 'publicar')
                    }
                  />
                ),
              })),
          }))}
        />
      </div>

      {panelOpen && liveSelected && (
        <PublishPanel
          key={`${liveSelected.id}-${initialTab}`}
          carga={liveSelected}
          open={panelOpen}
          initialTab={initialTab}
          onClose={() => {
            setPanelOpen(false)
            setSelected(null)
          }}
        />
      )}
    </div>
  )
}
