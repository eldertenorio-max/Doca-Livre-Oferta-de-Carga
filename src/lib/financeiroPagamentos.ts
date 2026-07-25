import { appStoreGet, appStoreGetCached, appStoreSet, migrateLocalKeyToAppStore } from './appStore'

export type StatusPagamentoFrete = 'a_pagar' | 'pago'

export interface PagamentoFrete {
  carga_id: string
  status: StatusPagamentoFrete
  pago_em: string | null
  observacao: string
  updated_at: string
}

const STORE_KEY = 'pagamentos_frete'
const LEGACY_KEY = 'doca-livre-pagamentos-v1'

export function loadPagamentos(): Record<string, PagamentoFrete> {
  const cached = appStoreGetCached<Record<string, PagamentoFrete> | null>(STORE_KEY, null)
  return cached && typeof cached === 'object' ? cached : {}
}

export function savePagamentos(map: Record<string, PagamentoFrete>) {
  void appStoreSet(STORE_KEY, map)
}

export async function hydratePagamentos(): Promise<Record<string, PagamentoFrete>> {
  await migrateLocalKeyToAppStore(LEGACY_KEY, STORE_KEY, (raw) => {
    try {
      const parsed = JSON.parse(raw) as Record<string, PagamentoFrete>
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  })
  const remote = await appStoreGet<Record<string, PagamentoFrete> | null>(STORE_KEY, null)
  const next = remote && typeof remote === 'object' ? remote : {}
  void appStoreSet(STORE_KEY, next)
  return next
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
