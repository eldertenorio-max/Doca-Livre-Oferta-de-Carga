import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'
import { metaDoHost, reescreverHeadHtml, tituloDaPagina, tituloDoProduto } from './siteMeta'

function conteudo(html: string, atributo: string, nome: string): string[] {
  const re = new RegExp(`<meta\\s+(?:[^>]*\\s)?${atributo}="${nome}"[^>]*content="([^"]*)"`, 'g')
  return [...html.matchAll(re)].map((m) => m[1])
}

describe('nome de cada domínio', () => {
  it('acha o site pelo host, com ou sem www', () => {
    expect(metaDoHost('www.mapadafrota.com.br').nome).toBe('Mapa da Frota')
    expect(metaDoHost('custodarota.com.br').nome).toBe('Custo da Rota')
    expect(metaDoHost('MAPADALOGISTICA.COM.BR').nome).toBe('Mapa da Logística')
    expect(metaDoHost('localhost').nome).toBe('Oferta de Carga')
  })

  it('monta o título da página com o nome do site', () => {
    expect(tituloDaPagina('Frete mínimo', 'custodarota.com.br')).toBe('Frete mínimo — Custo da Rota')
    expect(tituloDaPagina(undefined, 'mapadafrota.com.br')).toBe('Mapa da Frota — Doca Livre')
  })

  it('página principal de um produto usa o título do próprio domínio', () => {
    expect(tituloDoProduto('mapadafrota.com.br', 'Mapa da Frota', 'mapadafrota.com.br')).toBe('Mapa da Frota — Doca Livre')
    expect(tituloDoProduto('mapadafrota.com.br', 'Mapa da Frota', 'ofertadecarga.com.br')).toBe('Mapa da Frota — Oferta de Carga')
    expect(tituloDoProduto('custodarota.com.br', 'Calcular rota', 'custodarota.com.br')).toBe('Custo da Rota — Doca Livre')
  })
})

describe('prévia do link (index.html reescrito no Cloudflare)', () => {
  for (const host of ['mapadafrota.com.br', 'custodarota.com.br', 'mapadalogistica.com.br']) {
    it(`troca título e descrição para ${host}`, () => {
      const meta = metaDoHost(host)
      const html = reescreverHeadHtml(indexHtml, meta, `https://${host}/`)
      expect(html).toContain(`<title>${meta.titulo}</title>`)
      expect(conteudo(html, 'property', 'og:title')).toEqual([meta.titulo])
      expect(conteudo(html, 'property', 'og:site_name')).toEqual([meta.titulo])
      expect(conteudo(html, 'property', 'og:description')).toEqual([meta.descricao])
      expect(conteudo(html, 'name', 'description')).toEqual([meta.descricao])
      expect(conteudo(html, 'name', 'twitter:title')).toEqual([meta.titulo])
      expect(conteudo(html, 'name', 'twitter:description')).toEqual([meta.descricao])
      expect(conteudo(html, 'property', 'og:url')).toEqual([`https://${host}/`])
      expect(html).not.toContain('Doca Livre — Oferta de Carga')
      // O resto do HTML (scripts, ícones) continua igual.
      const semMeta = (h: string) => h.replace(/<meta[\s\S]*?>|<title>[^<]*<\/title>|\s+/g, '')
      expect(semMeta(html)).toBe(semMeta(indexHtml))
    })
  }

  it('não quebra com aspas ou < no texto', () => {
    const html = reescreverHeadHtml(indexHtml, { host: 'x', nome: 'A "B"', titulo: 'A <B>', descricao: 'C & "D"' }, 'https://x/')
    expect(html).toContain('<title>A &lt;B&gt;</title>')
    expect(conteudo(html, 'property', 'og:description')).toEqual(['C &amp; &quot;D&quot;'])
  })
})
