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

function appInstalado(): boolean {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia('(display-mode: standalone)').matches
  const ios =
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return mq || ios
}

function adiouNestaSessao(): boolean {
  try {
    return sessionStorage.getItem('doca-push-centro-adiado') === '1'
  } catch {
    return false
  }
}

function adiarNestaSessao() {
  try {
    sessionStorage.setItem('doca-push-centro-adiado', '1')
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
  const [destaque, setDestaque] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const transportadorId = actingTransportadorId || user?.transportador_id || null
  const isTransportador = user?.role === 'transportador' || Boolean(transportadorId)

  useEffect(() => {
    const aoInstalar = () => setDestaque(true)
    const aoModo = () => {
      if (appInstalado()) setDestaque(true)
    }
    if (appInstalado()) setDestaque(true)
    window.addEventListener('appinstalled', aoInstalar)
    const mq = window.matchMedia('(display-mode: standalone)')
    mq.addEventListener('change', aoModo)
    return () => {
      window.removeEventListener('appinstalled', aoInstalar)
      mq.removeEventListener('change', aoModo)
    }
  }, [])

  const precisa = destaque || isTransportador

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

    if (destaque) {
      if (adiouNestaSessao()) {
        setVisible(false)
        return
      }
    } else if (snoozed()) {
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

    const t = window.setTimeout(() => setVisible(true), destaque ? 400 : 900)
    return () => window.clearTimeout(t)
  }, [precisa, destaque, transportadorId, user?.id])

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

  if (destaque) {
    return (
      <div className="pwa-push-modal" role="presentation">
        <div
          className="pwa-push-modal__card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-push-titulo"
        >
          <p className="pwa-push-modal__selo">App instalado</p>
          <h2 id="pwa-push-titulo">Ativar notificações?</h2>
          <p>
            Assim o celular avisa na hora quando sair uma carga, mesmo com o aplicativo fechado.
          </p>
          {msg ? <p className="pwa-install__err">{msg}</p> : null}
          <button
            type="button"
            className="pwa-push-modal__btn"
            disabled={busy}
            onClick={() => void ativar()}
          >
            {busy ? 'Ativando…' : 'Sim, ativar notificações'}
          </button>
          <button
            type="button"
            className="pwa-push-modal__later"
            onClick={() => {
              adiarNestaSessao()
              setVisible(false)
            }}
          >
            Agora não
          </button>
        </div>
      </div>
    )
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
