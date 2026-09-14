/** E-mail de suporte do Doca Livre (domínio docalivre.com.br). */
export const EMAIL_SUPORTE_DOCA = 'contato@docalivre.com.br'

export function hrefEmailSuporte(opts: {
  nome?: string
  email?: string
  mensagem: string
  origem?: string
  destino?: string
}) {
  const nome = (opts.nome || '').trim()
  const de = (opts.email || '').trim()
  const msg = (opts.mensagem || '').trim()
  const o = (opts.origem || '').trim()
  const d = (opts.destino || '').trim()
  const linhas = [
    nome ? `Nome: ${nome}` : '',
    de ? `E-mail para resposta: ${de}` : '',
    o && d ? `Rota: ${o} → ${d}` : '',
    '',
    msg,
  ].filter((l, i, arr) => l !== '' || (i > 0 && arr[i - 1] !== ''))
  const body = linhas.join('\n').trim()
  const subject = 'Relato de problema — Oferta de Carga'
  return `mailto:${EMAIL_SUPORTE_DOCA}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
