import { useState } from 'react'
import { formatCurrency, formatDate, formatNumber, tempoRestante } from '../../lib/businessRules'
import type { Carga, Prioridade } from '../../types'
import { useData } from '../../context/DataContext'
import { ChatModal } from '../carga/ChatModal'

function TrafficLight({ prioridade }: { prioridade: Prioridade | null }) {
  const active = prioridade ?? 'baixa'
  const label =
    active === 'alta'
      ? 'Prioridade alta'
      : active === 'media'
        ? 'Prioridade média'
        : 'Prioridade baixa'

  return (
    <div className="cargo-semaforo" title={label} aria-label={label}>
      <div className="cargo-semaforo__cap" />
      <div className="cargo-semaforo__body">
        {(['alta', 'media', 'baixa'] as const).map((p) => {
          const on = active === p
          return (
            <span
              key={p}
              className={`cargo-semaforo__lens cargo-semaforo__lens--${p} ${
                on ? 'cargo-semaforo__lens--on' : ''
              }`}
            >
              <span className="cargo-semaforo__glare" />
            </span>
          )
        })}
      </div>
      <div className="cargo-semaforo__pole" />
    </div>
  )
}

function IconEye() {
  return (
    <svg viewBox="0 0 48 48" className="cargo-icon-svg" aria-hidden>
      <defs>
        <radialGradient id="eyeBall" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#dbeafe" />
          <stop offset="100%" stopColor="#93c5fd" />
        </radialGradient>
        <linearGradient id="eyeLid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <path
        d="M4 24c5.5-10 12.5-15 20-15s14.5 5 20 15c-5.5 10-12.5 15-20 15S9.5 34 4 24z"
        fill="url(#eyeLid)"
      />
      <ellipse cx="24" cy="24" rx="10.5" ry="11" fill="url(#eyeBall)" />
      <circle cx="24" cy="24" r="5.2" fill="#1e3a8a" />
      <circle cx="21.5" cy="21.5" r="1.8" fill="#fff" opacity="0.9" />
    </svg>
  )
}

function IconBan() {
  return (
    <svg viewBox="0 0 48 48" className="cargo-icon-svg" aria-hidden>
      <defs>
        <linearGradient id="banRing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#c2410c" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="18" fill="url(#banRing)" />
      <circle cx="24" cy="24" r="12.5" fill="#fff7ed" />
      <rect
        x="10"
        y="21.5"
        width="28"
        height="5"
        rx="2"
        transform="rotate(-45 24 24)"
        fill="#c2410c"
      />
    </svg>
  )
}

function IconGavel() {
  return (
    <svg viewBox="0 0 48 48" className="cargo-icon-svg" aria-hidden>
      <defs>
        <linearGradient id="gavelWood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="45%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
        <linearGradient id="gavelMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <rect x="8" y="36" width="28" height="6" rx="2" fill="url(#gavelMetal)" />
      <rect
        x="28"
        y="10"
        width="7"
        height="26"
        rx="2"
        transform="rotate(38 31.5 23)"
        fill="url(#gavelWood)"
      />
      <rect
        x="14"
        y="8"
        width="18"
        height="11"
        rx="2.5"
        transform="rotate(38 23 13.5)"
        fill="url(#gavelMetal)"
      />
      <circle cx="36" cy="12" r="3" fill="#fde68a" opacity="0.85" />
    </svg>
  )
}

function IconReais() {
  return (
    <svg viewBox="0 0 48 48" className="cargo-icon-svg" aria-hidden>
      <defs>
        <radialGradient id="coinFace" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="55%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#92400e" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="18" fill="url(#coinFace)" stroke="#78350f" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="14" fill="none" stroke="#fde68a" strokeWidth="1.2" opacity="0.7" />
      <text
        x="24"
        y="29"
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        fill="#fffbeb"
        fontFamily="Segoe UI, system-ui, sans-serif"
      >
        R$
      </text>
    </svg>
  )
}

function IconChat() {
  return (
    <svg viewBox="0 0 48 48" className="cargo-icon-svg" aria-hidden>
      <defs>
        <linearGradient id="chatA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e5e7eb" />
          <stop offset="100%" stopColor="#9ca3af" />
        </linearGradient>
        <linearGradient id="chatB" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#eab308" />
        </linearGradient>
      </defs>
      <path
        d="M8 12c0-3 2.5-5.5 5.5-5.5H28c3 0 5.5 2.5 5.5 5.5v10c0 3-2.5 5.5-5.5 5.5h-6l-6 5v-5h-2.5C10.5 27.5 8 25 8 22V12z"
        fill="url(#chatA)"
        stroke="#4b5563"
        strokeWidth="1"
      />
      <path
        d="M18 20c0-2.8 2.2-5 5-5h12c2.8 0 5 2.2 5 5v8c0 2.8-2.2 5-5 5h-2l-5 4v-4h-5c-2.8 0-5-2.2-5-5v-8z"
        fill="url(#chatB)"
        stroke="#a16207"
        strokeWidth="1"
      />
      <circle cx="28" cy="24" r="1.4" fill="#713f12" />
      <circle cx="33" cy="24" r="1.4" fill="#713f12" />
      <circle cx="38" cy="24" r="1.4" fill="#713f12" />
    </svg>
  )
}

function IconTruck() {
  return (
    <svg viewBox="0 0 48 48" className="cargo-icon-svg" aria-hidden>
      <defs>
        <linearGradient id="truckCab" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
        <linearGradient id="truckBox" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e5e7eb" />
          <stop offset="100%" stopColor="#6b7280" />
        </linearGradient>
      </defs>
      <rect x="4" y="14" width="22" height="16" rx="2" fill="url(#truckBox)" />
      <path d="M26 18h10l6 7v5H26V18z" fill="url(#truckCab)" stroke="#854d0e" strokeWidth="0.8" />
      <rect x="30" y="20" width="5" height="4" rx="0.8" fill="#7dd3fc" opacity="0.9" />
      <circle cx="12" cy="34" r="4.5" fill="#1f2937" />
      <circle cx="12" cy="34" r="2" fill="#9ca3af" />
      <circle cx="34" cy="34" r="4.5" fill="#1f2937" />
      <circle cx="34" cy="34" r="2" fill="#9ca3af" />
    </svg>
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

  const freteLinha = mode === 'transportador' && bidValue != null ? bidValue : frete

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
      className={`cargo-card group relative rounded-md border bg-[#f4f4f4] p-3 text-left text-[12px] leading-snug shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#eee] hover:shadow-md ${
        selected
          ? 'border-brand ring-2 ring-brand ring-offset-1'
          : 'border-ink/70 hover:border-ink'
      }`}
    >
      <div className="mb-1.5 flex items-start gap-2.5">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <p>
              <span className="font-bold text-ink">Carga:</span>{' '}
              <span className="font-semibold tabular-nums text-ink">{carga.numero}</span>
            </p>
            <p
              className={
                urgente ? 'animate-pulse-soft font-semibold text-[#e84752]' : 'text-ink'
              }
            >
              <span className="font-bold">Janela:</span> {janela}
            </p>
          </div>
          <p>
            <span className="font-bold text-ink">Carregamento:</span>{' '}
            <span className="text-ink/90">{formatDate(carga.data_carregamento)}</span>
          </p>
          <p>
            <span className="font-bold text-ink">Origem:</span>{' '}
            <span className="text-ink/90">{carga.origem || '—'}</span>
          </p>
          <p>
            <span className="font-bold text-ink">Destino:</span>{' '}
            <span className="text-ink/90">{carga.destino || '—'}</span>
          </p>
          <p>
            <span className="font-bold text-ink">Peso:</span>{' '}
            <span className="text-ink/90">{formatNumber(carga.peso ?? 0)}</span>
          </p>
          {bidPosition != null && (
            <p>
              <span className="font-bold text-ink">Posição:</span>{' '}
              <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">
                {bidPosition}º
              </span>
            </p>
          )}
        </div>
        <TrafficLight prioridade={carga.prioridade} />
      </div>

      <div className="mt-2 border-t border-ink/50 pt-2.5">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <p>
            <span className="font-bold text-ink">Frete:</span>{' '}
            <span className="text-[13px] font-semibold tabular-nums text-ink">
              {freteLinha != null ? formatCurrency(freteLinha) : '—'}
            </span>
          </p>
          {ofertasCount != null && (
            <p className="flex items-center gap-1.5">
              <span className="font-bold text-ink">Ofertas:</span>
              <span className="cargo-badge-pop inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#2f9e6a] px-1.5 text-[12px] font-bold text-white">
                {ofertasCount}
              </span>
            </p>
          )}
          {mode === 'minerva' && carga.modo_publicacao && ofertasCount == null && (
            <span className="text-[10px] font-bold uppercase text-ink-muted">
              {carga.modo_publicacao === 'oferta' ? 'Oferta' : 'Leilão'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            {onView && (
              <IconBtn title="Ver detalhes" tone="view" onClick={onView}>
                <IconEye />
              </IconBtn>
            )}
            {onRefuse && (
              <IconBtn title="Recusar" tone="ban" onClick={onRefuse}>
                <IconBan />
              </IconBtn>
            )}
            {onBid && (
              <IconBtn title="Fazer lance" tone="bid" onClick={onBid}>
                <IconGavel />
              </IconBtn>
            )}
            {!onBid && mode === 'minerva' && carga.status !== 'nova_carga' && (
              <IconBtn title="Negociação / frete" tone="money" onClick={onView ?? onSelect}>
                <IconReais />
              </IconBtn>
            )}
            {!onBid && mode === 'transportador' && freteLinha != null && !onAllocate && (
              <IconBtn title="Valor do frete" tone="money" onClick={onView}>
                <IconReais />
              </IconBtn>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {isAlocada ? (
              <IconBtn title="Alocar composição" tone="truck" onClick={onAllocate}>
                <IconTruck />
              </IconBtn>
            ) : (
              <IconBtn title="Mensagens" tone="msg" onClick={() => setChatOpen(true)}>
                <IconChat />
              </IconBtn>
            )}
          </div>
        </div>
      </div>

      <ChatModal carga={carga} open={chatOpen} onClose={() => setChatOpen(false)} />
    </article>
  )
}

type IconTone = 'view' | 'bid' | 'ban' | 'money' | 'msg' | 'truck'

const TONE_CLASS: Record<IconTone, string> = {
  view: 'cargo-icon-btn--view',
  bid: 'cargo-icon-btn--bid',
  ban: 'cargo-icon-btn--ban',
  money: 'cargo-icon-btn--money',
  msg: 'cargo-icon-btn--msg',
  truck: 'cargo-icon-btn--truck',
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
      className={`cargo-icon-btn ${TONE_CLASS[tone]}`}
    >
      <span className="cargo-icon-inner">{children}</span>
    </button>
  )
}
