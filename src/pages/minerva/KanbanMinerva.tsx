import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { CargoCard } from '../../components/kanban/CargoCard'
import { KanbanBoard } from '../../components/kanban/KanbanBoard'
import { PublishPanel } from '../../components/carga/PublishPanel'
import { Button } from '../../components/ui/Modal'
import type { Carga, StatusCargaMinerva } from '../../types'

const COLUMNS: {
  key: StatusCargaMinerva
  title: string
  color: string
  description: string
}[] = [
  {
    key: 'nova_carga',
    title: 'Nova Carga',
    color: '#385463',
    description: 'Criada, ainda não publicada',
  },
  {
    key: 'negociando',
    title: 'Negociando',
    color: '#3b82f6',
    description: 'Publicada, aguardando lances',
  },
  {
    key: 'propostas',
    title: 'Propostas',
    color: '#f59e0b',
    description: 'Recebeu lances / frete fechado',
  },
  {
    key: 'recusadas',
    title: 'Recusadas',
    color: '#e84752',
    description: 'Frete fechado e depois recusado',
  },
  {
    key: 'alocadas',
    title: 'Alocadas',
    color: '#2f9e6a',
    description: 'Placa e motorista alocados',
  },
]

export function KanbanMinerva() {
  const { cargas, lancesDaCarga, criarCarga } = useData()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Carga | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return cargas
    return cargas.filter(
      (c) =>
        c.numero.includes(q) ||
        c.origem.toLowerCase().includes(q) ||
        c.destino.toLowerCase().includes(q),
    )
  }, [cargas, search])

  // Atualiza selected quando status muda
  const liveSelected = selected ? cargas.find((c) => c.id === selected.id) ?? null : null

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
              setSelected(c)
              setPanelOpen(true)
            }}
          >
            <Plus size={16} /> Nova carga
          </Button>
        </div>

        <KanbanBoard
          columns={COLUMNS.map((col) => ({
            ...col,
            items: filtered
              .filter((c) => c.status === col.key)
              .map((c) => (
                <CargoCard
                  key={c.id}
                  carga={c}
                  mode="minerva"
                  selected={liveSelected?.id === c.id}
                  ofertasCount={
                    col.key === 'propostas' ? lancesDaCarga(c.id).length : undefined
                  }
                  onSelect={() => {
                    setSelected(c)
                    setPanelOpen(true)
                  }}
                  onView={() => {
                    setSelected(c)
                    setPanelOpen(true)
                  }}
                />
              )),
          }))}
        />
      </div>

      {panelOpen && liveSelected && (
        <PublishPanel
          carga={liveSelected}
          open={panelOpen}
          onClose={() => {
            setPanelOpen(false)
            setSelected(null)
          }}
        />
      )}
    </div>
  )
}
