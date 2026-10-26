import { deduplicarAvisosCarga } from './modulosSombra'
import type { NotificacaoInApp } from '../types'

/** O aparelho que publicou não aplica o próprio broadcast de novo. */
export function ignorarEcoProprio(
  clientId: string | null | undefined,
  meuId: string,
): boolean {
  return Boolean(clientId && clientId === meuId)
}

/**
 * O poll só baixa o Kanban quando o updated_at mudou.
 * Compara igualdade: relógios de aparelhos diferentes não têm ordem confiável.
 */
export function versaoKanbanMudou(
  vistoMs: number,
  remotoIso: string | null | undefined,
): boolean {
  if (!remotoIso) return true
  const n = new Date(remotoIso).getTime()
  const remoto = Number.isFinite(n) ? n : 0
  return remoto !== vistoMs
}

/** Uma tag por carga: o celular substitui o aviso anterior em vez de empilhar. */
export function tagPushCarga(cargaId?: string | null): string {
  const id = (cargaId || '').trim()
  return id ? `carga-${id}` : 'nova-carga'
}

/**
 * Sino da transportadora no celular.
 * A publicação cria o aviso geral e o aviso da transportadora; os dois viram uma linha.
 */
export function sinoDoTransportador(
  lista: NotificacaoInApp[],
  transportadorId: string,
): NotificacaoInApp[] {
  const visiveis = lista.filter((n) => {
    if (n.user_id) return false
    if (n.transportador_id) return n.transportador_id === transportadorId
    if (n.role === 'todos') return true
    if (n.role === 'transportador') return true
    return false
  })
  const ordenadas = [...visiveis].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  return deduplicarAvisosCarga(ordenadas).slice(0, 40)
}
