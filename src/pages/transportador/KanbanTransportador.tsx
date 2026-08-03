import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { CargoCard } from '../../components/kanban/CargoCard'
import { KanbanBoard } from '../../components/kanban/KanbanBoard'
import { GridCargas, VistaToggle } from '../../components/kanban/GridCargas'
import { AllocateModal, BidModal } from '../../components/carga/BidModal'
import { TransportadorRotaCalc } from '../../components/carga/TransportadorRotaCalc'
import { DEMO_TRANSPORTADOR } from '../../lib/portalAuth'
import { isSuperSession } from '../../lib/superUsers'
import {
  colunaTransportador,
  meuLanceAtivoNaRodada,
  ordenarCargasKanban,
  type ColunaTransportador,
} from '../../lib/kanbanColumns'
import { isKanbanSyncReady } from '../../lib/kanbanSync'
import { rankingNoCardTransportador } from '../../lib/desempate'
import type { Carga } from '../../types'

const VIEW_AS_STORAGE_KEY = 'doca-livre-kanban-transportador-view-as'

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

function readStoredViewAs(): string {
  try {
    return sessionStorage.getItem(VIEW_AS_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function KanbanTransportador() {
  const {
    user,
    transportadores,
    lances,
    cargasVisiveisTransportador,
    lancesDaCarga,
    transportadorById,
    recusarCargaTransportador,
    setActingTransportadorId,
    effectiveTransportadorId,
    cargas: todasCargas,
  } = useData()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const vista: 'quadro' | 'grid' =
    searchParams.get('vista') === 'grid' ? 'grid' : 'quadro'

  function setVista(next: 'quadro' | 'grid') {
    const sp = new URLSearchParams(searchParams)
    if (next === 'grid') sp.set('vista', 'grid')
    else sp.delete('vista')
    setSearchParams(sp, { replace: true })
  }

  const isSuper = isSuperSession(user)

  /** Super (e embarcador sem vínculo) escolhem qual Kanban ver. */
  const canPickTransportador = isSuper || !user?.transportador_id

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
  const [search, setSearch] = useState('')
  const [bidCarga, setBidCarga] = useState<Carga | null>(null)
  const [bidSomenteLeitura, setBidSomenteLeitura] = useState(false)
  const [allocCarga, setAllocCarga] = useState<Carga | null>(null)
  const [rotaCarga, setRotaCarga] = useState<Carga | null>(null)

  function abrirDetalhes(c: Carga) {
    setBidSomenteLeitura(true)
    setBidCarga(c)
  }

  function abrirLance(c: Carga) {
    setBidSomenteLeitura(false)
    setBidCarga(c)
  }

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
      setActingTransportadorId(user?.transportador_id ?? null)
    }
    return () => setActingTransportadorId(null)
  }, [canPickTransportador, viewAsId, user?.transportador_id, setActingTransportadorId])

  const tid =
    (canPickTransportador ? viewAsId : '') ||
    effectiveTransportadorId() ||
    user?.transportador_id ||
    ''

  // Notificação “Contra-proposta” / Ver card → abre o modal de lance
  useEffect(() => {
    const st = location.state as { abrirCargaId?: string } | null
    const fromQuery = searchParams.get('cargaId')
    const id = (st?.abrirCargaId || fromQuery || '').trim()
    if (!id) return
    const c =
      (todasCargas ?? []).find((x) => x.id === id) ||
      cargasVisiveisTransportador(tid).find((x) => x.id === id) ||
      null
    if (!c) return
    abrirLance(c)
    const sp = new URLSearchParams(searchParams)
    sp.delete('cargaId')
    setSearchParams(sp, { replace: true })
    navigate(
      { pathname: location.pathname, search: sp.toString() ? `?${sp}` : '' },
      { replace: true, state: null },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abre uma vez ao chegar da notificação
  }, [todasCargas, tid, location.state, location.pathname, searchParams, navigate, setSearchParams])

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
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-col gap-2">
        {canPickTransportador && (
          <label className="flex min-w-0 max-w-md flex-col gap-1 text-xs font-semibold text-ink">
            Kanban do transportador
            <select
              value={viewAsId}
              onChange={(e) => setViewAsId(e.target.value)}
              className="rounded-lg border border-brand/40 bg-white px-3 py-2 text-sm font-medium text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            >
              {transportadoresAtivos.length === 0 && (
                <option value="">Nenhuma transportadora ativa</option>
              )}
              {transportadoresAtivos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome_fantasia} · {t.classificacao}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar Cargas..."
              className="w-full rounded-lg border border-ink/15 bg-white py-2 pr-3 pl-9 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <VistaToggle value={vista} onChange={setVista} />
        </div>
      </div>

      {!tid && (
        <p className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {canPickTransportador
            ? 'Selecione uma transportadora acima para ver o Kanban dela.'
            : (
              <>
                Esta conta não está vinculada a uma transportadora. Entre com{' '}
                <strong>{DEMO_TRANSPORTADOR.email}</strong> / {DEMO_TRANSPORTADOR.password} ou peça
                ao Super para vincular o usuário.
              </>
            )}
        </p>
      )}

      {tid && cargas.length === 0 && (
        <p className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Nenhuma oferta visível para <strong>{nomeVista}</strong>. Publique uma carga no Kanban
          Minerva (com grupos que incluam esta transportadora). Atualiza sozinho em tempo real
          {isKanbanSyncReady() ? ' (sync ativo)' : ' — configure VITE_SUPABASE no Render'}.
        </p>
      )}

      {!isKanbanSyncReady() && (
        <p className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          Sync em tempo real desligado: faltam <code>VITE_SUPABASE_URL</code> e{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> no Render, e o SQL{' '}
          <code>supabase/kanban_sync.sql</code> no projeto Supabase.
        </p>
      )}

      {vista === 'quadro' && (
        <p className="shrink-0 text-[11px] text-ink-muted">
          Fluxo: Nova Carga → Propostas (seu lance) → Confirmadas → Alocadas.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {vista === 'grid' ? (
          <GridCargas
            mode="transportador"
            cargas={cargas}
            lances={lances}
            transportadorId={tid || null}
            onSelect={(c) => {
              const temMeu = meuLanceAtivoNaRodada(c, lances, tid)
              const col = colunaTransportador(c, tid, temMeu)
              if (col === 'confirmadas' || col === 'alocadas') setAllocCarga(c)
              else abrirDetalhes(c)
            }}
            onAction={(c, coluna) => {
              if (coluna === 'nova_carga' || coluna === 'propostas') abrirLance(c)
              else if (coluna === 'confirmadas' || coluna === 'alocadas') setAllocCarga(c)
              else abrirDetalhes(c)
            }}
          />
        ) : (
        <KanbanBoard
          storageKey="doca-livre-kanban-collapsed-transportador"
          columns={COLUMNS.map((col) => ({
            ...col,
            items: cargas
              .filter((c) => {
                const temMeu = meuLanceAtivoNaRodada(c, lances, tid)
                return colunaTransportador(c, tid, temMeu) === col.key
              })
              .map((c) => {
                const ativos = lancesDaCarga(c.id).filter((l) =>
                  ['ativo', 'vencedor'].includes(l.status),
                )
                // Nº = ordem de chegada (2º a ofertar = 2°); verde/vermelho = menor frete
                const ranking =
                  col.key !== 'nova_carga'
                    ? rankingNoCardTransportador(ativos, tid, transportadorById)
                    : null
                const meuLance = ranking?.meuLance ?? null

                return {
                  id: c.id,
                  node: (
                    <CargoCard
                      carga={c}
                      mode="transportador"
                      coluna={col.key}
                      colunaColor={col.color}
                      bidValue={
                        meuLance
                          ? meuLance.valor
                          : col.key !== 'nova_carga'
                            ? c.frete_fechado
                            : null
                      }
                      bidPosition={ranking?.posicao ?? null}
                      bidCount={ranking && ranking.total > 0 ? ranking.total : null}
                      bidMelhor={ranking?.melhor ?? false}
                      onSelect={() => {
                        if (col.key === 'confirmadas' || col.key === 'alocadas') setAllocCarga(c)
                        else abrirDetalhes(c)
                      }}
                      onView={() => abrirDetalhes(c)}
                      onBid={
                        col.key === 'nova_carga' || col.key === 'propostas'
                          ? () => abrirLance(c)
                          : undefined
                      }
                      onRefuse={
                        col.key === 'nova_carga' || col.key === 'propostas'
                          ? () => {
                              if (!tid) return
                              const ok = window.confirm(
                                `Recusar a carga ${c.numero}? Ela sairá do seu Kanban.`,
                              )
                              if (!ok) return
                              const res = recusarCargaTransportador(c.id)
                              if (!res.ok) window.alert(res.error ?? 'Não foi possível recusar.')
                            }
                          : undefined
                      }
                      onAllocate={
                        col.key === 'confirmadas' || col.key === 'alocadas'
                          ? () => setAllocCarga(c)
                          : undefined
                      }
                      onCalcularRota={() => setRotaCarga(c)}
                    />
                  ),
                }
              }),
          }))}
        />
        )}
      </div>

      <BidModal
        carga={bidCarga}
        open={!!bidCarga}
        somenteLeitura={bidSomenteLeitura}
        onClose={() => {
          setBidCarga(null)
          setBidSomenteLeitura(false)
        }}
        onCalcularRota={
          bidCarga
            ? () => {
                setRotaCarga(bidCarga)
              }
            : undefined
        }
      />
      <AllocateModal
        carga={allocCarga}
        open={!!allocCarga}
        onClose={() => setAllocCarga(null)}
      />
      <TransportadorRotaCalc
        carga={rotaCarga}
        open={!!rotaCarga}
        onClose={() => setRotaCarga(null)}
      />
    </div>
  )
}
