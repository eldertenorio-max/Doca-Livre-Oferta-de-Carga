import {
  Eye,
  Gavel,
  ThumbsDown,
  MessagesSquare,
  Truck,
  DollarSign,
} from 'lucide-react'
import { formatCurrency, formatDate, formatNumber, tempoRestante } from '../../lib/businessRules'
import type { Carga, Prioridade } from '../../types'
import { useData } from '../../context/DataContext'

function TrafficLight({ prioridade }: { prioridade: Prioridade | null }) {
  const active = prioridade ?? 'baixa'
  return (
    <div className="flex flex-col gap-0.5 rounded-full bg-ink-deep/90 p-1">
      {(['alta', 'media', 'baixa'] as const).map((p) => (
        <span
          key={p}
          className={`h-2 w-2 rounded-full ${
            active === p
              ? p === 'alta'
                ? 'bg-brand'
                : p === 'media'
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              : 'bg-white/20'
          }`}
        />
      ))}
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
  void tick

  const frete =
    carga.frete_fechado ??
    carga.frete_oferta ??
    (carga.status !== 'nova_carga' ? carga.frete_tabela : null)

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className={`group relative cursor-pointer rounded-lg border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        selected ? 'border-brand ring-2 ring-brand/30' : 'border-ink/10'
      }`}
    >
      <div className="absolute right-2 top-2">
        <TrafficLight prioridade={carga.prioridade} />
      </div>

      {ofertasCount != null && ofertasCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white shadow">
          {ofertasCount}
        </span>
      )}

      <div className="mb-2 flex items-start justify-between gap-2 pr-5">
        <div>
          <p className="text-xs text-ink-muted">Carga</p>
          <p className="font-display text-base font-bold text-ink">{carga.numero}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-muted">Janela</p>
          <p
            className={`font-semibold tabular-nums ${
              carga.expira_em && new Date(carga.expira_em).getTime() - Date.now() < 5 * 60_000
                ? 'animate-pulse-soft text-brand'
                : 'text-ink'
            }`}
          >
            {tempoRestante(carga.expira_em ?? carga.alocacao_expira_em)}
          </p>
        </div>
      </div>

      <dl className="space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-ink-muted">Carregamento</dt>
          <dd className="font-medium">{formatDate(carga.data_carregamento)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-muted">Origem</dt>
          <dd className="max-w-[60%] truncate text-right font-medium">{carga.origem}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-muted">Destino</dt>
          <dd className="max-w-[60%] truncate text-right font-medium">{carga.destino}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-muted">Peso</dt>
          <dd className="font-medium">{formatNumber(carga.peso)}</dd>
        </div>
        {mode === 'transportador' && bidValue != null && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-muted">Lance</dt>
            <dd className="font-semibold text-ink">{formatCurrency(bidValue)}</dd>
          </div>
        )}
        {bidPosition != null && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-muted">Posição</dt>
            <dd>
              <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-sand-light">
                {bidPosition}º
              </span>
            </dd>
          </div>
        )}
        {frete != null && mode === 'minerva' && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-muted">Frete</dt>
            <dd className="font-semibold">{formatCurrency(frete)}</dd>
          </div>
        )}
        {(carga.status === 'alocadas' || (mode === 'transportador' && carga.frete_fechado)) &&
          carga.frete_fechado != null &&
          mode === 'transportador' && (
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Frete</dt>
              <dd className="font-semibold">{formatCurrency(carga.frete_fechado)}</dd>
            </div>
          )}
      </dl>

      <div className="mt-3 flex items-center gap-2 border-t border-ink/15 pt-2.5">
        {onView && (
          <IconBtn title="Ver detalhes" tone="view" onClick={onView}>
            <Eye size={18} strokeWidth={2.25} />
          </IconBtn>
        )}
        {onBid && (
          <IconBtn title="Fazer lance" tone="bid" onClick={onBid}>
            <Gavel size={18} strokeWidth={2.25} />
          </IconBtn>
        )}
        {onRefuse && (
          <IconBtn title="Recusar" tone="danger" onClick={onRefuse}>
            <ThumbsDown size={18} strokeWidth={2.25} fill="currentColor" />
          </IconBtn>
        )}
        {mode === 'minerva' && carga.status !== 'nova_carga' && (
          <IconBtn title="Negociação / frete" tone="money" onClick={onView ?? onSelect}>
            <DollarSign size={18} strokeWidth={2.25} />
          </IconBtn>
        )}
        {mode === 'minerva' && carga.modo_publicacao && (
          <span className="ml-auto rounded-md bg-ink/[0.06] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-ink-muted">
            {carga.modo_publicacao === 'oferta' ? 'Oferta' : 'Leilão'}
          </span>
        )}
        {mode === 'transportador' && (
          <IconBtn title="Mensagens" tone="msg">
            <MessagesSquare size={18} strokeWidth={2.25} />
          </IconBtn>
        )}
        {(carga.status === 'alocadas' || onAllocate) && (
          <IconBtn title="Alocar" tone="alloc" onClick={onAllocate}>
            <Truck size={18} strokeWidth={2.25} />
          </IconBtn>
        )}
      </div>
    </article>
  )
}

type IconTone = 'view' | 'bid' | 'danger' | 'money' | 'msg' | 'alloc'

/** Cores alinhadas à referência: olho azul, martelo laranja, polegar vermelho, mensagens preto */
const TONE_CLASS: Record<IconTone, string> = {
  view: 'text-[#2f80ed] hover:bg-[#2f80ed]/10',
  bid: 'text-[#f2994a] hover:bg-[#f2994a]/10',
  danger: 'text-[#eb5757] hover:bg-[#eb5757]/10',
  money: 'text-amber-600 hover:bg-amber-50',
  msg: 'text-[#1a1a1a] hover:bg-ink/5',
  alloc: 'text-emerald-600 hover:bg-emerald-50',
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
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition duration-150 ease-out hover:scale-105 active:scale-95 ${TONE_CLASS[tone]}`}
    >
      {children}
    </button>
  )
}
