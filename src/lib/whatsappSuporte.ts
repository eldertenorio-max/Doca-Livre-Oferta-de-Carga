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

export function hrefWhatsappComprovanteCreditos(opts: {
  email: string
  creditos: number
  valor: string
  txid: string
}) {
  const text =
    `Olá! Paguei o PIX de ${opts.creditos} créditos (${opts.valor}) na calculadora. ` +
    `Conta Google: ${opts.email}. ` +
    `Código do pagamento: ${opts.txid}. ` +
    `Segue o comprovante deste código. Não usem comprovante de outro pagamento.`
  return `https://wa.me/${WHATSAPP_CREDENCIAIS_DIGITS}?text=${encodeURIComponent(text)}`
}

export function hrefWhatsappComprovantePlano(opts: {
  plano: string
  valor: string
  txid: string
}) {
  const text =
    `Olá! Paguei o PIX do plano ${opts.plano} (${opts.valor}). ` +
    `Código ${opts.txid}. Segue o comprovante para vocês confirmarem. ` +
    `Quando o PIX for confirmado, me enviem o link do cadastro do sistema.`
  return `https://wa.me/${WHATSAPP_CREDENCIAIS_DIGITS}?text=${encodeURIComponent(text)}`
}
