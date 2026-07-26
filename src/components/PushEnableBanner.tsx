import { useEffect, useState } from 'react'
import { useData } from '../context/DataContext'
import {
  garantirPermissaoNotificacao,
  pushSuportado,
  registrarPushSubscription,
} from '../lib/webPush'
import '../styles/pwa-install.css'

const KEY_OK = 'doca-livre-push-enabled-v1'
const KEY_SNOOZE = 'doca-livre-push-snooze-until'

function jaRegistrou(): boolean {
  try {
    return localStorage.getItem(KEY_OK) === '1'
  } catch {
    return false
  }
}

function marcarRegistrado() {
  try {
    localStorage.setItem(KEY_OK, '1')
    localStorage.removeItem(KEY_SNOOZE)
  } catch {
    /* ignore */
  }
}

function snoozed(): boolean {
  try {
    const until = Number(localStorage.getItem(KEY_SNOOZE) || 0)
    return Number.isFinite(until) && until > Date.now()
  } catch {
    return false
  }
}

function snooze(hours = 12) {
  try {
    localStorage.setItem(KEY_SNOOZE, String(Date.now() + hours * 60 * 60 * 1000))
  } catch {
    /* ignore */
  }
}

/**
 * Pede permissão e registra o aparelho para push nativo
 * (barra de notificações + som do sistema) quando uma carga for publicada.
 */
export function PushEnableBanner() {
  const { user, actingTransportadorId } = useData()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const transportadorId = actingTransportadorId || user?.transportador_id || null
  const isTransportador = user?.role === 'transportador' || Boolean(transportadorId)
  const precisa = isTransportador

  useEffect(() => {
    if (!precisa || !pushSuportado()) {
      setVisible(false)
      return
    }

    // Já tem permissão: renova assinatura (garante transportador_id no banco)
    if (Notification.permission === 'granted') {
      void registrarPushSubscription({
        transportadorId,
        userId: user?.id,
      }).then((res) => {
        if (res.ok) marcarRegistrado()
      })
      setVisible(false)
      return
    }

    if (Notification.permission === 'denied') {
      setVisible(false)
      return
    }

    if (snoozed()) {
      setVisible(false)
      return
    }

    // Ainda não pediu / default — mostra banner (não marca como ativo ao dispensar)
    if (jaRegistrou() && Notification.permission !== 'granted') {
      // Flag antiga sem permissão: limpa e mostra de novo
      try {
        localStorage.removeItem(KEY_OK)
      } catch {
        /* ignore */
      }
    }

    const t = window.setTimeout(() => setVisible(true), 900)
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
    marcarRegistrado()
    setVisible(false)
  }

  return (
    <div className="pwa-install pwa-install--push" role="dialog" aria-label="Ativar notificações">
      <div className="pwa-install__text">
        <strong>Ativar alertas de carga no celular</strong>
        <span>
          Ao publicar uma carga para o seu grupo, o celular recebe notificação na barra — mesmo com o
          app fechado (instale o PWA / “Adicionar à tela inicial”).
        </span>
        {msg ? <span className="pwa-install__err">{msg}</span> : null}
      </div>
      <div className="pwa-install__actions">
        <button type="button" className="pwa-install__btn" disabled={busy} onClick={() => void ativar()}>
          {busy ? 'Ativando…' : 'Ativar alertas'}
        </button>
        <button
          type="button"
          className="pwa-install__close"
          onClick={() => {
            snooze(12)
            setVisible(false)
          }}
        >
          Agora não
        </button>
      </div>
    </div>
  )
}
