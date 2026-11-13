/**
 * Aplicativo Android do Oferta de Carga (pasta android/): o que o site precisa saber sobre ele.
 * O instalador fica em public/app (gerado por android/gerar-apk.ps1) e a prova de que o app é deste site em
 * public/.well-known/assetlinks.json.
 */

export const PACOTE_ANDROID = 'br.com.docalivre.ofertadecarga'
export const APK_URL = '/app/oferta-de-carga.apk'
export const VERSAO_URL = '/app/versao.json'

const CHAVE_NO_APP = 'oferta.noApp'

/**
 * O app abre o site com o "referrer" android-app://<pacote>. Só a primeira página recebe isso, então a marca
 * fica guardada na sessão (cada abertura do app é uma sessão nova).
 */
function marcarSeNoApp() {
  try {
    if (typeof document !== 'undefined' && document.referrer.startsWith(`android-app://${PACOTE_ANDROID}`)) {
      sessionStorage.setItem(CHAVE_NO_APP, '1')
    }
  } catch {
    /* sem sessionStorage */
  }
}
marcarSeNoApp()

/** Está aberto dentro do app Android (e não no Chrome ou no app instalado pelo Chrome). */
export function estaNoApp() {
  try {
    return sessionStorage.getItem(CHAVE_NO_APP) === '1'
  } catch {
    return false
  }
}

export function ehAndroid() {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || '')
}

export function ehIphone() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document)
}

/** QR code com o endereço do instalador (para quem está no computador baixar pelo celular). */
export const QR_BAIXAR_URL = '/app/qr-baixar-app.svg'
export const APK_URL_COMPLETA = `https://ofertadecarga.com.br${APK_URL}`

export type VersaoDoApp = { versao: string; tamanhoMb?: number; geradoEm?: string }

export async function lerVersaoDoApp(): Promise<VersaoDoApp | null> {
  try {
    const r = await fetch(VERSAO_URL, { cache: 'no-store' })
    if (!r.ok) return null
    const j = (await r.json()) as VersaoDoApp
    return j && typeof j.versao === 'string' ? j : null
  } catch {
    return null
  }
}
