/**
 * Prévia do link por domínio (WhatsApp, Facebook, LinkedIn, Telegram).
 *
 * Os 4 sites são o mesmo Static Site no Render, com um único index.html. O robô
 * que monta a prévia não roda JavaScript, então ele sempre lia "Oferta de Carga".
 * Este Worker fica na frente (Cloudflare) e troca título/descrição do <head>
 * conforme o domínio, usando a mesma tabela do app (src/lib/siteMeta.ts).
 */
import { metaDoHost, reescreverHeadHtml } from '../../src/lib/siteMeta'

export default {
  async fetch(request: Request): Promise<Response> {
    const resposta = await fetch(request)
    const url = new URL(request.url)
    const meta = metaDoHost(url.hostname)
    const tipo = resposta.headers.get('content-type') || ''
    // Só a página HTML do SPA; arquivos (js, css, imagens) passam direto.
    if (request.method !== 'GET' || !resposta.ok || !tipo.includes('text/html') || meta.host === 'ofertadecarga.com.br') {
      return resposta
    }
    const html = reescreverHeadHtml(await resposta.text(), meta, `https://${meta.host}${url.pathname}`)
    const headers = new Headers(resposta.headers)
    headers.delete('content-length')
    headers.delete('etag')
    return new Response(html, { status: resposta.status, statusText: resposta.statusText, headers })
  },
}
