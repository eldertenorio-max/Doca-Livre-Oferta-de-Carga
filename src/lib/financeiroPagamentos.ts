export type StatusPagamentoFrete = 'a_pagar' | 'pago'

export interface PagamentoFrete {
  carga_id: string
  status: StatusPagamentoFrete
  pago_em: string | null
  observacao: string
  updated_at: string
}

const STORAGE_KEY = 'doca-livre-pagamentos-v1'

export function loadPagamentos(): Record<string, PagamentoFrete> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, PagamentoFrete>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function savePagamentos(map: Record<string, PagamentoFrete>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function getStatusPagamento(
  map: Record<string, PagamentoFrete>,
  cargaId: string,
): StatusPagamentoFrete {
  return map[cargaId]?.status ?? 'a_pagar'
}

export function setStatusPagamento(
  map: Record<string, PagamentoFrete>,
  cargaId: string,
  status: StatusPagamentoFrete,
  observacao?: string,
): Record<string, PagamentoFrete> {
  const now = new Date().toISOString()
  const prev = map[cargaId]
  const next: Record<string, PagamentoFrete> = {
    ...map,
    [cargaId]: {
      carga_id: cargaId,
      status,
      pago_em: status === 'pago' ? now : null,
      observacao: observacao ?? prev?.observacao ?? '',
      updated_at: now,
    },
  }
  savePagamentos(next)
  return next
}
