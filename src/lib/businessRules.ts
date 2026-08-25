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
  com_proposta: 0,
  frete_fechado: 2,
} as const

/** Todo transportador começa aqui; o ranking é 50 + soma dos eventos das regras acima. */
export const PONTUACAO_INICIAL = 50

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

/**
 * Máscara ao digitar: só dígitos → valor em reais (centavos à direita).
 * Ex.: digitar 399000 → 3.990,00
 */
export function moneyFromDigits(raw: string, maxDigits = 12): { display: string; value: number } {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, maxDigits)
  const value = roundMoney(Number(digits || '0') / 100)
  return { display: formatMoneyInput(value), value }
}

/** Converte texto pt-BR / en-US / Excel (R$ 650.00) em número (2 casas). */
export function parseMoneyInput(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? roundMoney(raw) : NaN
  }
  const original = String(raw ?? '').trim()
  if (!original) return NaN

  // Remove símbolos de moeda e espaços (ex.: "R$ 650.00", "R$1.234,56")
  let s = original
    .replace(/R\$\s*/gi, '')
    .replace(/\s/g, '')
    .replace(/[^\d,.\-]/g, '')
  if (!s || s === '-' || s === '.' || s === ',') return NaN

  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  let normalized: string

  if (hasComma && hasDot) {
    // Último separador = decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // 1.234,56 (pt-BR)
      normalized = s.replace(/\./g, '').replace(',', '.')
    } else {
      // 1,234.56 (en-US)
      normalized = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    // 3500,00 ou 3.500,00 sem ponto já tratado; ou 3500,5
    const m = s.match(/^-?\d+,(\d{1,2})$/)
    if (m) normalized = s.replace(',', '.')
    else normalized = s.replace(/,/g, '')
  } else if (hasDot) {
    const parts = s.split('.')
    const afterLast = parts[parts.length - 1] ?? ''
    // Um ponto + 1–2 dígitos = decimal en-US/Excel ("650.00", "1.5")
    if (parts.length === 2 && afterLast.length <= 2) {
      normalized = s
    } else {
      // pt-BR milhar: "1.234" ou "1.234.567"
      normalized = s.replace(/\./g, '')
    }
  } else {
    normalized = s
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

/** Tempo decorrido desde inicioEm até fimEm (ou agora). Formato m:ss ou h:mm:ss */
export function tempoDecorrido(
  inicioEm: string | null | undefined,
  fimEm?: string | null,
): string {
  if (!inicioEm) return '0:00'
  const start = new Date(inicioEm).getTime()
  if (Number.isNaN(start)) return '0:00'
  const end = fimEm ? new Date(fimEm).getTime() : Date.now()
  if (Number.isNaN(end)) return '0:00'
  const totalSec = Math.max(0, Math.floor((end - start) / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

export function prioridadeColor(p: Prioridade | null): string {
  if (p === 'alta') return 'var(--priority-high)'
  if (p === 'media') return 'var(--priority-medium)'
  return 'var(--priority-low)'
}
