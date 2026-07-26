import { useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isCargaEphemeral, montarNovaCarga, useData } from '../../context/DataContext'
import { CargoCard } from '../../components/kanban/CargoCard'
import { KanbanBoard } from '../../components/kanban/KanbanBoard'
import { PublishPanel } from '../../components/carga/PublishPanel'
import { Button } from '../../components/ui/Modal'
import {
  colunaMinerva,
  isRascunhoNaoPublicado,
  ordenarCargasKanban,
  temLanceAtivoNaRodada,
  type ColunaMinerva,
} from '../../lib/kanbanColumns'
import { isKanbanSyncReady } from '../../lib/kanbanSync'
import { loadPanelSize, type PanelSize } from '../../lib/cargasMontadas'
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
    description: 'Publicada — aguardando o 1º lance',
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
  const navigate = useNavigate()
  const location = useLocation()
  const {
    cargas,
    lances,
    lancesDaCarga,
    user,
    moverCargaKanban,
    forcarSincronizarKanban,
  } = useData()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Carga | null>(null)
  /** Rascunho só na tela — ainda não foi salvo em `cargas`. */
  const [ephemeral, setEphemeral] = useState<Carga | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelSize, setPanelSize] = useState<PanelSize>(() => loadPanelSize())
  const [initialTab, setInitialTab] = useState<'dados' | 'salvas' | 'publicar'>('dados')
  const [dragMsg, setDragMsg] = useState<string | null>(null)
  const [syncBusy, setSyncBusy] = useState(false)
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches,
  )
  const panelFullscreen = panelOpen && (panelSize === 'largo' || isNarrow)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    const onChange = () => setIsNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Ao abrir o Kanban embarcador (ou voltar à aba), força pull do sync
  useEffect(() => {
    void forcarSincronizarKanban()
    const onFocus = () => {
      void forcarSincronizarKanban()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [forcarSincronizarKanban])

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

  const noQuadro = useMemo(
    () =>
      filtered.filter((c) => colunaMinerva(c, temLanceAtivoNaRodada(c, lances)) != null).length,
    [filtered, lances],
  )
  const rascunhos = useMemo(() => cargas.filter(isRascunhoNaoPublicado).length, [cargas])

  const liveSelected = useMemo(() => {
    if (!selected) return null
    if (ephemeral && selected.id === ephemeral.id) return ephemeral
    return cargas.find((c) => c.id === selected.id) ?? selected
  }, [selected, ephemeral, cargas])

  function openPanel(c: Carga, tab?: 'dados' | 'salvas' | 'publicar') {
    setEphemeral(null)
    setSelected(c)
    setInitialTab(tab ?? (isRascunhoNaoPublicado(c) ? 'dados' : 'publicar'))
    setPanelOpen(true)
  }

  function openNovaCarga() {
    const draft = montarNovaCarga(undefined, user?.id ?? null, { persistir: false })
    setEphemeral(draft)
    setSelected(draft)
    setInitialTab('dados')
    setPanelOpen(true)
  }

  // Topbar “+ Nova carga” navega com state.novaCarga
  useEffect(() => {
    const st = location.state as { novaCarga?: boolean } | null
    if (!st?.novaCarga) return
    openNovaCarga()
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao chegar com o sinal da topbar
  }, [location.state, location.pathname, navigate])

  function openMapaFrota(c: Carga) {
    const params = new URLSearchParams()
    const origem = (c.origem || '').trim()
    const veiculo = (c.veiculo || '').trim()
    if (origem) params.set('origem', origem)
    if (veiculo) params.set('veiculo', veiculo)
    if (c.numero) params.set('carga', c.numero)
    const qs = params.toString()
    navigate(`/embarcador/mapa-frota${qs ? `?${qs}` : ''}`)
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
    <div
      className={
        panelFullscreen
          ? 'flex h-[calc(100dvh-var(--app-topbar-h,54px))] min-h-0 gap-0 -mx-[8px] -mt-[8px] -mb-[16px] sm:-mx-[14px] sm:-mt-[10px] sm:-mb-[24px]'
          : 'flex h-full min-h-0 gap-3 overflow-hidden'
      }
    >
      {!panelFullscreen && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="relative min-w-0 w-full flex-1 sm:min-w-[220px]">
              <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar cargas..."
                className="w-full rounded-lg border border-ink/15 bg-white py-2 pr-3 pl-9 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <Button variant="success" onClick={openNovaCarga}>
              <Plus size={16} /> Nova carga
            </Button>
          </div>

          {dragMsg && (
            <p className="shrink-0 animate-fade-up rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              {dragMsg}
            </p>
          )}

          {(cargas.length === 0 || noQuadro === 0) && (
            <p className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              {syncBusy ? (
                'Sincronizando com o Supabase…'
              ) : (
                <>
                  {cargas.length === 0
                    ? 'Nenhuma carga carregada do sync.'
                    : `Há ${cargas.length} carga(s) (${rascunhos} rascunho(s) só em Cargas salvas) — nenhuma no quadro.`}{' '}
                  {!isKanbanSyncReady() && (
                    <span className="font-semibold text-red-800">
                      Sync desligado (faltam VITE_SUPABASE no Render).{' '}
                    </span>
                  )}
                  <button
                    type="button"
                    className="font-bold underline"
                    onClick={() => {
                      setSyncBusy(true)
                      void forcarSincronizarKanban().finally(() => setSyncBusy(false))
                    }}
                  >
                    Buscar cargas agora
                  </button>
                </>
              )}
            </p>
          )}

          {noQuadro > 0 && (
            <p className="shrink-0 text-[11px] text-ink-muted">
              {noQuadro} no quadro
              {rascunhos > 0 ? ` · ${rascunhos} rascunho(s) em Cargas salvas (botão Nova carga)` : ''}
              {' · '}Fluxo: publicar → Nova Carga → Negociando → Confirmadas → Alocadas.
            </p>
          )}

          {noQuadro === 0 && cargas.length === 0 && (
            <p className="shrink-0 text-[11px] text-ink-muted">
              Fluxo: Nova carga → salve (Cargas salvas) → Publicar → aparece em Nova Carga.
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            <KanbanBoard
              storageKey="doca-livre-kanban-collapsed-minerva"
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
                        onSelect={() => openPanel(c)}
                        onView={() => openPanel(c)}
                        onMapaFrota={() => openMapaFrota(c)}
                      />
                    ),
                  })),
              }))}
            />
          </div>
        </div>
      )}

      {panelOpen && liveSelected && (
        <PublishPanel
          key={`${liveSelected.id}-${initialTab}`}
          carga={liveSelected}
          open={panelOpen}
          initialTab={initialTab}
          onPanelSizeChange={setPanelSize}
          onSelectCarga={(c) => {
            setEphemeral(null)
            setSelected(c)
            setInitialTab('dados')
          }}
          onCargaPersistida={(c) => {
            if (isCargaEphemeral(c)) {
              setEphemeral(c)
              setSelected(c)
              return
            }
            setEphemeral(null)
            setSelected(c)
          }}
          onClose={() => {
            setPanelOpen(false)
            setSelected(null)
            setEphemeral(null)
          }}
        />
      )}
    </div>
  )
}
