import { useState } from 'react'
import { Ban, Eye, Gavel, MessagesSquare, Truck } from 'lucide-react'
import { formatCurrency, formatDate, formatNumber, tempoRestante } from '../../lib/businessRules'
import type { Carga, Prioridade } from '../../types'
import { useData } from '../../context/DataContext'
import { ChatModal } from '../carga/ChatModal'

function TrafficLight({ prioridade }: { prioridade: Prioridade | null }) {
  const active = prioridade ?? 'baixa'
  return (
    <div className="flex flex-col gap-0.5 rounded-sm border border-ink/80 bg-[#3a3a3a] p-0.5">
      {(['alta', 'media', 'baixa'] as const).map((p) => (
        <span
          key={p}
          className={`h-2 w-2 rounded-full ${
            active === p
              ? p === 'alta'
                ? 'bg-[#e84752]'
                : p === 'media'
                  ? 'bg-[#f5c518]'
                  : 'bg-[#2f9e6a]'
              : 'bg-white/25'
          }`}
        />
      ))}
    </div>
  )
}

/** Ícone R$ no estilo da referência (círculo bronze) */
function IconReais({ size = 18 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-[#b87333] font-bold text-white"
      style={{ width: size + 2, height: size + 2, fontSize: Math.max(9, size * 0.48) }}
      aria-hidden
    >
      R$
    </span>
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
    mode === 'transportador' && bidValue != null
      ? bidValue
      : frete

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
      className={`group relative cursor-pointer border border-ink/80 bg-[#f2f2f2] p-2.5 text-left text-[12px] leading-snug transition hover:bg-[#ebebeb] ${
        selected ? 'ring-2 ring-[#f9db00] ring-offset-1' : ''
      }`}
    >
      {/* Cabeçalho: Carga + Janela + semáforo */}
      <div className="mb-1 flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <p>
              <span className="font-bold text-ink">Carga:</span>{' '}
              <span className="text-ink">{carga.numero}</span>
            </p>
            <p className={urgente ? 'animate-pulse-soft font-semibold text-[#e84752]' : 'text-ink'}>
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
            <span className="text-ink/90">{formatNumber(carga.peso)}</span>
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

      {/* Rodapé: frete / ofertas + ícones */}
      <div className="mt-2 border-t border-ink/70 pt-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p>
            <span className="font-bold text-ink">Frete:</span>{' '}
            <span className="text-ink/90">
              {freteLinha != null ? formatCurrency(freteLinha) : '—'}
            </span>
          </p>
          {ofertasCount != null && (
            <p className="flex items-center gap-1.5">
              <span className="font-bold text-ink">Ofertas:</span>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2f9e6a] px-1.5 text-[11px] font-bold text-white">
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
          {/* Ícones à esquerda */}
          <div className="flex items-center gap-1.5">
            {onView && (
              <IconBtn title="Ver detalhes" tone="view" onClick={onView}>
                <Eye size={18} strokeWidth={2.2} />
              </IconBtn>
            )}

            {/* Minerva / transportador: recusar */}
            {onRefuse && (
              <IconBtn title="Recusar" tone="ban" onClick={onRefuse}>
                <Ban size={18} strokeWidth={2.4} />
              </IconBtn>
            )}

            {/* Lance (transportador) — martelo; senão R$ para frete/negociação */}
            {onBid && (
              <IconBtn title="Fazer lance" tone="bid" onClick={onBid}>
                <Gavel size={17} strokeWidth={2.2} />
              </IconBtn>
            )}
            {!onBid && mode === 'minerva' && carga.status !== 'nova_carga' && (
              <IconBtn title="Negociação / frete" tone="money" onClick={onView ?? onSelect}>
                <IconReais size={16} />
              </IconBtn>
            )}
            {!onBid && mode === 'transportador' && freteLinha != null && !onAllocate && (
              <IconBtn title="Valor do frete" tone="money" onClick={onView}>
                <IconReais size={16} />
              </IconBtn>
            )}
          </div>

          {/* Direita: mensagens ou caminhão (alocação) */}
          <div className="ml-auto flex items-center gap-1.5">
            {isAlocada ? (
              <IconBtn title="Alocar composição" tone="truck" onClick={onAllocate}>
                <Truck size={20} strokeWidth={2.2} fill="currentColor" />
              </IconBtn>
            ) : (
              <IconBtn title="Mensagens" tone="msg" onClick={() => setChatOpen(true)}>
                <MessagesSquare size={18} strokeWidth={2.2} />
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
  view: 'text-[#2f80ed] hover:bg-[#2f80ed]/12',
  bid: 'text-[#f2994a] hover:bg-[#f2994a]/12',
  ban: 'text-[#e85d04] hover:bg-[#e85d04]/12',
  money: 'text-[#b87333] hover:bg-[#b87333]/12',
  msg: 'text-[#1a1a1a] hover:bg-ink/8',
  truck: 'text-[#111] hover:bg-ink/8',
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
      className={`inline-flex h-7 w-7 items-center justify-center rounded transition hover:scale-105 active:scale-95 ${TONE_CLASS[tone]}`}
    >
      {children}
    </button>
  )
}
