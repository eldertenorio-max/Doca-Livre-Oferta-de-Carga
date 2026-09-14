import { WHATSAPP_CREDENCIAIS_DIGITS } from './credenciaisTransportadorMsg'

export function hrefWhatsappSuporte(opts?: { origem?: string; destino?: string }) {
  const o = (opts?.origem || '').trim()
  const d = (opts?.destino || '').trim()
  const trecho = o && d ? ` Calculei a rota ${o} → ${d}.` : ''
  const text = `Olá! Vim pelo Oferta de Carga.${trecho} Gostaria de falar com vocês.`
  return `https://wa.me/${WHATSAPP_CREDENCIAIS_DIGITS}?text=${encodeURIComponent(text)}`
}
