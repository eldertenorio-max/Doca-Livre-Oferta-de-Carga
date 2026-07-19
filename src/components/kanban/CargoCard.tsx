import { useState } from 'react'
import {
  Ban,
  CalendarDays,
  Eye,
  Gavel,
  MapPinned,
  MessagesSquare,
  Scale,
  Timer,
  Truck,
} from 'lucide-react'
import { formatCurrency, formatDate, formatNumber, tempoRestante } from '../../lib/businessRules'
import type { Carga, Prioridade } from '../../types'
import { useData } from '../../context/DataContext'
import { ChatModal } from '../carga/ChatModal'

function TrafficLight({ prioridade }: { prioridade: Prioridade | null }) {
  const active = prioridade ?? 'baixa'
  return (
    <div
      className="cargo-semaforo flex flex-col gap-1 rounded-md border border-ink/70 bg-[#2a2a2a] p-1 shadow-inner"
      title={
        active === 'alta' ? 'Prioridade alta' : active === 'media' ? 'Prioridade média' : 'Prioridade baixa'
      }
    >
      {(['alta', 'media', 'baixa'] as const).map((p) => {
        const on = active === p
        const color =
          p === 'alta' ? 'bg-[#e84752]' : p === 'media' ? 'bg-[#f5c518]' : 'bg-[#2f9e6a]'
        return (
          <span
            key={p}
            className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${
              on ? `${color} cargo-semaforo-on shadow-[0_0_8px_currentColor]` : 'bg-white/20'
            }`}
          />
        )
      })}
    </div>
  )
}

function IconReais({ size = 15 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-[#d4a05a] to-[#8f5a22] font-bold text-white shadow-sm"
      style={{ width: size + 4, height: size + 4, fontSize: Math.max(9, size * 0.5) }}
      aria-hidden
    >
      R$
    </span>
  )
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-ink/45">{icon}</span>
      <p className="min-w-0 leading-tight">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          {label}
        </span>
        <span className="mt-0.5 block truncate font-medium text-ink">{value}</span>
      </p>
    </div>
  )
}

interface CargoCardProps {
  carga: Carga
  mode: 'minerva' | 'transportador'
  selected?: boolean
  onSelect: () => void
  onView?: () => void
  onBid?: () => void
  onRefuse?: () => void
  onAllocate?: () => void
  bidValue?: number | null
  bidPosition?: number | null
  ofertasCount?: number
}

export function CargoCard({
  carga,
  mode,
  selected,
  onSelect,
  onView,
  onBid,
  onRefuse,
  onAllocate,
  bidValue,
  bidPosition,
  ofertasCount,
}: CargoCardProps) {
  const { tick } = useData()
  const [chatOpen, setChatOpen] = useState(false)
  void tick

  const frete =
    carga.frete_fechado ??
    carga.frete_oferta ??
    (carga.status !== 'nova_carga' ? carga.frete_tabela : null)

  const freteLinha =
    mode === 'transportador' && bidValue != null ? bidValue : frete

  const janela = tempoRestante(carga.expira_em ?? carga.alocacao_expira_em)
  const urgente =
    Boolean(carga.expira_em) &&
    new Date(carga.expira_em!).getTime() - Date.now() < 5 * 60_000

  const isAlocada = carga.status === 'alocadas' || Boolean(onAllocate)

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className={`cargo-card group relative cursor-pointer overflow-hidden rounded-xl border bg-panel text-left shadow-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md ${
        selected
          ? 'border-brand ring-2 ring-brand/70 ring-offset-1'
          : 'border-ink/12 hover:border-ink/25'
      }`}
    >
      <div className="cargo-card-shine pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

      <div className="relative p-3">
        {/* Cabeçalho */}
        <div className="mb-2.5 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-[13px] font-bold tracking-tight text-ink">
                <span className="text-ink-muted">Carga</span>{' '}
                <span className="tabular-nums">{carga.numero}</span>
              </p>
              <div
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                  urgente
                    ? 'animate-pulse-soft bg-[#e84752]/12 text-[#c62828]'
                    : 'bg-ink/[0.06] text-ink'
                }`}
              >
                <Timer size={12} strokeWidth={2.4} className={urgente ? 'cargo-icon-tick' : ''} />
                {janela}
              </div>
            </div>

            {/* Rota em destaque */}
            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-sand-light/80 px-2 py-1.5">
              <MapPinned size={14} className="shrink-0 text-[#2f80ed]" strokeWidth={2.2} />
              <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">
                <span>{carga.origem || '—'}</span>
                <span className="cargo-route-arrow mx-1.5 inline-block text-ink-muted">→</span>
                <span>{carga.destino || '—'}</span>
              </p>
            </div>
          </div>
          <TrafficLight prioridade={carga.prioridade} />
        </div>

        {/* Metadados */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-2">
          <MetaRow
            icon={<CalendarDays size={13} strokeWidth={2.2} />}
            label="Carregamento"
            value={formatDate(carga.data_carregamento)}
          />
          <MetaRow
            icon={<Scale size={13} strokeWidth={2.2} />}
            label="Peso"
            value={formatNumber(carga.peso)}
          />
          {bidPosition != null && (
            <div className="col-span-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                Posição
              </span>
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-ink px-1.5 text-[11px] font-bold text-white">
                {bidPosition}º
              </span>
            </div>
          )}
        </div>

        {/* Frete + ofertas */}
        <div className="mt-3 flex items-end justify-between gap-2 border-t border-ink/8 pt-2.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Frete</p>
            <p className="font-display text-[15px] font-bold tabular-nums tracking-tight text-ink">
              {freteLinha != null ? formatCurrency(freteLinha) : '—'}
            </p>
          </div>
          {ofertasCount != null ? (
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                Ofertas
              </p>
              <span className="cargo-badge-pop mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#2f9e6a] px-2 text-[12px] font-bold text-white shadow-sm">
                {ofertasCount}
              </span>
            </div>
          ) : mode === 'minerva' && carga.modo_publicacao ? (
            <span className="rounded-full bg-brand/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink">
              {carga.modo_publicacao === 'oferta' ? 'Oferta' : 'Leilão'}
            </span>
          ) : null}
        </div>

        {/* Ações */}
        <div className="mt-2.5 flex items-center gap-1.5">
          <div className="flex items-center gap-1">
            {onView && (
              <IconBtn title="Ver detalhes" tone="view" onClick={onView}>
                <Eye size={16} strokeWidth={2.3} />
              </IconBtn>
            )}
            {onRefuse && (
              <IconBtn title="Recusar" tone="ban" onClick={onRefuse}>
                <Ban size={16} strokeWidth={2.4} />
              </IconBtn>
            )}
            {onBid && (
              <IconBtn title="Fazer lance" tone="bid" onClick={onBid}>
                <Gavel size={15} strokeWidth={2.3} />
              </IconBtn>
            )}
            {!onBid && mode === 'minerva' && carga.status !== 'nova_carga' && (
              <IconBtn title="Negociação / frete" tone="money" onClick={onView ?? onSelect}>
                <IconReais size={14} />
              </IconBtn>
            )}
            {!onBid && mode === 'transportador' && freteLinha != null && !onAllocate && (
              <IconBtn title="Valor do frete" tone="money" onClick={onView}>
                <IconReais size={14} />
              </IconBtn>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1">
            {isAlocada ? (
              <IconBtn title="Alocar composição" tone="truck" onClick={onAllocate}>
                <Truck size={17} strokeWidth={2.2} />
              </IconBtn>
            ) : (
              <IconBtn title="Mensagens" tone="msg" onClick={() => setChatOpen(true)}>
                <MessagesSquare size={16} strokeWidth={2.3} />
              </IconBtn>
            )}
          </div>
        </div>
      </div>

      <ChatModal
        carga={carga}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </article>
  )
}

type IconTone = 'view' | 'bid' | 'ban' | 'money' | 'msg' | 'truck'

const TONE_CLASS: Record<IconTone, string> = {
  view: 'text-[#2f80ed] bg-[#2f80ed]/10 hover:bg-[#2f80ed]/18 hover:shadow-[0_0_0_3px_rgba(47,128,237,0.15)]',
  bid: 'text-[#c97a2b] bg-[#f2994a]/15 hover:bg-[#f2994a]/25 hover:shadow-[0_0_0_3px_rgba(242,153,74,0.18)]',
  ban: 'text-[#e85d04] bg-[#e85d04]/10 hover:bg-[#e85d04]/18 hover:shadow-[0_0_0_3px_rgba(232,93,4,0.15)]',
  money: 'text-[#8f5a22] bg-[#b87333]/12 hover:bg-[#b87333]/20 hover:shadow-[0_0_0_3px_rgba(184,115,51,0.15)]',
  msg: 'text-ink bg-ink/[0.06] hover:bg-ink/[0.1] hover:shadow-[0_0_0_3px_rgba(0,0,0,0.06)]',
  truck: 'text-ink bg-brand/35 hover:bg-brand/55 hover:shadow-[0_0_0_3px_rgba(249,219,0,0.35)]',
}

function IconBtn({
  children,
  title,
  onClick,
  tone = 'view',
}: {
  children: React.ReactNode
  title: string
  onClick?: () => void
  tone?: IconTone
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={`cargo-icon-btn inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-110 active:translate-y-0 active:scale-95 ${TONE_CLASS[tone]}`}
    >
      <span className="cargo-icon-inner inline-flex">{children}</span>
    </button>
  )
}
