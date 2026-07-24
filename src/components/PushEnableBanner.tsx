import { useEffect, useState } from 'react'
import { useData } from '../context/DataContext'
import {
  garantirPermissaoNotificacao,
  pushSuportado,
  registrarPushSubscription,
} from '../lib/webPush'
import '../styles/pwa-install.css'

const KEY = 'doca-livre-push-enabled-v1'

function jaAtivou(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function marcarAtivo() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* ignore */
  }
}

/**
 * Pede permissão e registra o aparelho para push nativo
 * (barra de notificações + som do sistema).
 */
export function PushEnableBanner() {
  const { user, actingTransportadorId } = useData()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const transportadorId = actingTransportadorId || user?.transportador_id || null
  const precisa =
    Boolean(transportadorId) ||
    user?.role === 'transportador' ||
    Boolean(user?.is_superuser) ||
    user?.role === 'super'

  useEffect(() => {
    if (!precisa || !pushSuportado()) {
      setVisible(false)
      return
    }
    if (jaAtivou() && Notification.permission === 'granted') {
      // Renova assinatura em background
      void registrarPushSubscription({
        transportadorId,
        userId: user?.id,
      })
      setVisible(false)
      return
    }
    if (Notification.permission === 'denied') {
      setVisible(false)
      return
    }
    const t = window.setTimeout(() => setVisible(true), 1200)
    return () => window.clearTimeout(t)
  }, [precisa, transportadorId, user?.id])

  if (!visible) return null

  async function ativar() {
    setBusy(true)
    setMsg('')
    const perm = await garantirPermissaoNotificacao()
    if (perm !== 'granted') {
      setBusy(false)
      setMsg('Permissão negada. Ative notificações nas configurações do celular.')
      return
    }
    const res = await registrarPushSubscription({
      transportadorId,
      userId: user?.id,
    })
    setBusy(false)
    if (!res.ok) {
      setMsg(res.erro)
      return
    }
    marcarAtivo()
    setVisible(false)
  }

  return (
    <div className="pwa-install pwa-install--push" role="dialog" aria-label="Ativar notificações">
      <div className="pwa-install__text">
        <strong>Ativar alertas de carga</strong>
        <span>
          Quando uma carga for publicada, o celular toca e a notificação aparece na barra de
          notificações — mesmo com o app fechado.
        </span>
        {msg ? <span className="pwa-install__err">{msg}</span> : null}
      </div>
      <div className="pwa-install__actions">
        <button type="button" className="pwa-install__btn" disabled={busy} onClick={() => void ativar()}>
          {busy ? 'Ativando…' : 'Ativar'}
        </button>
        <button
          type="button"
          className="pwa-install__close"
          onClick={() => {
            marcarAtivo()
            setVisible(false)
          }}
        >
          Agora não
        </button>
      </div>
    </div>
  )
}
