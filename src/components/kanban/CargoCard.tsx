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
      <svg viewBox="0 0 56 120" className="cargo-semaforo__svg" aria-hidden>
        <defs>
          <linearGradient id="sfHousing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4b5563" />
            <stop offset="45%" stopColor="#1f2937" />
            <stop offset="100%" stopColor="#030712" />
          </linearGradient>
          <radialGradient id="sfOff" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#374151" />
            <stop offset="100%" stopColor="#111827" />
          </radialGradient>
          <radialGradient id="sfRed" cx="32%" cy="28%" r="72%">
            <stop offset="0%" stopColor="#fecaca" />
            <stop offset="40%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#7f1d1d" />
          </radialGradient>
          <radialGradient id="sfYellow" cx="32%" cy="28%" r="72%">
            <stop offset="0%" stopColor="#fef9c3" />
            <stop offset="40%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#713f12" />
          </radialGradient>
          <radialGradient id="sfGreen" cx="32%" cy="28%" r="72%">
            <stop offset="0%" stopColor="#bbf7d0" />
            <stop offset="40%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#14532d" />
          </radialGradient>
        </defs>
        {/* Visor / teto */}
        <path
          d="M10 10h36l4 8H6l4-8z"
          fill="#111827"
          stroke="#030712"
          strokeWidth="1"
        />
        {/* Corpo */}
        <rect x="8" y="16" width="40" height="88" rx="10" fill="url(#sfHousing)" />
        <rect
          x="12"
          y="20"
          width="32"
          height="80"
          rx="8"
          fill="#0b0f14"
          opacity="0.55"
        />
        {/* Lentes */}
        {(
          [
            ['alta', 34, 'sfRed'],
            ['media', 58, 'sfYellow'],
            ['baixa', 82, 'sfGreen'],
          ] as const
        ).map(([p, cy, grad]) => {
          const on = active === p
          return (
            <g key={p}>
              <circle
                cx="28"
                cy={cy}
                r="11.5"
                fill="#030712"
                opacity="0.9"
              />
              <circle
                cx="28"
                cy={cy}
                r="9.5"
                fill={on ? `url(#${grad})` : 'url(#sfOff)'}
                className={on ? 'cargo-semaforo__svg-on' : undefined}
              />
              {on && (
                <circle cx="24.5" cy={cy - 3} r="2.4" fill="#fff" opacity="0.55" />
              )}
            </g>
          )
        })}
        {/* Haste */}
        <rect x="24" y="104" width="8" height="14" rx="1.5" fill="#374151" />
        <rect x="20" y="116" width="16" height="3" rx="1" fill="#1f2937" />
      </svg>
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
    <svg viewBox="0 0 64 64" className="cargo-icon-svg cargo-icon-svg--lg cargo-gavel" aria-hidden>
      <defs>
        <linearGradient id="gavelWood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0c27a" />
          <stop offset="40%" stopColor="#c68642" />
          <stop offset="100%" stopColor="#5d3412" />
        </linearGradient>
        <linearGradient id="gavelHead" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8c89a" />
          <stop offset="50%" stopColor="#b45309" />
          <stop offset="100%" stopColor="#78350f" />
        </linearGradient>
        <linearGradient id="gavelBase" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d6d3d1" />
          <stop offset="100%" stopColor="#57534e" />
        </linearGradient>
      </defs>
      {/* Base fixa */}
      <ellipse cx="28" cy="54" rx="18" ry="4.5" fill="#44403c" opacity="0.35" />
      <rect x="12" y="46" width="32" height="8" rx="2.5" fill="url(#gavelBase)" />
      <rect x="14" y="47.5" width="28" height="2" rx="1" fill="#f5f5f4" opacity="0.35" />
      {/* Martelo (cabo + cabeça) — anima batendo */}
      <g className="cargo-gavel__swing">
        <g transform="rotate(-42 36 30)">
          <rect x="32" y="14" width="8" height="34" rx="3" fill="url(#gavelWood)" />
          <rect x="33.5" y="16" width="2" height="30" rx="1" fill="#fde68a" opacity="0.35" />
        </g>
        <g transform="rotate(-42 26 18)">
          <rect x="10" y="10" width="28" height="14" rx="3.5" fill="url(#gavelHead)" />
          <rect x="12" y="12" width="24" height="3" rx="1.2" fill="#fde68a" opacity="0.45" />
          <rect x="8" y="13" width="5" height="8" rx="1.5" fill="#92400e" />
          <rect x="35" y="13" width="5" height="8" rx="1.5" fill="#92400e" />
        </g>
      </g>
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
    <svg viewBox="0 0 64 64" className="cargo-icon-svg cargo-icon-svg--lg" aria-hidden>
      <defs>
        <linearGradient id="chatA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f3f4f6" />
          <stop offset="55%" stopColor="#9ca3af" />
          <stop offset="100%" stopColor="#4b5563" />
        </linearGradient>
        <linearGradient id="chatB" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="45%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#a16207" />
        </linearGradient>
        <filter id="chatShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.4" floodOpacity="0.28" />
        </filter>
      </defs>
      {/* Balão de fundo */}
      <g filter="url(#chatShadow)">
        <path
          d="M8 14c0-4.4 3.6-8 8-8h20c4.4 0 8 3.6 8 8v14c0 4.4-3.6 8-8 8H24l-8 7v-7h-8c-4.4 0-8-3.6-8-8V14z"
          fill="url(#chatA)"
        />
        <path
          d="M16 12h16"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.35"
        />
      </g>
      {/* Balão da frente (amarelo) */}
      <g filter="url(#chatShadow)">
        <path
          d="M22 24c0-4 3.2-7.2 7.2-7.2h18.6c4 0 7.2 3.2 7.2 7.2v12.5c0 4-3.2 7.2-7.2 7.2H42l-7.5 6.5v-6.5h-5.3c-4 0-7.2-3.2-7.2-7.2V24z"
          fill="url(#chatB)"
        />
        <path
          d="M30 22h14"
          stroke="#fffbeb"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.5"
        />
        <circle cx="34" cy="30.5" r="2.1" fill="#422006" />
        <circle cx="41" cy="30.5" r="2.1" fill="#422006" />
        <circle cx="48" cy="30.5" r="2.1" fill="#422006" />
      </g>
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
  const { tick, mensagensNaoLidasDaCarga } = useData()
  const [chatOpen, setChatOpen] = useState(false)
  void tick
  const chatNaoLidas = mensagensNaoLidasDaCarga(carga.id)

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
              <IconBtn
                title={
                  chatNaoLidas > 0
                    ? `Mensagens (${chatNaoLidas} não lida${chatNaoLidas > 1 ? 's' : ''})`
                    : 'Mensagens'
                }
                tone="msg"
                badge={chatNaoLidas}
                onClick={() => setChatOpen(true)}
              >
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
  badge = 0,
}: {
  children: React.ReactNode
  title: string
  onClick?: () => void
  tone?: IconTone
  badge?: number
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
      className={`cargo-icon-btn ${TONE_CLASS[tone]}${badge > 0 ? ' cargo-icon-btn--alert' : ''}`}
    >
      <span className="cargo-icon-inner">{children}</span>
      {badge > 0 && (
        <span className="cargo-icon-badge" aria-hidden>
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}
