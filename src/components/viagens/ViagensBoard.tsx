import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { CargoCard } from '../kanban/CargoCard'
import { KanbanBoard } from '../kanban/KanbanBoard'
import { VistaToggle } from '../kanban/GridCargas'
import { GridViagens } from './GridViagens'
import {
  COLUNAS_VIAGEM,
  colunaViagem,
  isCargaNaAbaViagens,
  ordenarCargasViagem,
  type ColunaViagem,
} from '../../lib/viagensColumns'
import type { Carga } from '../../types'
import { AvaliacaoViagemModal } from './AvaliacaoViagemModal'

type Props = {
  /** Embarcador vê todas; transportador só as dele. */
  mode: 'minerva' | 'transportador'
  /** Obrigatório no modo transportador. */
  transportadorId?: string | null
}

export function ViagensBoard({ mode, transportadorId }: Props) {
  const {
    cargas,
    iniciarViagem,
    finalizarViagem,
    cancelarViagem,
  } = useData()
  const [searchParams, setSearchParams] = useSearchParams()
  const vista: 'quadro' | 'grid' =
    searchParams.get('vista') === 'grid' ? 'grid' : 'quadro'
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [avaliarCarga, setAvaliarCarga] = useState<Carga | null>(null)

  function setVista(next: 'quadro' | 'grid') {
    const sp = new URLSearchParams(searchParams)
    if (next === 'grid') sp.set('vista', 'grid')
    else sp.delete('vista')
    setSearchParams(sp, { replace: true })
  }

  const lista = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = (cargas ?? []).filter((c) => {
      if (!isCargaNaAbaViagens(c)) return false
      if (mode === 'transportador') {
        if (!transportadorId) return false
        if (c.transportador_vencedor_id !== transportadorId) return false
      }
      if (!q) return true
      return (
        c.numero.includes(q) ||
        c.origem.toLowerCase().includes(q) ||
        c.destino.toLowerCase().includes(q) ||
        (c.placa ?? '').toLowerCase().includes(q) ||
        (c.motorista ?? '').toLowerCase().includes(q)
      )
    })
    return [...base].sort(ordenarCargasViagem)
  }, [cargas, mode, transportadorId, search])

  function flash(text: string) {
    setMsg(text)
    window.setTimeout(() => setMsg(null), 3200)
  }

  function onIniciar(c: Carga) {
    const res = iniciarViagem(c.id)
    if (!res.ok) flash(res.error ?? 'Não foi possível iniciar.')
    else flash(`Viagem ${c.numero} iniciada.`)
  }

  function onFinalizar(c: Carga) {
    const ok = window.confirm(`Finalizar a viagem da carga ${c.numero}?`)
    if (!ok) return
    const res = finalizarViagem(c.id)
    if (!res.ok) {
      flash(res.error ?? 'Não foi possível finalizar.')
      return
    }
    flash(`Viagem ${c.numero} finalizada.`)
    if (mode === 'minerva' && !c.avaliado_em) {
      const atualizada = {
        ...c,
        status_viagem: 'rota_finalizada' as const,
        viagem_finalizada_em: new Date().toISOString(),
      }
      setAvaliarCarga(atualizada)
    }
  }

  function onCancelar(c: Carga) {
    const motivo = window.prompt(
      `Cancelar a viagem da carga ${c.numero} no meio do percurso?\nInforme o motivo (opcional):`,
      '',
    )
    if (motivo === null) return
    const res = cancelarViagem(c.id, motivo.trim() || undefined)
    if (!res.ok) flash(res.error ?? 'Não foi possível cancelar.')
    else flash(`Viagem ${c.numero} cancelada.`)
  }

  const liveAvaliar = useMemo(() => {
    if (!avaliarCarga) return null
    return (cargas ?? []).find((c) => c.id === avaliarCarga.id) ?? avaliarCarga
  }, [avaliarCarga, cargas])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar Viagens (carga, placa, motorista)…"
            className="w-full rounded-lg border border-ink/15 bg-white py-2 pr-3 pl-9 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <VistaToggle value={vista} onChange={setVista} />
      </div>

      {msg ? (
        <p className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {msg}
        </p>
      ) : null}

      {mode === 'transportador' && !transportadorId ? (
        <p className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          Selecione uma transportadora para ver as viagens.
        </p>
      ) : null}

      {lista.length === 0 && (mode === 'minerva' || transportadorId) ? (
        <p className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Nenhuma viagem ainda. Quando uma carga for alocada (placa e motorista), ela aparece em
          Aguardando início.
        </p>
      ) : null}

      {vista === 'quadro' ? (
        <p className="shrink-0 text-[11px] text-ink-muted">
          {mode === 'transportador'
            ? 'Suas viagens: inicie em Aguardando início → Finalizar rota em Rota iniciada (tempo fica gravado). Cancelamento no meio do percurso vai para Cancelada.'
            : 'Em Rota iniciada use Finalizar rota — o tempo para e o card vai para Rota finalizada. Depois avalie motorista e veículo.'}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {vista === 'grid' ? (
          <GridViagens
            mode={mode}
            cargas={lista}
            transportadorId={transportadorId}
            onIniciar={mode === 'transportador' ? onIniciar : undefined}
            onFinalizar={onFinalizar}
            onCancelar={onCancelar}
            onAvaliar={mode === 'minerva' ? (c) => setAvaliarCarga(c) : undefined}
          />
        ) : (
          <KanbanBoard
            storageKey={`doca-livre-viagens-collapsed-${mode}`}
            columns={COLUNAS_VIAGEM.map((col) => ({
              ...col,
              items: lista
                .filter((c) => colunaViagem(c) === col.key)
                .map((c) => ({
                  id: c.id,
                  node: (
                    <CargoCard
                      carga={c}
                      mode={mode}
                      coluna={col.key}
                      colunaColor={col.color}
                      onSelect={() => {
                        if (col.key === 'rota_finalizada' && mode === 'minerva') {
                          setAvaliarCarga(c)
                        }
                      }}
                      onView={
                        col.key === 'rota_finalizada' && mode === 'minerva'
                          ? () => setAvaliarCarga(c)
                          : undefined
                      }
                      onIniciarViagem={
                        col.key === 'aguardando_inicio' && mode === 'transportador'
                          ? () => onIniciar(c)
                          : undefined
                      }
                      onFinalizarViagem={
                        col.key === 'rota_iniciada' ? () => onFinalizar(c) : undefined
                      }
                      onCancelarViagem={
                        col.key === 'aguardando_inicio' || col.key === 'rota_iniciada'
                          ? () => onCancelar(c)
                          : undefined
                      }
                      onAvaliarViagem={
                        col.key === 'rota_finalizada' && mode === 'minerva'
                          ? () => setAvaliarCarga(c)
                          : undefined
                      }
                    />
                  ),
                })),
            }))}
          />
        )}
      </div>

      <AvaliacaoViagemModal
        carga={liveAvaliar}
        open={Boolean(liveAvaliar)}
        onClose={() => setAvaliarCarga(null)}
      />
    </div>
  )
}

// re-export type for consumers
export type { ColunaViagem }
