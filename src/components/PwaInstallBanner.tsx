import { useEffect, useState } from 'react'
import { LOGO_DOCA_LIVRE_SRC } from '../lib/brandAssets'
import '../styles/pwa-install.css'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'doca-livre-pwa-install-dismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia('(display-mode: standalone)').matches
  const ios = 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return mq || ios
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const webkit = /WebKit/.test(ua)
  const chromeIos = /CriOS|FxiOS|EdgiOS/.test(ua)
  return iOS && webkit && !chromeIos
}

function wasDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const t = Number(raw)
    // Reaparece depois de 14 dias
    return Number.isFinite(t) && Date.now() - t < 14 * 24 * 60 * 60_000
  } catch {
    return false
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

/** Banner “Instalar app” no mobile (Chrome/Android + dica no iOS Safari). */
export function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [iosHint, setIosHint] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
      setIosHint(false)
    }
    window.addEventListener('beforeinstallprompt', onBip)

    // iOS Safari não dispara beforeinstallprompt — mostra dica manual
    if (isIosSafari() && !isStandalone()) {
      const t = window.setTimeout(() => {
        setIosHint(true)
        setVisible(true)
      }, 1800)
      return () => {
        window.clearTimeout(t)
        window.removeEventListener('beforeinstallprompt', onBip)
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  if (!visible) return null

  async function instalar() {
    if (!deferred) return
    setBusy(true)
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === 'accepted') {
        setVisible(false)
      } else {
        dismiss()
        setVisible(false)
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
      setDeferred(null)
    }
  }

  function fechar() {
    dismiss()
    setVisible(false)
  }

  return (
    <div className="pwa-install" role="dialog" aria-label="Instalar aplicativo">
      <img src={LOGO_DOCA_LIVRE_SRC} alt="" className="pwa-install__logo" />
      <div className="pwa-install__text">
        <strong>Instalar Doca Livre</strong>
        {iosHint ? (
          <span>
            No Safari, toque em <em>Compartilhar</em> e depois em <em>Adicionar à Tela de Início</em>.
          </span>
        ) : (
          <span>Adicione na tela inicial e abra como aplicativo.</span>
        )}
      </div>
      <div className="pwa-install__actions">
        {!iosHint && deferred && (
          <button type="button" className="pwa-install__btn" disabled={busy} onClick={() => void instalar()}>
            {busy ? 'Abrindo…' : 'Instalar'}
          </button>
        )}
        <button type="button" className="pwa-install__close" onClick={fechar} aria-label="Fechar">
          Agora não
        </button>
      </div>
    </div>
  )
}
