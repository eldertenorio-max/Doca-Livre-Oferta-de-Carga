/**
 * Gera src/styles/tema-escuro.gerado.css: a versão escura das cores fixas do CSS.
 *
 * O CSS do sistema usa quase só cores fixas (não variáveis). Em vez de reescrever
 * cada arquivo, este script lê as regras, troca cada cor clara de fundo/texto/borda
 * pela equivalente da paleta escura (a mesma do WMS Doca Livre) e escreve tudo
 * prefixado com [data-tema="escuro"]. Cores fortes (amarelo da marca, verde, vermelho)
 * ficam como estão. Rode de novo sempre que mudar cores no CSS:
 *
 *   node scripts/gerar-tema-escuro.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SAIDA = join(root, 'src/styles/tema-escuro.gerado.css')

/**
 * Todos os arquivos entram (o Vite junta o CSS: um arquivo de uma tela afeta as outras).
 * Telas que ficam claras (login, abertura) usam a classe .tema-forcar-claro, e nenhuma
 * regra gerada vale dentro dela.
 */
const IGNORAR = new Set(['tema-escuro.css', 'tema-escuro.gerado.css'])
const PASTAS = ['src/styles', 'src/logistica/styles', 'src/components/verificacao']
const EXTRA = ['src/index.css']

/** Paleta escura (WMS Doca Livre). */
const P = {
  card: '#18181b',
  suave: '#222226',
  forte: '#2e2e33',
  borda: '#2e2e33',
  bordaForte: '#3f3f46',
  texto: '#f4f4f5',
  medio: '#d4d4d8',
  secundario: '#a1a1aa',
}

/* ---------------- cores ---------------- */

function hexParaRgb(h) {
  let s = h.slice(1)
  if (s.length === 3 || s.length === 4) s = [...s].map((c) => c + c).join('')
  const n = (i) => parseInt(s.slice(i, i + 2), 16)
  return { r: n(0), g: n(2), b: n(4), a: s.length === 8 ? n(6) / 255 : 1 }
}

function lerCor(token) {
  const t = token.trim().toLowerCase()
  if (t === 'white') return { r: 255, g: 255, b: 255, a: 1 }
  if (t === 'black') return { r: 0, g: 0, b: 0, a: 1 }
  if (t.startsWith('#')) return hexParaRgb(t)
  const m = /^rgba?\((.*)\)$/.exec(t)
  if (!m) return null
  const partes = m[1].replace(/\//g, ' ').replace(/,/g, ' ').split(/\s+/).filter(Boolean)
  if (partes.length < 3) return null
  const canal = (v) => (v.endsWith('%') ? (parseFloat(v) * 255) / 100 : parseFloat(v))
  const alfa = partes[3] === undefined ? 1 : partes[3].endsWith('%') ? parseFloat(partes[3]) / 100 : parseFloat(partes[3])
  const cor = { r: canal(partes[0]), g: canal(partes[1]), b: canal(partes[2]), a: alfa }
  return [cor.r, cor.g, cor.b, cor.a].some((v) => Number.isNaN(v)) ? null : cor
}

function hsl({ r, g, b }) {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l, croma: 0 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return { h: h * 60, s, l, croma: d }
}

function deHsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) }
}

function escrever({ r, g, b }, a = 1) {
  const hex = '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  return a >= 1 ? hex : `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)} / ${+a.toFixed(3)})`
}

function comAlfa(hex, a) {
  return escrever(hexParaRgb(hex), a)
}

const neutra = (c) => hsl(c).croma < 0.1

/** Fundo: claro vira superfície escura; tom colorido claro vira o mesmo tom, escuro e translúcido. */
function fundo(c) {
  if (c.a === 0) return null
  const { h, s, l } = hsl(c)
  if (neutra(c)) {
    if (l >= 0.97) return comAlfa(P.card, c.a)
    if (l >= 0.86) return comAlfa(P.suave, c.a)
    if (l >= 0.6) return comAlfa(P.forte, c.a)
    return null
  }
  if (l >= 0.78) return escrever(deHsl(h, Math.min(s, 0.85), 0.55), 0.16 * c.a + 0.02)
  return null
}

/** Texto: escuro vira claro; texto colorido escuro clareia no mesmo tom. */
function texto(c) {
  if (c.a === 0) return null
  const { h, s, l } = hsl(c)
  if (neutra(c)) {
    if (l < 0.3) return comAlfa(P.texto, c.a)
    if (l < 0.48) return comAlfa(P.medio, c.a)
    if (l < 0.75) return comAlfa(P.secundario, c.a)
    return null
  }
  if (l < 0.4) return escrever(deHsl(h, s, 0.76), c.a)
  if (l < 0.55) return escrever(deHsl(h, s, 0.68), c.a)
  return null
}

/** Borda: clara vira escura; preta (linha forte) vira cinza visível no escuro. */
function borda(c) {
  if (c.a === 0) return null
  const { h, s, l } = hsl(c)
  if (neutra(c)) {
    if (l >= 0.8) return comAlfa(P.borda, c.a)
    if (l >= 0.55) return comAlfa(P.bordaForte, c.a)
    if (l < 0.2) return comAlfa('#52525b', c.a)
    return null
  }
  if (l >= 0.8) return escrever(deHsl(h, Math.min(s, 0.85), 0.55), 0.45 * c.a)
  return null
}

/** Sombra que imita borda (cinza claro): escurece; sombras pretas ficam. */
function sombra(c) {
  return neutra(c) && hsl(c).l >= 0.8 && c.a > 0 ? comAlfa(P.borda, c.a) : null
}

const TOKEN = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|rgba?\([^)]*\)|\b(?:white|black)\b/g

function trocarCores(valor, mapa) {
  let mudou = false
  const novo = valor.replace(TOKEN, (token) => {
    const cor = lerCor(token)
    if (!cor) return token
    const saida = mapa(cor)
    if (!saida) return token
    mudou = true
    return saida
  })
  return mudou ? novo : null
}

function mapaDaPropriedade(prop) {
  const p = prop.toLowerCase()
  if (p === 'background' || p === 'background-color' || p === 'background-image') return fundo
  if (p === 'color' || p === 'caret-color' || p === '-webkit-text-fill-color' || p === 'text-decoration-color') return texto
  if (/^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?$/.test(p) || p === 'outline' || p === 'outline-color' || p === 'column-rule') return borda
  if (p === 'box-shadow') return sombra
  return null
}

/* ---------------- seletores ---------------- */

const PREFIXO = '[data-tema="escuro"]'
const FORA_DO_CLARO = ':not(.tema-forcar-claro, .tema-forcar-claro *)'

/** Prefixa com o tema e exclui as áreas que ficam claras (antes do ::pseudo-elemento, se houver). */
function prefixar(seletor) {
  const s = seletor.trim()
  if (/^:root\b/.test(s)) return s.replace(/^:root/, `:root${PREFIXO}`)
  if (/^html\b/.test(s)) return s.replace(/^html/, `html${PREFIXO}`)
  const i = s.indexOf('::')
  const comExclusao = i >= 0 ? `${s.slice(0, i)}${FORA_DO_CLARO}${s.slice(i)}` : `${s}${FORA_DO_CLARO}`
  return `${PREFIXO} ${comExclusao}`
}

/* ---------------- CSS ---------------- */

function arquivosCss() {
  const lista = [...EXTRA]
  for (const pasta of PASTAS) {
    for (const nome of readdirSync(join(root, pasta))) {
      if (nome.endsWith('.css') && !IGNORAR.has(nome)) lista.push(`${pasta}/${nome}`)
    }
  }
  return lista
}

function converterArquivo(caminho) {
  const css = readFileSync(join(root, caminho), 'utf8')
  const origem = postcss.parse(css, { from: caminho })
  const saida = postcss.root()
  let regras = 0

  function visitar(no, destino) {
    no.each((filho) => {
      if (filho.type === 'atrule') {
        const nome = filho.name.toLowerCase()
        if (nome === 'keyframes' || nome.endsWith('keyframes') || nome === 'font-face' || nome === 'import' || nome === 'theme') return
        if (!filho.nodes) return
        const copia = postcss.atRule({ name: filho.name, params: filho.params })
        visitar(filho, copia)
        if (copia.nodes && copia.nodes.length) destino.append(copia)
        return
      }
      if (filho.type !== 'rule') return
      const declaracoes = []
      filho.each((d) => {
        if (d.type !== 'decl' || d.prop.startsWith('--')) return
        const mapa = mapaDaPropriedade(d.prop)
        if (!mapa) return
        const novo = trocarCores(d.value, mapa)
        if (novo) declaracoes.push(postcss.decl({ prop: d.prop, value: novo, important: d.important }))
      })
      if (!declaracoes.length) return
      // Placeholder fica em tema-escuro.css (mais apagado que o texto digitado).
      const seletores = filho.selectors.filter((sel) => !/placeholder/i.test(sel)).map(prefixar)
      if (!seletores.length) return
      const regra = postcss.rule({ selectors: seletores })
      declaracoes.forEach((d) => regra.append(d))
      destino.append(regra)
      regras += 1
    })
  }

  visitar(origem, saida)
  return { css: saida.toString(), regras }
}

/* ---------------- classes Tailwind com cor fixa (ex.: bg-[#f6f8fa]) ---------------- */

function arquivosTsx(pasta, lista = []) {
  for (const nome of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, nome.name)
    if (nome.isDirectory()) arquivosTsx(caminho, lista)
    else if (nome.name.endsWith('.tsx')) lista.push(caminho)
  }
  return lista
}

function classesArbitrarias() {
  const encontradas = new Set()
  const re = /\b(bg|text|border(?:-[trblxy])?)-\[(#[0-9a-fA-F]{3,8})\]/g
  for (const arq of arquivosTsx(join(root, 'src'))) {
    for (const m of readFileSync(arq, 'utf8').matchAll(re)) encontradas.add(`${m[1]}|${m[2]}`)
  }
  const lados = { t: ['top'], r: ['right'], b: ['bottom'], l: ['left'], x: ['left', 'right'], y: ['top', 'bottom'] }
  const linhas = []
  for (const item of [...encontradas].sort()) {
    const [tipo, hex] = item.split('|')
    const cor = lerCor(hex)
    if (!cor) continue
    const classe = `.${tipo}-\\[\\${hex}\\]`
    if (tipo === 'bg') {
      const v = fundo(cor)
      if (v) linhas.push(`${PREFIXO} ${classe}${FORA_DO_CLARO} { background-color: ${v}; }`)
    } else if (tipo === 'text') {
      const v = texto(cor)
      if (v) linhas.push(`${PREFIXO} ${classe}${FORA_DO_CLARO} { color: ${v}; }`)
    } else {
      const v = borda(cor)
      if (!v) continue
      const lado = tipo.split('-')[1]
      const props = lado ? lados[lado].map((l) => `border-${l}-color: ${v};`).join(' ') : `border-color: ${v};`
      linhas.push(`${PREFIXO} ${classe}${FORA_DO_CLARO} { ${props} }`)
    }
  }
  return linhas
}

/* ---------------- classes da paleta do Tailwind (ex.: bg-emerald-50, text-teal-700) ---------------- */

/** Tons 300 (texto claro no escuro) e 500 (base do fundo translúcido) da paleta do Tailwind. */
const PALETA = {
  red: ['#fca5a5', '#ef4444'], orange: ['#fdba74', '#f97316'], amber: ['#fcd34d', '#f59e0b'],
  yellow: ['#fde047', '#eab308'], lime: ['#bef264', '#84cc16'], green: ['#86efac', '#22c55e'],
  emerald: ['#6ee7b7', '#10b981'], teal: ['#5eead4', '#14b8a6'], cyan: ['#67e8f9', '#06b6d4'],
  sky: ['#7dd3fc', '#0ea5e9'], blue: ['#93c5fd', '#3b82f6'], indigo: ['#a5b4fc', '#6366f1'],
  violet: ['#c4b5fd', '#8b5cf6'], purple: ['#d8b4fe', '#a855f7'], fuchsia: ['#f0abfc', '#d946ef'],
  pink: ['#f9a8d4', '#ec4899'], rose: ['#fda4af', '#f43f5e'],
}
const NEUTRAS = new Set(['slate', 'gray', 'zinc', 'neutral', 'stone'])

function paletaTailwind() {
  const re = /\b(hover:)?(bg|text|border)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-(\d{2,3})\b(?!\/)/g
  const encontradas = new Set()
  for (const arq of arquivosTsx(join(root, 'src'))) {
    for (const m of readFileSync(arq, 'utf8').matchAll(re)) encontradas.add(m.slice(1, 5).map((v) => v || '').join('|'))
  }
  const linhas = []
  for (const item of [...encontradas].sort()) {
    const [hover, tipo, cor, tomTexto] = item.split('|')
    const tom = Number(tomTexto)
    const neutra = NEUTRAS.has(cor)
    let regra = null
    if (tipo === 'bg' && tom <= 200) {
      const alfa = tom <= 50 ? 0.16 : tom <= 100 ? 0.2 : 0.26
      regra = `background-color: ${neutra ? (tom <= 50 ? P.suave : tom <= 100 ? '#26262b' : P.forte) : comAlfa(PALETA[cor][1], alfa)};`
    } else if (tipo === 'text' && tom >= 600) {
      regra = `color: ${neutra ? (tom <= 600 ? P.secundario : tom <= 700 ? P.medio : '#e4e4e7') : PALETA[cor][0]};`
    } else if (tipo === 'border' && tom <= 300) {
      regra = `border-color: ${neutra ? P.bordaForte : comAlfa(PALETA[cor][1], 0.4)};`
    }
    if (!regra) continue
    const classe = hover ? `.hover\\:${tipo}-${cor}-${tom}:hover` : `.${tipo}-${cor}-${tom}`
    linhas.push(`${PREFIXO} ${classe}${FORA_DO_CLARO} { ${regra} }`)
  }
  return linhas
}

/* ---------------- saída ---------------- */

const partes = [
  '/* GERADO por scripts/gerar-tema-escuro.mjs — não edite à mão (rode o script de novo). */',
  '/* Ajustes feitos à mão ficam em tema-escuro.css. */',
]
let total = 0
for (const arq of arquivosCss()) {
  const { css, regras } = converterArquivo(arq)
  if (!regras) continue
  total += regras
  partes.push(`\n/* ===== ${relative(root, join(root, arq)).replace(/\\/g, '/')} (${regras} regras) ===== */`, css)
}
const arbitrarias = classesArbitrarias()
partes.push(`\n/* ===== classes Tailwind com cor fixa nos componentes (${arbitrarias.length}) ===== */`, ...arbitrarias)
const paleta = paletaTailwind()
partes.push(`\n/* ===== classes da paleta do Tailwind (${paleta.length}) ===== */`, ...paleta)
writeFileSync(SAIDA, partes.join('\n') + '\n')
console.log(`tema escuro gerado: ${total} regras de CSS + ${arbitrarias.length} classes → ${relative(root, SAIDA)}`)
