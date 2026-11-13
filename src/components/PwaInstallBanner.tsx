import { useEffect, useState } from 'react'
import { LOGO_DOCA_LIVRE_SRC } from '../lib/brandAssets'
import { APK_URL, ehAndroid, estaNoApp, lerVersaoDoApp, type VersaoDoApp } from '../lib/aplicativo'
import '../styles/pwa-install.css'

/** Chave nova: quem fechou o aviso antigo ("instalar pelo Chrome") ainda vê o do app de verdade. */
const DISMISS_KEY = 'doca-livre-app-android-dismissed'

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

/** Navegadores embutidos (WhatsApp, Instagram, etc.) não adicionam à Tela de Início no iPhone. */
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

/**
 * - apk: Android — baixar o app de verdade (android/, gerado por android/gerar-apk.ps1). Aparece também para
 *   quem usa o atalho instalado pelo Chrome, para trocar pelo app.
 * - ios: iPhone/iPad — não há app; adicionar à Tela de Início pelo Safari.
 * - inapp: iPhone dentro do WhatsApp/Instagram — abrir no Safari primeiro.
 */
type Mode = 'apk' | 'ios' | 'inapp'

function modoDoAparelho(): Mode | null {
  if (estaNoApp()) return null
  if (ehAndroid()) return 'apk'
  if (isIos() && !isStandalone()) return isInAppBrowser() ? 'inapp' : 'ios'
  return null
}

/** Aviso no celular: baixar o app Android, ou dicas para o iPhone. */
export function PwaInstallBanner() {
  const [mode] = useState<Mode | null>(modoDoAparelho)
  const [visible, setVisible] = useState(false)
  const [baixou, setBaixou] = useState(false)
  const [versao, setVersao] = useState<VersaoDoApp | null>(null)

  useEffect(() => {
    if (!mode || wasDismissed()) return
    // No Android o caminho é o app de verdade: não deixa o Chrome oferecer o atalho dele.
    const onBip = (e: Event) => e.preventDefault()
    if (mode === 'apk') {
      window.addEventListener('beforeinstallprompt', onBip)
      void lerVersaoDoApp().then(setVersao)
    }
    const t = window.setTimeout(() => setVisible(true), mode === 'apk' ? 1200 : 1800)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('beforeinstallprompt', onBip)
    }
  }, [mode])

  if (!visible || !mode) return null

  function fechar() {
    dismiss()
    setVisible(false)
  }

  const detalheVersao = versao
    ? ` (versão ${versao.versao}${versao.tamanhoMb ? `, ${String(versao.tamanhoMb).replace('.', ',')} MB` : ''})`
    : ''

  const texto =
    mode === 'ios' ? (
      <span>
        No Safari, toque em <em>Compartilhar</em> e depois em <em>Adicionar à Tela de Início</em>.
      </span>
    ) : mode === 'inapp' ? (
      <span>
        Abra este link no <em>Safari</em> (menu do WhatsApp/Instagram → Abrir no navegador) e depois adicione à
        Tela de Início.
      </span>
    ) : baixou ? (
      <span>
        Abra o arquivo baixado e toque em <em>Instalar</em>. Se o Android pedir, permita instalar apps deste
        navegador.
      </span>
    ) : (
      <span>
        Baixe o app para Android{detalheVersao}: abre direto no sistema e avisa das ofertas como notificação do
        celular.
      </span>
    )

  return (
    <div className="pwa-install" role="dialog" aria-label={mode === 'apk' ? 'Baixar o aplicativo' : 'Instalar aplicativo'}>
      <img src={LOGO_DOCA_LIVRE_SRC} alt="" className="pwa-install__logo" />
      <div className="pwa-install__text">
        <strong>{mode === 'apk' ? 'App do Oferta de Carga' : 'Instalar Doca Livre'}</strong>
        {texto}
      </div>
      <div className="pwa-install__actions">
        {mode === 'apk' && !baixou ? (
          <a
            className="pwa-install__btn"
            href={APK_URL}
            download="oferta-de-carga.apk"
            onClick={() => setBaixou(true)}
          >
            Baixar o app
          </a>
        ) : null}
        <button type="button" className="pwa-install__close" onClick={fechar} aria-label="Fechar">
          {baixou ? 'Fechar' : 'Agora não'}
        </button>
      </div>
    </div>
  )
}
