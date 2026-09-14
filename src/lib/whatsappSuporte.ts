import { WHATSAPP_CREDENCIAIS_DIGITS } from './credenciaisTransportadorMsg'

export function hrefWhatsappSuporte(opts?: {
  origem?: string
  destino?: string
  problema?: boolean
}) {
  const o = (opts?.origem || '').trim()
  const d = (opts?.destino || '').trim()
  const trecho = o && d ? ` Calculei a rota ${o} → ${d}.` : ''
  const motivo = opts?.problema
    ? ' Quero relatar um problema no sistema.'
    : ' Gostaria de falar com vocês.'
  const text = `Olá! Vim pelo Oferta de Carga.${trecho}${motivo}`
  return `https://wa.me/${WHATSAPP_CREDENCIAIS_DIGITS}?text=${encodeURIComponent(text)}`
}
