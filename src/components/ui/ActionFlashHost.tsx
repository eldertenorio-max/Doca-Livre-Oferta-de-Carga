import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  subscribeActionFlash,
  type ActionFlashPayload,
} from '../../lib/actionFlash'
import '../../styles/action-flash.css'

/**
 * Host global: monta uma vez no AppLayout.
 * Aviso central na tela para confirmações de lance / aceitar / contra-proposta.
 */
export function ActionFlashHost() {
  const [item, setItem] = useState<ActionFlashPayload | null>(null)

  useEffect(() => {
    return subscribeActionFlash((payload) => {
      setItem(payload)
    })
  }, [])

  useEffect(() => {
    if (!item) return
    const ms = item.ms ?? 3200
    const t = window.setTimeout(() => setItem(null), ms)
    return () => window.clearTimeout(t)
  }, [item])

  if (!item || typeof document === 'undefined') return null

  const tone = item.tone ?? 'ok'

  return createPortal(
    <div
      className="action-flash"
      role="status"
      aria-live="polite"
      onClick={() => setItem(null)}
    >
      <div
        className={`action-flash__card action-flash__card--${tone}`}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="action-flash__icon" aria-hidden>
          {tone === 'erro' ? '!' : '✓'}
        </div>
        <div className="action-flash__text">
          <strong>{item.titulo}</strong>
          {item.mensagem ? <p>{item.mensagem}</p> : null}
        </div>
        <button
          type="button"
          className="action-flash__close"
          aria-label="Fechar"
          onClick={() => setItem(null)}
        >
          ×
        </button>
      </div>
    </div>,
    document.body,
  )
}
