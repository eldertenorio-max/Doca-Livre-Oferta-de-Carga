import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { CargoCard } from '../../components/kanban/CargoCard'
import { KanbanBoard } from '../../components/kanban/KanbanBoard'
import { AllocateModal, BidModal } from '../../components/carga/BidModal'
import type { Carga } from '../../types'

type ColKey = 'nova_carga' | 'propostas' | 'confirmadas' | 'alocadas'

const COLUMNS: { key: ColKey; title: string; color: string; description: string }[] = [
  {
    key: 'nova_carga',
    title: 'Nova Carga',
    color: '#0d9488',
    description: 'Recebida para ofertar lance',
  },
  {
    key: 'propostas',
    title: 'Propostas',
    color: '#3b82f6',
    description: 'Você já fez uma proposta',
  },
  {
    key: 'confirmadas',
    title: 'Confirmadas',
    color: '#f59e0b',
    description: 'Frete fechado com você',
  },
  {
    key: 'alocadas',
    title: 'Alocadas',
    color: '#2f9e6a',
    description: 'Placa e motorista alocados',
  },
]

function columnForCarga(
  c: Carga,
  transportadorId: string,
  temLance: boolean,
): ColKey | null {
  if (c.status === 'alocadas' && c.transportador_vencedor_id === transportadorId) {
    return 'alocadas'
  }
  if (
    c.transportador_vencedor_id === transportadorId &&
    c.status !== 'alocadas' &&
    c.status !== 'recusadas'
  ) {
    return 'confirmadas'
  }
  if (temLance && ['negociando', 'propostas'].includes(c.status)) return 'propostas'
  if (['negociando', 'propostas'].includes(c.status) && !c.transportador_vencedor_id) {
    return 'nova_carga'
  }
  return null
}

export function KanbanTransportador() {
  const {
    user,
    cargasVisiveisTransportador,
    lancesDaCarga,
    recusarCargaTransportador,
  } = useData()
  const tid = user?.transportador_id ?? ''
  const [search, setSearch] = useState('')
  const [bidCarga, setBidCarga] = useState<Carga | null>(null)
  const [allocCarga, setAllocCarga] = useState<Carga | null>(null)

  const cargas = useMemo(() => {
    const list = cargasVisiveisTransportador(tid)
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (c) =>
        c.numero.includes(q) ||
        c.origem.toLowerCase().includes(q) ||
        c.destino.toLowerCase().includes(q),
    )
  }, [cargasVisiveisTransportador, tid, search])

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      <div className="relative max-w-md">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar cargas..."
          className="w-full rounded-lg border border-ink/15 bg-white py-2 pr-3 pl-9 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      <KanbanBoard
        columns={COLUMNS.map((col) => ({
          ...col,
          items: cargas
            .filter((c) => {
              const meus = lancesDaCarga(c.id).filter((l) => l.transportador_id === tid)
              return columnForCarga(c, tid, meus.length > 0) === col.key
            })
            .map((c) => {
              const meus = lancesDaCarga(c.id)
                .filter((l) => l.transportador_id === tid)
                .sort((a, b) => a.valor - b.valor)
              const todos = lancesDaCarga(c.id)
              const meuLance = meus[0]
              const pos =
                meuLance && col.key === 'propostas'
                  ? todos.findIndex((l) => l.id === meuLance.id) + 1
                  : null

              return (
                <CargoCard
                  key={c.id}
                  carga={c}
                  mode="transportador"
                  bidValue={meuLance?.valor ?? (col.key !== 'nova_carga' ? c.frete_fechado : null)}
                  bidPosition={pos && pos > 0 ? pos : null}
                  onSelect={() => {
                    if (col.key === 'nova_carga' || col.key === 'propostas') setBidCarga(c)
                    else if (col.key === 'confirmadas') setAllocCarga(c)
                  }}
                  onView={() => setBidCarga(c)}
                  onBid={
                    col.key === 'nova_carga' || col.key === 'propostas'
                      ? () => setBidCarga(c)
                      : undefined
                  }
                  onRefuse={
                    col.key === 'nova_carga'
                      ? () => recusarCargaTransportador(c.id)
                      : undefined
                  }
                  onAllocate={
                    col.key === 'confirmadas' || col.key === 'alocadas'
                      ? () => setAllocCarga(c)
                      : undefined
                  }
                />
              )
            }),
        }))}
      />

      <BidModal carga={bidCarga} open={!!bidCarga} onClose={() => setBidCarga(null)} />
      <AllocateModal
        carga={allocCarga}
        open={!!allocCarga}
        onClose={() => setAllocCarga(null)}
      />
    </div>
  )
}
