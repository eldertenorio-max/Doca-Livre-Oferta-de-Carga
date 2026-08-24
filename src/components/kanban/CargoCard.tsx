import { useId, useMemo, useState } from 'react'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  tempoDecorrido,
  tempoRestante,
} from '../../lib/businessRules'
import { asTipoOferta, isCargaRetorno, isOfertaDistribuicao, labelTipoOferta, totaisDistribuicao } from '../../lib/cargaDefaults'
import { labelFaixaTemperatura, MARCA_SEM_ESPECIFICA } from '../../lib/cargaExigencias'
import { limparPontosPassagemRota } from '../../lib/rotasSync'
import type { Carga, PontoPassagemRota } from '../../types'
import { useData } from '../../context/DataContext'
import { ChatModal } from '../carga/ChatModal'
import { Button, Modal } from '../ui/Modal'

function pontosDaCarga(
  carga: Carga,
  rotas: { id: string; pontos_passagem?: PontoPassagemRota[] }[],
): PontoPassagemRota[] {
  const daCarga = limparPontosPassagemRota(carga.pontos_passagem)
  if (daCarga.length > 0) return daCarga
  if (!carga.rota_id) return []
  const r = rotas.find((x) => x.id === carga.rota_id)
  return limparPontosPassagemRota(r?.pontos_passagem)
}

function labelPontosPassagem(n: number): string {
  if (n <= 0) return ''
  if (n === 1) return '1 ponto de passagem'
  return `${n} pontos de passagem`
}

/** Qual lente acende conforme a coluna do Kanban. */
type SemaforoNivel = 'alta' | 'media' | 'baixa'

function semaforoDaColuna(coluna?: string | null): {
  nivel: SemaforoNivel
  label: string
  corPadrao: string
} {
  switch (coluna) {
    case 'recusadas':
      return { nivel: 'alta', label: 'Recusadas', corPadrao: '#e84752' }
    case 'canceladas':
      return { nivel: 'alta', label: 'Canceladas', corPadrao: '#64748b' }
    case 'negociando':
      return { nivel: 'media', label: 'Negociando', corPadrao: '#3b82f6' }
    case 'propostas':
      return { nivel: 'media', label: 'Propostas', corPadrao: '#3b82f6' }
    case 'confirmadas':
      return { nivel: 'media', label: 'Confirmadas', corPadrao: '#ea580c' }
    case 'suspensas':
      return { nivel: 'media', label: 'Suspensas', corPadrao: '#8b5cf6' }
    case 'alocadas':
      return { nivel: 'baixa', label: 'Alocadas', corPadrao: '#2f9e6a' }
    case 'aguardando_inicio':
      return { nivel: 'media', label: 'Aguardando início', corPadrao: '#f59e0b' }
    case 'rota_iniciada':
      return { nivel: 'media', label: 'Rota iniciada', corPadrao: '#3b82f6' }
    case 'rota_finalizada':
      return { nivel: 'baixa', label: 'Rota finalizada', corPadrao: '#2f9e6a' }
    case 'cancelada':
      return { nivel: 'alta', label: 'Viagem cancelada', corPadrao: '#64748b' }
    case 'nova_carga':
    default:
      return { nivel: 'baixa', label: 'Nova Carga', corPadrao: '#22c55e' }
  }
}

function TrafficLight({
  coluna,
  corColuna,
}: {
  coluna?: string | null
  /** Cor da coluna do Kanban (acende a lente ativa). */
  corColuna?: string | null
}) {
  const uid = useId().replace(/:/g, '')
  const { nivel, label, corPadrao } = semaforoDaColuna(coluna)
  const cor = corColuna?.trim() || corPadrao
  const gid = {
    housing: `sfH-${uid}`,
    off: `sfOff-${uid}`,
    on: `sfOn-${uid}`,
  }

  return (
    <div className="cargo-semaforo" title={label} aria-label={`Coluna: ${label}`}>
      <svg viewBox="0 0 56 120" className="cargo-semaforo__svg" aria-hidden>
        <defs>
          <linearGradient id={gid.housing} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4b5563" />
            <stop offset="45%" stopColor="#1f2937" />
            <stop offset="100%" stopColor="#030712" />
          </linearGradient>
          <radialGradient id={gid.off} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#374151" />
            <stop offset="100%" stopColor="#111827" />
          </radialGradient>
          <radialGradient id={gid.on} cx="32%" cy="28%" r="72%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="38%" stopColor={cor} />
            <stop offset="100%" stopColor="#030712" />
          </radialGradient>
        </defs>
        <path
          d="M10 10h36l4 8H6l4-8z"
          fill="#111827"
          stroke="#030712"
          strokeWidth="1"
        />
        <rect x="8" y="16" width="40" height="88" rx="10" fill={`url(#${gid.housing})`} />
        <rect
          x="12"
          y="20"
          width="32"
          height="80"
          rx="8"
          fill="#0b0f14"
          opacity="0.55"
        />
        {(
          [
            ['alta', 34],
            ['media', 58],
            ['baixa', 82],
          ] as const
        ).map(([p, cy]) => {
          const on = nivel === p
          return (
            <g key={p}>
              <circle cx="28" cy={cy} r="11.5" fill="#030712" opacity="0.9" />
              <circle
                cx="28"
                cy={cy}
                r="9.5"
                fill={on ? `url(#${gid.on})` : `url(#${gid.off})`}
                className={on ? 'cargo-semaforo__svg-on' : undefined}
              />
              {on && (
                <circle cx="24.5" cy={cy - 3} r="2.4" fill="#fff" opacity="0.55" />
              )}
            </g>
          )
        })}
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

function IconMap() {
  return (
    <svg viewBox="0 0 48 48" className="cargo-icon-svg" aria-hidden>
      <defs>
        <linearGradient id="mapPin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="55%" stopColor="#059669" />
          <stop offset="100%" stopColor="#065f46" />
        </linearGradient>
        <linearGradient id="mapFold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#bbf7d0" />
          <stop offset="100%" stopColor="#6ee7b7" />
        </linearGradient>
      </defs>
      <path
        d="M8 14l11-4 10 4 11-4v28l-11 4-10-4-11 4V14z"
        fill="url(#mapFold)"
        stroke="#047857"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M19 10v28M29 14v28" stroke="#047857" strokeWidth="1.2" opacity="0.45" />
      <path
        d="M24 16c-3.6 0-6.5 2.7-6.5 6.1 0 4.6 6.5 11.4 6.5 11.4s6.5-6.8 6.5-11.4C30.5 18.7 27.6 16 24 16z"
        fill="url(#mapPin)"
      />
      <circle cx="24" cy="22" r="2.4" fill="#ecfdf5" />
    </svg>
  )
}

function IconRouteCalc() {
  return (
    <svg viewBox="0 0 48 48" className="cargo-icon-svg" aria-hidden>
      <defs>
        <linearGradient id="routeCalc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <rect x="8" y="10" width="32" height="28" rx="4" fill="url(#routeCalc)" />
      <path
        d="M16 30c4-8 6-8 10-4s6 4 10-4"
        fill="none"
        stroke="#fffbeb"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="16" cy="30" r="2.5" fill="#fff" />
      <circle cx="36" cy="22" r="2.5" fill="#fff" />
      <path d="M20 16h12M20 20h8" stroke="#fffbeb" strokeWidth="2" strokeLinecap="round" />
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

function IconTrash() {
  return (
    <svg viewBox="0 0 48 48" className="cargo-icon-svg" aria-hidden>
      <defs>
        <linearGradient id="trashBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fca5a5" />
          <stop offset="55%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#991b1b" />
        </linearGradient>
      </defs>
      <rect x="14" y="8" width="20" height="4" rx="1.5" fill="#7f1d1d" />
      <rect x="20" y="5" width="8" height="4" rx="1.2" fill="#991b1b" />
      <path
        d="M12 14h24l-2 26a4 4 0 0 1-4 3.5H18a4 4 0 0 1-4-3.5L12 14z"
        fill="url(#trashBody)"
      />
      <path d="M18 20v16M24 20v16M30 20v16" stroke="#fff7f7" strokeWidth="2.2" strokeLinecap="round" />
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
  /** Coluna atual do Kanban (define a cor do semáforo). */
  coluna?: string | null
  /** Cor da coluna no quadro (lente ativa). */
  colunaColor?: string | null
  selected?: boolean
  onSelect: () => void
  onView?: () => void
  onBid?: () => void
  onRefuse?: () => void
  onAllocate?: () => void
  /** Excluir rascunho não publicado (Minerva) */
  onDelete?: () => void
  /** Abrir mapa da frota a partir da origem da carga (embarcador) */
  onMapaFrota?: () => void
  /** Transportador: calcular rota / pedágio / combustível a partir da carga */
  onCalcularRota?: () => void
  /** Aba Viagens */
  onIniciarViagem?: () => void
  onFinalizarViagem?: () => void
  onCancelarViagem?: () => void
  onAvaliarViagem?: () => void
  bidValue?: number | null
  /** Posição por ordem de chegada (1 = primeiro a ofertar). */
  bidPosition?: number | null
  /** Total de propostas ativas na carga (para exibir N°/total). */
  bidCount?: number | null
  /** True se o lance atual é o de menor valor (melhor frete). */
  bidMelhor?: boolean
  ofertasCount?: number
}

export function CargoCard({
  carga,
  mode,
  coluna,
  colunaColor,
  selected,
  onSelect,
  onView,
  onBid,
  onRefuse,
  onAllocate,
  onDelete,
  onMapaFrota,
  onCalcularRota,
  onIniciarViagem,
  onFinalizarViagem,
  onCancelarViagem,
  onAvaliarViagem,
  bidValue,
  bidPosition,
  bidCount,
  bidMelhor,
  ofertasCount,
}: CargoCardProps) {
  const { tick, mensagensNaoLidasDaCarga, transportadorById, rotas } = useData()
  const [chatOpen, setChatOpen] = useState(false)
  const [diretosOpen, setDiretosOpen] = useState(false)
  const [pontosOpen, setPontosOpen] = useState(false)
  const [seqOpen, setSeqOpen] = useState(false)
  void tick
  const chatNaoLidas = mensagensNaoLidasDaCarga(carga.id)
  const diretosIds = carga.transportador_direto_ids ?? []
  const pontosPassagem = useMemo(
    () => pontosDaCarga(carga, rotas),
    [carga, rotas],
  )
  const qtdPontos = pontosPassagem.length
  const tipoOferta = asTipoOferta(carga.tipo_oferta)
  const isDist = isOfertaDistribuicao(carga)
  const pontosDist = carga.clientes_distribuicao ?? []
  const distTotais = totaisDistribuicao(carga)

  // Transportador sempre vê frete oferta/tabela no card (mesmo em Nova Carga).
  const frete =
    carga.frete_fechado ??
    carga.frete_oferta ??
    (mode === 'transportador' || carga.status !== 'nova_carga' ? carga.frete_tabela : null)

  const freteLinha = mode === 'transportador' && bidValue != null ? bidValue : frete

  const statusViagem = carga.status_viagem ?? null
  const emViagem =
    statusViagem === 'rota_iniciada' && Boolean(carga.viagem_iniciada_em)
  const viagemEncerrada =
    (statusViagem === 'rota_finalizada' || statusViagem === 'cancelada') &&
    Boolean(carga.viagem_iniciada_em)

  const tempoViagem = emViagem
    ? tempoDecorrido(carga.viagem_iniciada_em)
    : viagemEncerrada
      ? tempoDecorrido(
          carga.viagem_iniciada_em,
          carga.viagem_finalizada_em ?? carga.viagem_cancelada_em ?? null,
        )
      : null

  const janela = tempoRestante(carga.expira_em ?? carga.alocacao_expira_em)
  const urgente =
    !tempoViagem &&
    Boolean(carga.expira_em) &&
    new Date(carga.expira_em!).getTime() - Date.now() < 5 * 60_000

  const showAlocar = Boolean(onAllocate)
  const isRascunho = carga.status === 'nova_carga' && !carga.publicado_em

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
      {mode === 'minerva' && isRascunho && (
        <p className="mb-2 rounded bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-950">
          Rascunho — ainda não publicada (transportador não vê)
        </p>
      )}
      <p
        className={`mb-2 rounded px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide ${
          isDist
            ? 'bg-emerald-600 text-white'
            : 'bg-slate-800 text-white'
        }`}
      >
        {labelTipoOferta(tipoOferta)}
      </p>
      {(carga.temp_min != null ||
        carga.temp_max != null ||
        carga.exige_ajudante ||
        carga.gerenciamento_risco === 'rastreador' ||
        carga.gerenciamento_risco === 'localizador' ||
        carga.gerenciamento_risco === 'ambos') && (
        <p className="mb-2 rounded bg-white/80 px-2 py-1 text-[10px] font-semibold text-ink">
          {[
            labelFaixaTemperatura(carga) ? `Temp. ${labelFaixaTemperatura(carga)}` : '',
            carga.exige_ajudante ? 'Ajudante' : '',
            carga.gerenciamento_risco === 'rastreador' || carga.gerenciamento_risco === 'ambos'
              ? `Rastreador${
                  carga.marca_rastreador && carga.marca_rastreador !== MARCA_SEM_ESPECIFICA
                    ? ` ${carga.marca_rastreador}`
                    : ''
                }`
              : '',
            carga.gerenciamento_risco === 'localizador' || carga.gerenciamento_risco === 'ambos'
              ? `Localizador${
                  carga.marca_localizador && carga.marca_localizador !== MARCA_SEM_ESPECIFICA
                    ? ` ${carga.marca_localizador}`
                    : ''
                }`
              : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      <div className="mb-1.5 flex items-start gap-2.5">
        <div className="min-w-0 flex-1 space-y-1">
          <p>
            <span className="font-bold text-ink">Oferta:</span>{' '}
            <span className={isDist ? 'font-extrabold text-emerald-800' : 'font-extrabold text-ink'}>
              {labelTipoOferta(tipoOferta)}
            </span>
          </p>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <p>
              <span className="font-bold text-ink">Carga:</span>{' '}
              <span className="font-semibold tabular-nums text-ink">{carga.numero}</span>
            </p>
            {tempoViagem != null ? (
              <p className="font-semibold tabular-nums text-[#2563eb]">
                <span className="font-bold">Tempo:</span> {tempoViagem}
              </p>
            ) : (
              <p
                className={
                  urgente
                    ? 'animate-pulse-soft font-semibold text-[#e84752]'
                    : 'text-ink'
                }
              >
                <span className="font-bold">Janela:</span> {janela}
              </p>
            )}
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
          {isDist ? (
            <>
              {carga.nome_rota?.trim() ? (
                <p>
                  <span className="font-bold text-ink">Rota:</span>{' '}
                  <span className="text-ink/90">{carga.nome_rota}</span>
                </p>
              ) : null}
              <p>
                <span className="font-bold text-ink">Entregas:</span>{' '}
                <span className="text-ink/90">
                  {distTotais.pontos} ponto{distTotais.pontos === 1 ? '' : 's'}
                  {' · '}
                  {distTotais.entregas} entrega{distTotais.entregas === 1 ? '' : 's'}
                  {' · '}
                  {distTotais.nfs} NF{distTotais.nfs === 1 ? '' : 's'}
                </span>
              </p>
              {pontosDist.length > 0 ? (
                <div className="rounded bg-emerald-50/80 px-1.5 py-1">
                  <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-ink">
                    {pontosDist.slice(0, 5).map((p) => (
                      <li key={p.id}>
                        <span className="font-semibold">{p.nome || p.cidade || p.endereco || 'Ponto'}</span>
                        {p.pedido ? ` · Pedido ${p.pedido}` : ''}
                        {p.endereco && p.nome ? ` — ${p.endereco}` : ''}
                      </li>
                    ))}
                  </ol>
                  <button
                    type="button"
                    className="mt-0.5 text-[11px] font-semibold text-emerald-800 underline-offset-2 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSeqOpen(true)
                    }}
                  >
                    {pontosDist.length > 5
                      ? `Ver sequência completa (${pontosDist.length})`
                      : 'Ver sequência'}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
          {qtdPontos > 0 ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-bold text-sky-800">
                {labelPontosPassagem(qtdPontos)}
              </span>
              <button
                type="button"
                className="text-[11px] font-semibold text-sky-700 underline-offset-2 hover:underline"
                onClick={(e) => {
                  e.stopPropagation()
                  setPontosOpen(true)
                }}
              >
                Ver quais
              </button>
            </p>
          ) : null}
          <p>
            <span className="font-bold text-ink">Peso:</span>{' '}
            <span className="text-ink/90">
              {formatNumber(isDist ? distTotais.peso : (carga.peso ?? 0))} kg
            </span>
          </p>
          {isDist ? (
            <p>
              <span className="font-bold text-ink">Valor da carga:</span>{' '}
              <span className="text-ink/90">{formatCurrency(distTotais.valor)}</span>
            </p>
          ) : null}
          {(carga.placa || carga.motorista) && (
            <>
              <p>
                <span className="font-bold text-ink">Placa:</span>{' '}
                <span className="text-ink/90">{carga.placa || '—'}</span>
              </p>
              <p>
                <span className="font-bold text-ink">Motorista:</span>{' '}
                <span className="text-ink/90">{carga.motorista || '—'}</span>
              </p>
            </>
          )}
          {carga.avaliado_em &&
            (carga.avaliacao_motorista != null || carga.avaliacao_veiculo != null) && (
              <p>
                <span className="font-bold text-ink">Avaliação:</span>{' '}
                <span className="text-amber-600">
                  ★ {carga.avaliacao_motorista ?? '—'}/5 motorista · ★{' '}
                  {carga.avaliacao_veiculo ?? '—'}/5 veículo
                </span>
              </p>
            )}
          {mode === 'transportador' && bidValue != null && (
            <p>
              <span className="font-bold text-ink">Seu lance:</span>{' '}
              <span className="rounded bg-ink px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
                {formatCurrency(bidValue)}
              </span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <TrafficLight coluna={coluna ?? carga.status} corColuna={colunaColor} />
          {bidPosition != null && bidPosition > 0 && (
            <span
              className={`text-[22px] font-black leading-none tabular-nums ${
                bidMelhor ? 'text-[#2f9e6a]' : 'text-[#e84752]'
              }`}
              title={
                bidCount != null && bidCount > 1
                  ? `${bidPosition}º a ofertar de ${bidCount}${
                      bidMelhor ? ' · melhor frete (menor valor)' : ' · sem o menor frete'
                    }`
                  : `${bidPosition}º a ofertar`
              }
              aria-label={
                bidCount != null && bidCount > 1
                  ? `Ordem de chegada: ${bidPosition}º de ${bidCount}${
                      bidMelhor ? ', melhor frete' : ''
                    }`
                  : `Ordem de chegada: ${bidPosition}º`
              }
            >
              {bidPosition}°
              {bidCount != null && bidCount > 1 && (
                <span className="text-[11px] font-bold text-ink-muted">/{bidCount}</span>
              )}
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 border-t border-ink/50 pt-2.5">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <p>
            <span className="font-bold text-ink">
              {mode === 'transportador'
                ? carga.frete_fechado != null
                  ? 'Frete fechado:'
                  : 'Frete oferta:'
                : 'Frete:'}
            </span>{' '}
            <span className="text-[13px] font-semibold tabular-nums text-ink">
              {mode === 'transportador'
                ? frete != null
                  ? formatCurrency(frete)
                  : '—'
                : freteLinha != null
                  ? formatCurrency(freteLinha)
                  : '—'}
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
            <div className="relative">
              {carga.modo_publicacao === 'negociacao_direta' ? (
                <button
                  type="button"
                  className="rounded bg-blue-700 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white hover:bg-blue-800"
                  title="Ver para quem foi enviada"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDiretosOpen((v) => !v)
                  }}
                >
                  Negociação direta
                </button>
              ) : (
                <span className="text-[10px] font-bold uppercase text-ink-muted">
                  {carga.modo_publicacao === 'oferta' ? 'Oferta' : 'Leilão'}
                </span>
              )}
              {diretosOpen && carga.modo_publicacao === 'negociacao_direta' ? (
                <div
                  className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-ink/15 bg-white p-2 shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                    Enviado para ({diretosIds.length})
                  </p>
                  {diretosIds.length === 0 ? (
                    <p className="text-[11px] text-ink-muted">Nenhuma transportadora.</p>
                  ) : (
                    <ul className="max-h-40 space-y-1 overflow-y-auto text-[11px] font-semibold text-ink">
                      {diretosIds.map((id) => (
                        <li key={id}>
                          {transportadorById(id)?.nome_fantasia ||
                            transportadorById(id)?.razao_social ||
                            id}
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    className="mt-2 text-[10px] font-bold text-ink-muted hover:underline"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDiretosOpen(false)
                    }}
                  >
                    Fechar
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
        {isCargaRetorno(carga) ? (
          <p className="mb-2 text-sm font-extrabold uppercase tracking-wide text-red-600">
            Retorno
          </p>
        ) : null}

        <div className="cargo-card__actions">
          {onView && (
            <IconBtn title="Ver detalhes" tone="view" onClick={onView}>
              <IconEye />
            </IconBtn>
          )}
          {onMapaFrota && (
            <IconBtn
              title="Procurar motorista no mapa de frota"
              tone="map"
              onClick={onMapaFrota}
            >
              <IconMap />
            </IconBtn>
          )}
          {onCalcularRota && (
            <IconBtn
              title="Calcular rota, pedágio e combustível"
              tone="route"
              onClick={onCalcularRota}
            >
              <IconRouteCalc />
            </IconBtn>
          )}
          {onRefuse && (
            <IconBtn title="Recusar" tone="ban" onClick={onRefuse}>
              <IconBan />
            </IconBtn>
          )}
          {onDelete && (
            <IconBtn title="Excluir rascunho" tone="ban" onClick={onDelete}>
              <IconTrash />
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
          {showAlocar && (
            <IconBtn title="Alocar composição" tone="truck" onClick={onAllocate}>
              <IconTruck />
            </IconBtn>
          )}
          {onIniciarViagem && (
            <button
              type="button"
              className="rounded-md bg-[#2f9e6a] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#268556]"
              onClick={(e) => {
                e.stopPropagation()
                onIniciarViagem()
              }}
            >
              Iniciar viagem
            </button>
          )}
          {onFinalizarViagem && (
            <button
              type="button"
              className="rounded-md bg-[#3b82f6] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#2563eb]"
              onClick={(e) => {
                e.stopPropagation()
                onFinalizarViagem()
              }}
            >
              Finalizar rota
            </button>
          )}
          {onCancelarViagem && (
            <button
              type="button"
              className="rounded-md bg-[#64748b] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#475569]"
              onClick={(e) => {
                e.stopPropagation()
                onCancelarViagem()
              }}
            >
              Cancelar
            </button>
          )}
          {onAvaliarViagem && (
            <button
              type="button"
              className="rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-600"
              onClick={(e) => {
                e.stopPropagation()
                onAvaliarViagem()
              }}
            >
              {carga.avaliado_em ? 'Ver avaliação' : 'Avaliar ★'}
            </button>
          )}
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
        </div>
      </div>

      {chatOpen ? (
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <ChatModal carga={carga} open={chatOpen} onClose={() => setChatOpen(false)} />
        </div>
      ) : null}

      {pontosOpen ? (
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Modal
            open={pontosOpen}
            title={`Pontos de passagem — ${labelPontosPassagem(qtdPontos)}`}
            onClose={() => setPontosOpen(false)}
          >
            <div className="space-y-3">
              <p className="text-xs text-ink-muted">
                Carga {carga.numero}: {carga.origem || '—'} → {carga.destino || '—'}
              </p>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
                {pontosPassagem.map((p, idx) => (
                  <li key={p.id || idx} className="pl-1">
                    <span className="font-semibold text-ink-muted">
                      Ponto {idx + 1}:{' '}
                    </span>
                    {(p.endereco || '').trim() ||
                      (p.lat != null && p.lng != null
                        ? `${p.lat}, ${p.lng}`
                        : '—')}
                  </li>
                ))}
              </ol>
              <div className="flex justify-end pt-1">
                <Button variant="ghost" onClick={() => setPontosOpen(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      ) : null}

      {seqOpen && isDist ? (
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Modal
            open={seqOpen}
            title={`Sequência de entrega — ${carga.numero}`}
            onClose={() => setSeqOpen(false)}
          >
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                {labelTipoOferta('distribuicao')}
              </p>
              {carga.nome_rota?.trim() ? (
                <p className="text-sm text-ink">
                  <span className="font-bold">Rota:</span> {carga.nome_rota}
                </p>
              ) : null}
              {carga.seq_distribuicao === 'cidades' ? (
                <p className="text-xs text-ink-muted">Sequência por cidades</p>
              ) : (
                <p className="text-xs text-ink-muted">Sequência por clientes</p>
              )}
              <p className="text-xs text-ink-muted">
                {distTotais.pontos} ponto{distTotais.pontos === 1 ? '' : 's'} ·{' '}
                {distTotais.entregas} entrega{distTotais.entregas === 1 ? '' : 's'} ·{' '}
                {distTotais.nfs} NF{distTotais.nfs === 1 ? '' : 's'} ·{' '}
                {formatNumber(distTotais.peso)} kg · {formatCurrency(distTotais.valor)}
              </p>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
                {pontosDist.map((p, idx) => (
                  <li key={p.id || idx} className="pl-1">
                    <p className="font-semibold">
                      {p.nome || p.cidade || p.endereco || `Ponto ${idx + 1}`}
                    </p>
                    {p.endereco && p.nome ? (
                      <p className="text-xs text-ink-muted">{p.endereco}</p>
                    ) : null}
                    {p.cnpj?.trim() ? (
                      <p className="text-xs text-ink-muted">CNPJ {p.cnpj}</p>
                    ) : null}
                    {p.pedido?.trim() ? (
                      <p className="text-xs text-ink-muted">Pedido {p.pedido}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
              <div className="flex justify-end pt-1">
                <Button variant="ghost" onClick={() => setSeqOpen(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      ) : null}
    </article>
  )
}

type IconTone = 'view' | 'bid' | 'ban' | 'money' | 'msg' | 'truck' | 'map' | 'route'

const TONE_CLASS: Record<IconTone, string> = {
  view: 'cargo-icon-btn--view',
  bid: 'cargo-icon-btn--bid',
  ban: 'cargo-icon-btn--ban',
  money: 'cargo-icon-btn--money',
  msg: 'cargo-icon-btn--msg',
  truck: 'cargo-icon-btn--truck',
  map: 'cargo-icon-btn--map',
  route: 'cargo-icon-btn--route',
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
