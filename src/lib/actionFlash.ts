/** Aviso central de ação (lance, aceitar, contra-proposta) — global. */

export type ActionFlashTone = 'ok' | 'erro'

export type ActionFlashPayload = {
  titulo: string
  mensagem?: string
  tone?: ActionFlashTone
  /** ms (padrão 3200) */
  ms?: number
}

type Listener = (payload: ActionFlashPayload) => void

const listeners = new Set<Listener>()

export function showActionFlash(payload: ActionFlashPayload | string) {
  const p: ActionFlashPayload =
    typeof payload === 'string' ? { titulo: payload, tone: 'ok' } : { tone: 'ok', ...payload }
  listeners.forEach((fn) => fn(p))
}

export function subscribeActionFlash(fn: Listener) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
