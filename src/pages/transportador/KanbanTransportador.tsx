import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { CargoCard } from '../../components/kanban/CargoCard'
import { KanbanBoard } from '../../components/kanban/KanbanBoard'
import { AllocateModal, BidModal } from '../../components/carga/BidModal'
import { DEMO_TRANSPORTADOR } from '../../lib/portalAuth'
import { isLocalSuperUser } from '../../lib/superUsers'
import {
  colunaTransportador,
  meuLanceAtivoNaRodada,
  ordenarCargasKanban,
  type ColunaTransportador,
} from '../../lib/kanbanColumns'
import { isKanbanSyncReady } from '../../lib/kanbanSync'
import type { Carga } from '../../types'

const COLUMNS: {
  key: ColunaTransportador
  title: string
  color: string
  description: string
}[] = [
  {
    key: 'nova_carga',
    title: 'Nova Carga',
    color: '#0d9488',
    description: 'Recebida — ainda sem a sua proposta',
  },
  {
    key: 'propostas',
    title: 'Propostas',
    color: '#3b82f6',
    description: 'Você já enviou lance nesta carga',
  },
  {
    key: 'confirmadas',
    title: 'Confirmadas',
    color: '#f59e0b',
    description: 'Frete fechado com você — aloque o veículo',
  },
  {
    key: 'alocadas',
    title: 'Alocadas',
    color: '#2f9e6a',
    description: 'Placa e motorista confirmados',
  },
]

export function KanbanTransportador() {
  const {
    user,
    transportadores,
    lances,
    cargasVisiveisTransportador,
    lancesDaCarga,
    recusarCargaTransportador,
    setActingTransportadorId,
    effectiveTransportadorId,
  } = useData()

  const isSuper =
    Boolean(user?.is_superuser) ||
    user?.role === 'super' ||
    isLocalSuperUser(user?.usuario ?? '') ||
    isLocalSuperUser(user?.email ?? '')

  const transportadoresAtivos = useMemo(
    () => transportadores.filter((t) => t.situacao !== 'inativo'),
    [transportadores],
  )

  const defaultViewAs =
    user?.transportador_id ||
    transportadoresAtivos.find((t) => t.id === DEMO_TRANSPORTADOR.transportador_id)?.id ||
    transportadoresAtivos[0]?.id ||
    ''

  const [viewAsId, setViewAsId] = useState(defaultViewAs)
  const [search, setSearch] = useState('')
  const [bidCarga, setBidCarga] = useState<Carga | null>(null)
  const [allocCarga, setAllocCarga] = useState<Carga | null>(null)

  useEffect(() => {
    if (!viewAsId && defaultViewAs) setViewAsId(defaultViewAs)
  }, [defaultViewAs, viewAsId])

  useEffect(() => {
    if (isSuper) setActingTransportadorId(viewAsId || null)
    else setActingTransportadorId(user?.transportador_id ?? null)
    return () => setActingTransportadorId(null)
  }, [isSuper, viewAsId, user?.transportador_id, setActingTransportadorId])

  const tid = effectiveTransportadorId() || user?.transportador_id || (isSuper ? viewAsId : '') || ''

  const cargas = useMemo(() => {
    const list = cargasVisiveisTransportador(tid)
    const q = search.trim().toLowerCase()
    const filtered = q
      ? list.filter(
          (c) =>
            c.numero.includes(q) ||
            c.origem.toLowerCase().includes(q) ||
            c.destino.toLowerCase().includes(q),
        )
      : list
    return [...filtered].sort(ordenarCargasKanban)
  }, [cargasVisiveisTransportador, tid, search])

  const nomeVista =
    transportadores.find((t) => t.id === tid)?.nome_fantasia ??
    (tid ? tid : 'nenhuma transportadora')

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar cargas..."
            className="w-full rounded-lg border border-ink/15 bg-white py-2 pr-3 pl-9 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>

        {isSuper && (
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Ver como transportadora
            <select
              value={viewAsId}
              onChange={(e) => setViewAsId(e.target.value)}
              className="min-w-[220px] rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            >
              {transportadoresAtivos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome_fantasia} ({t.classificacao})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!tid && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          Esta conta não está vinculada a uma transportadora. Entre com{' '}
          <strong>{DEMO_TRANSPORTADOR.email}</strong> / {DEMO_TRANSPORTADOR.password} ou peça ao
          Super para vincular o usuário.
        </p>
      )}

      {tid && cargas.length === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Nenhuma oferta visível para <strong>{nomeVista}</strong>. Publique uma carga no Kanban
          Minerva (com grupos que incluam esta transportadora). Atualiza sozinho em tempo real
          {isKanbanSyncReady() ? ' (sync ativo)' : ' — configure VITE_SUPABASE no Render'}.
        </p>
      )}

      {!isKanbanSyncReady() && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          Sync em tempo real desligado: faltam <code>VITE_SUPABASE_URL</code> e{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> no Render, e o SQL{' '}
          <code>supabase/kanban_sync.sql</code> no projeto Supabase.
        </p>
      )}

      <p className="text-[11px] text-ink-muted">
        Fluxo: Nova Carga → Propostas (seu lance) → Confirmadas → Alocadas.
      </p>

      <KanbanBoard
        columns={COLUMNS.map((col) => ({
          ...col,
          items: cargas
            .filter((c) => {
              const temMeu = meuLanceAtivoNaRodada(c, lances, tid)
              return colunaTransportador(c, tid, temMeu) === col.key
            })
            .map((c) => {
              const meuLance = lancesDaCarga(c.id)
                .filter(
                  (l) =>
                    l.transportador_id === tid && ['ativo', 'vencedor'].includes(l.status),
                )
                .sort((a, b) => a.valor - b.valor)[0]

              return {
                id: c.id,
                node: (
                  <CargoCard
                    carga={c}
                    mode="transportador"
                    bidValue={
                      meuLance?.valor ?? (col.key !== 'nova_carga' ? c.frete_fechado : null)
                    }
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
                        ? () => {
                            if (tid) recusarCargaTransportador(c.id)
                          }
                        : undefined
                    }
                    onAllocate={
                      col.key === 'confirmadas' || col.key === 'alocadas'
                        ? () => setAllocCarga(c)
                        : undefined
                    }
                  />
                ),
              }
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
