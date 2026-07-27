import { useEffect, useRef, useState } from 'react'
import { LOGO_DOCA_LIVRE_SRC } from '../lib/brandAssets'
import '../styles/pwa-install.css'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'doca-livre-pwa-install-dismissed'

/** Captura cedo: o evento pode disparar antes do React montar. */
let earlyDeferred: BeforeInstallPromptEvent | null = null

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    earlyDeferred = e as BeforeInstallPromptEvent
    window.dispatchEvent(new CustomEvent('doca-pwa-install-ready'))
  })
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia('(display-mode: standalone)').matches
  const ios =
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return mq || ios
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** Navegadores embutidos (WhatsApp, Instagram, etc.) não instalam PWA. */
function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Twitter|LinkedInApp|WhatsApp|Snapchat|Pinterest/i.test(
    ua,
  )
}

function wasDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const t = Number(raw)
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

type Mode = 'native' | 'ios' | 'inapp' | 'manual'

/** Banner “Instalar app” no mobile (Chrome/Android + dicas no iOS / WebView). */
export function PwaInstallBanner() {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(earlyDeferred)
  const [hasPrompt, setHasPrompt] = useState(() => Boolean(earlyDeferred))
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState<Mode>('native')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return

    const showNative = (ev: BeforeInstallPromptEvent) => {
      deferredRef.current = ev
      earlyDeferred = ev
      setHasPrompt(true)
      setMode('native')
      setVisible(true)
      setErro('')
    }

    if (earlyDeferred) {
      showNative(earlyDeferred)
    }

    const onReady = () => {
      if (earlyDeferred) showNative(earlyDeferred)
    }
    window.addEventListener('doca-pwa-install-ready', onReady)

    const onBip = (e: Event) => {
      e.preventDefault()
      showNative(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBip)

    if (isInAppBrowser()) {
      const t = window.setTimeout(() => {
        if (deferredRef.current) return
        setMode('inapp')
        setVisible(true)
      }, 1600)
      return () => {
        window.clearTimeout(t)
        window.removeEventListener('beforeinstallprompt', onBip)
        window.removeEventListener('doca-pwa-install-ready', onReady)
      }
    }

    if (isIos()) {
      const t = window.setTimeout(() => {
        if (deferredRef.current) return
        setMode('ios')
        setVisible(true)
      }, 1800)
      return () => {
        window.clearTimeout(t)
        window.removeEventListener('beforeinstallprompt', onBip)
        window.removeEventListener('doca-pwa-install-ready', onReady)
      }
    }

    // Android sem evento ainda: após um tempo, mostra atalho manual do Chrome
    const manualTimer = window.setTimeout(() => {
      if (deferredRef.current || isStandalone()) return
      setMode('manual')
      setVisible(true)
    }, 8000)

    return () => {
      window.clearTimeout(manualTimer)
      window.removeEventListener('beforeinstallprompt', onBip)
      window.removeEventListener('doca-pwa-install-ready', onReady)
    }
  }, [])

  if (!visible) return null

  async function instalar() {
    // Chamar prompt() no mesmo gesto do toque, SEM setState antes —
    // qualquer re-render antes do prompt() cancela a instalação no Chrome Android.
    const ev = deferredRef.current || earlyDeferred
    if (!ev) {
      setHasPrompt(false)
      setMode('manual')
      setErro('Use o menu do Chrome (⋮) → Instalar app / Adicionar à tela inicial.')
      return
    }

    try {
      await ev.prompt()
      setBusy(true)
      const choice = await ev.userChoice
      deferredRef.current = null
      earlyDeferred = null
      setHasPrompt(false)
      if (choice.outcome === 'accepted') {
        setVisible(false)
      } else {
        dismiss()
        setVisible(false)
      }
    } catch {
      setHasPrompt(false)
      setMode('manual')
      setErro('Não abriu a instalação automática. No Chrome: menu ⋮ → Instalar app.')
    } finally {
      setBusy(false)
    }
  }

  function fechar() {
    dismiss()
    setVisible(false)
  }

  const texto =
    mode === 'ios' ? (
      <span>
        No Safari, toque em <em>Compartilhar</em> e depois em <em>Adicionar à Tela de Início</em>.
      </span>
    ) : mode === 'inapp' ? (
      <span>
        Abra este link no <em>Chrome</em> ou <em>Safari</em> (menu ⋮ do WhatsApp/Instagram → Abrir no
        navegador) e depois instale o app.
      </span>
    ) : mode === 'manual' ? (
      <span>
        No Chrome, toque em <em>⋮</em> → <em>Instalar app</em> ou <em>Adicionar à tela inicial</em>.
        {erro ? (
          <>
            <br />
            <span className="pwa-install__err">{erro}</span>
          </>
        ) : null}
      </span>
    ) : (
      <span>
        Adicione na tela inicial e abra como aplicativo.
        {erro ? (
          <>
            <br />
            <span className="pwa-install__err">{erro}</span>
          </>
        ) : null}
      </span>
    )

  return (
    <div className="pwa-install" role="dialog" aria-label="Instalar aplicativo">
      <img src={LOGO_DOCA_LIVRE_SRC} alt="" className="pwa-install__logo" />
      <div className="pwa-install__text">
        <strong>Instalar Doca Livre</strong>
        {texto}
      </div>
      <div className="pwa-install__actions">
        {mode === 'native' && hasPrompt ? (
          <button
            type="button"
            className="pwa-install__btn"
            disabled={busy}
            onClick={() => void instalar()}
          >
            {busy ? 'Abrindo…' : 'Instalar'}
          </button>
        ) : null}
        <button type="button" className="pwa-install__close" onClick={fechar} aria-label="Fechar">
          Agora não
        </button>
      </div>
    </div>
  )
}
