/**
 * Nome, título e descrição de cada domínio. Os 4 sites servem o mesmo index.html,
 * então isto é aplicado em dois lugares:
 * - no navegador, ao abrir a página (aplicarMetaDoSite, chamado no main.tsx);
 * - no Cloudflare (cloudflare/meta-por-dominio), para a prévia do link no
 *   WhatsApp/Facebook, cujo robô lê só o HTML e não roda JavaScript.
 */

export type SiteMeta = {
  host: string
  /** Nome curto do produto (usado nos títulos das páginas). */
  nome: string
  /** Título completo da página inicial e da prévia do link. */
  titulo: string
  descricao: string
}

export const SITES_META: Record<string, SiteMeta> = {
  'ofertadecarga.com.br': {
    host: 'ofertadecarga.com.br',
    nome: 'Oferta de Carga',
    titulo: 'Doca Livre — Oferta de Carga',
    descricao: 'Cadastre-se como transportador, negocie fretes e acompanhe a frota no mapa.',
  },
  'custodarota.com.br': {
    host: 'custodarota.com.br',
    nome: 'Custo da Rota',
    titulo: 'Custo da Rota — Doca Livre',
    descricao: 'Calcule pedágio, quilometragem, combustível e frete mínimo ANTT da sua rota de carga.',
  },
  'mapadafrota.com.br': {
    host: 'mapadafrota.com.br',
    nome: 'Mapa da Frota',
    titulo: 'Mapa da Frota — Doca Livre',
    descricao: 'Encontre caminhões e transportadoras disponíveis perto da sua carga, direto no mapa.',
  },
  'mapadalogistica.com.br': {
    host: 'mapadalogistica.com.br',
    nome: 'Mapa da Logística',
    titulo: 'Mapa da Logística — Doca Livre',
    descricao: 'Encontre transportadoras, armazéns e operadores logísticos no mapa e cadastre sua empresa.',
  },
}

const PADRAO = SITES_META['ofertadecarga.com.br']

export function metaDoHost(hostname: string): SiteMeta {
  const host = (hostname || '').toLowerCase().replace(/^www\./, '').split(':')[0]
  return SITES_META[host] ?? PADRAO
}

function hostAtual(): string {
  return typeof window === 'undefined' ? '' : window.location.hostname
}

/** Título de uma página do site atual: "Frete mínimo — Custo da Rota". Sem página: título do site. */
export function tituloDaPagina(pagina?: string, hostname = hostAtual()): string {
  const meta = metaDoHost(hostname)
  return pagina ? `${pagina} — ${meta.nome}` : meta.titulo
}

/**
 * Página principal de um produto: no próprio domínio usa o título do site
 * ("Mapa da Frota — Doca Livre"); dentro de outro site vira "Mapa da Frota — Oferta de Carga".
 */
export function tituloDoProduto(hostDoProduto: string, pagina: string, hostname = hostAtual()): string {
  const atual = metaDoHost(hostname)
  return atual.host === metaDoHost(hostDoProduto).host ? atual.titulo : `${pagina} — ${atual.nome}`
}

function escaparAtributo(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function trocarConteudo(html: string, seletor: RegExp, valor: string): string {
  return html.replace(seletor, (tag) => tag.replace(/content="[^"]*"/, `content="${escaparAtributo(valor)}"`))
}

/**
 * Reescreve o <head> do index.html para o domínio pedido (usado no Worker do
 * Cloudflare). Só troca textos de tags que já existem, mais o og:url.
 */
export function reescreverHeadHtml(html: string, meta: SiteMeta, url: string): string {
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${escaparAtributo(meta.titulo)}</title>`)
  const tag = (atributo: 'name' | 'property', nome: string) =>
    new RegExp(`<meta\\s+(?:[^>]*\\s)?${atributo}="${nome.replace(/[:]/g, '\\:')}"[^>]*>`, 'g')
  out = trocarConteudo(out, tag('name', 'description'), meta.descricao)
  out = trocarConteudo(out, tag('name', 'application-name'), meta.titulo)
  out = trocarConteudo(out, tag('name', 'apple-mobile-web-app-title'), meta.nome)
  out = trocarConteudo(out, tag('property', 'og:site_name'), meta.titulo)
  out = trocarConteudo(out, tag('property', 'og:title'), meta.titulo)
  out = trocarConteudo(out, tag('property', 'og:description'), meta.descricao)
  out = trocarConteudo(out, tag('property', 'og:image:alt'), `Logo Doca Livre — ${meta.nome}`)
  out = trocarConteudo(out, tag('name', 'twitter:title'), meta.titulo)
  out = trocarConteudo(out, tag('name', 'twitter:description'), meta.descricao)
  const ogUrl = `<meta property="og:url" content="${escaparAtributo(url)}" />`
  out = /<meta\s+property="og:url"/.test(out)
    ? trocarConteudo(out, tag('property', 'og:url'), url)
    : out.replace(/(<meta\s+property="og:type"[^>]*>)/, `$1\n    ${ogUrl}`)
  return out
}

function definirMeta(atributo: 'name' | 'property', nome: string, valor: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${atributo}="${nome}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(atributo, nome)
    document.head.appendChild(el)
  }
  el.content = valor
}

/** Aplica no documento aberto (aba, "Adicionar à tela inicial", compartilhar do navegador). */
export function aplicarMetaDoSite(hostname = hostAtual()): SiteMeta {
  const meta = metaDoHost(hostname)
  if (typeof document === 'undefined') return meta
  document.title = meta.titulo
  definirMeta('name', 'description', meta.descricao)
  definirMeta('name', 'application-name', meta.titulo)
  definirMeta('name', 'apple-mobile-web-app-title', meta.nome)
  definirMeta('property', 'og:site_name', meta.titulo)
  definirMeta('property', 'og:title', meta.titulo)
  definirMeta('property', 'og:description', meta.descricao)
  definirMeta('property', 'og:url', `https://${meta.host}/`)
  definirMeta('name', 'twitter:title', meta.titulo)
  definirMeta('name', 'twitter:description', meta.descricao)
  return meta
}
