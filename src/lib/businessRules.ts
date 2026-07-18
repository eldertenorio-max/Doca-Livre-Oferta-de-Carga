import type { ClassificacaoRota, ClassificacaoTransportador, ModoPublicacao, Prioridade } from '../types'

/** Faixas de margem por classificação de rota (PPT) */
export const MARGENS_POR_ROTA: Record<ClassificacaoRota, number[]> = {
  A: [-7, -8, -9],
  B: [-4, -5, -6],
  C: [-1, -2, -3],
}

export const PRAZOS_LEILAO_MINUTOS = [
  10, 20, 30, 40, 50,
  60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720,
  1440, 2880, 4320,
] as const

export const PRAZOS_ALOCACAO_MINUTOS = [10, 20, 30, 40, 50, 60, 120, 180, 240] as const

export const MOTIVOS_PRIORIDADE_ALTA = [
  'Cliente solicitou urgência',
  'Janela de carregamento crítica',
  'Risco de cancelamento do pedido',
  'Compromisso comercial especial',
  'Outros',
] as const

/** Pontuação de aderência (PPT) */
export const PONTOS_ADERENCIA = {
  visualizada_sem_acao: -1,
  nao_visualizada: -1,
  recusada: -1,
  com_proposta: 2,
  frete_fechado: 2,
} as const

export function calcularPrioridadeEModo(
  prazoMinutos: number,
  limiteUrgenciaMinutos = 30,
): {
  prioridade: Prioridade
  modo: ModoPublicacao
  exigeJustificativa: boolean
} {
  if (prazoMinutos <= limiteUrgenciaMinutos) {
    return { prioridade: 'alta', modo: 'oferta', exigeJustificativa: true }
  }
  if (prazoMinutos <= 59) {
    return { prioridade: 'media', modo: 'leilao', exigeJustificativa: false }
  }
  return { prioridade: 'baixa', modo: 'leilao', exigeJustificativa: false }
}

/** Arredonda valor monetário em 2 casas (evita 6768.67920000000005). */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function calcularFreteOferta(freteTabela: number, margemPercentual: number) {
  const ganho = roundMoney(freteTabela * (margemPercentual / 100))
  return {
    ganho,
    freteOferta: roundMoney(freteTabela + ganho),
  }
}

/** Exibe valor para input (ex.: 6.768,68). */
export function formatMoneyInput(value: number): string {
  return roundMoney(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Converte texto pt-BR / en-US em número (2 casas). */
export function parseMoneyInput(raw: string): number {
  const s = raw.trim()
  if (!s) return NaN
  let normalized = s
  if (s.includes(',')) {
    normalized = s.replace(/\./g, '').replace(',', '.')
  }
  const n = Number(normalized)
  return Number.isFinite(n) ? roundMoney(n) : NaN
}

export function classificacaoPorPontuacao(pontos: number): ClassificacaoTransportador {
  if (pontos >= 80) return 'ouro'
  if (pontos >= 50) return 'prata'
  return 'bronze'
}

export function formatPrazoLabel(minutos: number): string {
  if (minutos < 60) return `${minutos} Minutos`
  const horas = minutos / 60
  return horas === 1 ? '1 Hora' : `${horas} Horas`
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR')
}

/** Tempo restante até expira_em (mm:ss ou h:mm) */
export function tempoRestante(expiraEm: string | null): string {
  if (!expiraEm) return '—'
  const diff = new Date(expiraEm).getTime() - Date.now()
  if (diff <= 0) return '0:00'
  const totalSec = Math.floor(diff / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}h`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function prioridadeColor(p: Prioridade | null): string {
  if (p === 'alta') return 'var(--priority-high)'
  if (p === 'media') return 'var(--priority-medium)'
  return 'var(--priority-low)'
}
