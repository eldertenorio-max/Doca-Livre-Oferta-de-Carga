/**
 * Gera todos os ícones da marca a partir do logo oficial da Doca Livre.
 *
 * - Prévia do link (og-square.png, og-image.png): o logo completo oficial
 *   (public/logo-doca-livre.png, versão clara) centralizado em fundo branco.
 * - Aba do navegador, app instalado (PWA) e apple-touch: só o ícone, nas cores
 *   oficiais da versão clara (moldura azul-marinho, setas amarelas), em fundo branco.
 * - Selo das notificações: silhueta branca (exigência do Android).
 * - logo-icone.svg / logo-icone-escuro.svg: ícone puro, fundo transparente.
 *
 * Precisa do sharp (não fica nas dependências para não pesar o build do Render):
 *   npm i --no-save sharp && node scripts/generate-favicons.mjs
 * ou aponte para um sharp já instalado: SHARP_PATH=/caminho/sharp/lib/index.js
 */
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const sharp = (await import(process.env.SHARP_PATH ? pathToFileURL(process.env.SHARP_PATH).href : 'sharp')).default

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')

/** Cores do logo oficial. */
const AMARELO = '#f9db00'
const AZUL_MARCA = '#043460'
const BRANCO = '#ffffff'
const CLARO = { moldura: AZUL_MARCA, setas: AMARELO }
const ESCURO = { moldura: BRANCO, setas: AMARELO }
const SELO = { moldura: BRANCO, setas: BRANCO }

/*
 * Desenho do ícone no sistema de coordenadas da arte (419×419).
 * Área ocupada: x 54–365, y 110–308. A metade direita é o espelho da esquerda.
 */
const ICONE = { x: 54, y: 110, largura: 311, altura: 198 }
const metade = ({ moldura, setas }) => `
    <path fill="${moldura}" d="M200 110H76a22 22 0 0 0-22 22v154a22 22 0 0 0 22 22h124v-19H78a5 5 0 0 1-5-5V135a5 5 0 0 1 5-5h122z"/>
    <path fill="${setas}" d="M89.5 209.5 141 173.5v72z" stroke="${setas}" stroke-width="10" stroke-linejoin="round"/>
    <rect fill="${setas}" x="141" y="189" width="59" height="41"/>`

const desenho = (cores) => `<g id="metade">${metade(cores)}
    </g>
    <use href="#metade" transform="translate(419 0) scale(-1 1)"/>`

/** Ícone posicionado: largura em px, centralizado em (cx, cy). */
function icone(largura, cx, cy, cores) {
  const escala = largura / ICONE.largura
  const x = cx - largura / 2
  const y = cy - (ICONE.altura * escala) / 2
  return `<g transform="translate(${x} ${y}) scale(${escala}) translate(${-ICONE.x} ${-ICONE.y})">
    ${desenho(cores)}
  </g>`
}

function svgQuadrado(tamanho, { fracao, raio }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tamanho} ${tamanho}" role="img" aria-label="Doca Livre">
  <rect width="${tamanho}" height="${tamanho}" rx="${raio}" fill="${BRANCO}"/>
  ${icone(tamanho * fracao, tamanho / 2, tamanho / 2, CLARO)}
</svg>
`
}

const svgIcone = (cores) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ICONE.x} ${ICONE.y} ${ICONE.largura} ${ICONE.altura}" role="img" aria-label="Doca Livre">
  ${desenho(cores)}
</svg>
`

// Base dos PNGs pequenos (fundo branco): ícone grande para continuar legível em 16–32 px.
const svgAba = svgQuadrado(512, { fracao: 0.82, raio: 96 })

/*
 * Aba do navegador (favicon.svg): fundo transparente e moldura que acompanha o
 * tema do navegador — azul-marinho com abas claras, branca com abas escuras —,
 * igual ao Doca Livre Faz um Freela. As setas ficam amarelas nos dois.
 */
const MARCA_CONTORNO = '#010203'
const svgAbaAdaptavel = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Doca Livre">
  <style>
    .contorno { fill: ${AZUL_MARCA}; }
    @media (prefers-color-scheme: dark) {
      .contorno { fill: ${BRANCO}; }
    }
  </style>
  ${icone(512 * 0.9, 256, 256, { moldura: MARCA_CONTORNO, setas: AMARELO }).replaceAll(`fill="${MARCA_CONTORNO}"`, 'class="contorno"')}
</svg>
`
// App instalado (PWA, inclusive "maskable"): margem para caber no recorte redondo.
const svgApp = svgQuadrado(512, { fracao: 0.62, raio: 0 })
// Selo da notificação (barra do Android): só a silhueta branca, fundo transparente.
const svgSelo = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  ${icone(88, 48, 48, SELO)}
</svg>
`

writeFileSync(join(publicDir, 'favicon.svg'), svgAbaAdaptavel)
writeFileSync(join(publicDir, 'logo-icone.svg'), svgIcone(CLARO))
writeFileSync(join(publicDir, 'logo-icone-escuro.svg'), svgIcone(ESCURO))
writeFileSync(join(publicDir, 'badge.svg'), svgSelo)

async function raster(svg, largura, altura, saida) {
  await sharp(Buffer.from(svg), { density: 300 })
    .resize(largura, altura)
    .png({ compressionLevel: 9 })
    .toFile(join(publicDir, saida))
  console.log('ok', saida, `${largura}x${altura}`)
}

/** Prévia do link: logo completo oficial centralizado em fundo branco. */
async function previaDoLink(largura, altura, larguraLogo, saida) {
  const logo = await sharp(join(publicDir, 'logo-doca-livre.png')).resize({ width: larguraLogo }).png().toBuffer()
  const { height: alturaLogo } = await sharp(logo).metadata()
  await sharp({ create: { width: largura, height: altura, channels: 4, background: BRANCO } })
    .composite([{ input: logo, left: Math.round((largura - larguraLogo) / 2), top: Math.round((altura - alturaLogo) / 2) }])
    .flatten({ background: BRANCO })
    .png({ compressionLevel: 9 })
    .toFile(join(publicDir, saida))
  console.log('ok', saida, `${largura}x${altura}`)
}

await raster(svgAba, 16, 16, 'favicon-16.png')
await raster(svgAba, 32, 32, 'favicon-32.png')
await raster(svgAba, 48, 48, 'favicon-48.png')
await raster(svgAba, 192, 192, 'favicon.png')
await raster(svgApp, 192, 192, 'apple-touch-icon.png')
await raster(svgApp, 192, 192, 'icon-192.png')
await raster(svgApp, 512, 512, 'icon-512.png')
await raster(svgSelo, 96, 96, 'badge-96.png')
// Quadrada: miniatura do WhatsApp. Larga: Facebook/LinkedIn.
await previaDoLink(1200, 1200, 1000, 'og-square.png')
await previaDoLink(1200, 630, 900, 'og-image.png')
console.log('ícones da marca regenerados')
