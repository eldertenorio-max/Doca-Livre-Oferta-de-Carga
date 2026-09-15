import { WHATSAPP_CREDENCIAIS_DIGITS } from './credenciaisTransportadorMsg'

export function hrefWhatsappSuporte(opts?: {
  origem?: string
  destino?: string
  pagina?: string
}) {
  const pagina = (opts?.pagina || 'página de Calcular rota').trim()
  const o = (opts?.origem || '').trim()
  const d = (opts?.destino || '').trim()
  const trecho = o && d ? ` Calculei a rota ${o} → ${d}.` : ''
  const text = `Olá! Vim pelo Oferta de Carga, da ${pagina}.${trecho} Gostaria de falar com vocês.`
  return `https://wa.me/${WHATSAPP_CREDENCIAIS_DIGITS}?text=${encodeURIComponent(text)}`
}
