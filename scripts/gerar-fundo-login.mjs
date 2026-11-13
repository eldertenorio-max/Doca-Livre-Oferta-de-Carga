/**
 * Gera public/login-bg.svg: ilustração do fundo do login (porto/doca à noite,
 * contêineres, guindastes, rodovia e caminhões), nas cores da marca.
 * Os caminhões ficam nas laterais para aparecer ao lado do painel de login.
 *
 *   node scripts/gerar-fundo-login.mjs
 */
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const saida = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'login-bg.svg')
const W = 1920
const H = 1080
const AMARELO = '#f9db00'

/* Gerador pseudoaleatório fixo: a imagem sai sempre igual. */
let semente = 42
const aleatorio = () => ((semente = (semente * 1664525 + 1013904223) % 4294967296) / 4294967296)
const r1 = (v) => Math.round(v * 10) / 10

const partes = []
const add = (s) => partes.push(s)

/* ---------- céu ---------- */
add(`<defs>
  <linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#050913"/><stop offset="0.55" stop-color="#0c1430"/><stop offset="1" stop-color="#1b2650"/>
  </linearGradient>
  <linearGradient id="asfalto" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#121a36"/><stop offset="1" stop-color="#070b18"/>
  </linearGradient>
  <radialGradient id="lua" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fff6c2" stop-opacity="0.55"/><stop offset="1" stop-color="#fff6c2" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="poste" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="${AMARELO}" stop-opacity="0.3"/><stop offset="1" stop-color="${AMARELO}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="farol" cx="0" cy="0.5" r="1">
    <stop offset="0" stop-color="#fffbe0" stop-opacity="0.75"/><stop offset="1" stop-color="#fffbe0" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="lanterna" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#ff4d4d" stop-opacity="0.8"/><stop offset="1" stop-color="#ff4d4d" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="chao-porto" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1a2349"/><stop offset="1" stop-color="#10172f"/>
  </linearGradient>
</defs>`)
add(`<rect width="${W}" height="${H}" fill="url(#ceu)"/>`)

// estrelas
const estrelas = []
for (let i = 0; i < 140; i++) {
  const x = r1(aleatorio() * W)
  const y = r1(aleatorio() * 520)
  const r = r1(0.6 + aleatorio() * 1.6)
  const o = (0.25 + aleatorio() * 0.6).toFixed(2)
  estrelas.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"/>`)
}
add(`<g>${estrelas.join('')}</g>`)

// lua
add(`<circle cx="1640" cy="170" r="140" fill="url(#lua)"/><circle cx="1640" cy="170" r="38" fill="#fff4bf" opacity="0.92"/>`)

/* ---------- cidade ao longe ---------- */
const predios = []
const janelas = []
let x = -10
while (x < W) {
  const largura = 40 + aleatorio() * 70
  const altura = 50 + aleatorio() * 150
  const topo = 700 - altura
  predios.push(`<rect x="${r1(x)}" y="${r1(topo)}" width="${r1(largura)}" height="${r1(altura + 20)}"/>`)
  for (let jy = topo + 12; jy < 690; jy += 16) {
    for (let jx = x + 8; jx < x + largura - 8; jx += 14) {
      if (aleatorio() < 0.16) janelas.push(`<rect x="${r1(jx)}" y="${r1(jy)}" width="5" height="7"/>`)
    }
  }
  x += largura + 4
}
add(`<g fill="#121a38">${predios.join('')}</g>`)
add(`<g fill="${AMARELO}" opacity="0.32">${janelas.join('')}</g>`)

/* ---------- pátio do porto ---------- */
add(`<rect x="0" y="690" width="${W}" height="140" fill="url(#chao-porto)"/>`)

// guindastes de pórtico
function guindaste(gx, escala, espelhar = false) {
  const t = `translate(${gx} 690) scale(${espelhar ? -escala : escala} ${escala})`
  return `<g transform="${t}">
    <g fill="#1b2756">
      <rect x="0" y="-300" width="16" height="300"/><rect x="120" y="-300" width="16" height="300"/>
      <rect x="-40" y="-318" width="300" height="20"/>
      <polygon points="0,-150 136,-150 136,-138 0,-138"/>
      <polygon points="8,-300 128,-150 120,-150 0,-292"/>
      <rect x="150" y="-298" width="34" height="30"/>
    </g>
    <rect x="-40" y="-318" width="300" height="5" fill="${AMARELO}" opacity="0.75"/>
    <line x1="200" y1="-298" x2="200" y2="-190" stroke="#3a4a85" stroke-width="2"/>
    <rect x="186" y="-192" width="28" height="12" fill="${AMARELO}" opacity="0.85"/>
    <circle cx="255" cy="-322" r="4" fill="#ff5a5a"/>
  </g>`
}
add(guindaste(70, 1.05))
add(guindaste(1500, 1.05, true))
add(guindaste(380, 0.75))
add(guindaste(1270, 0.75, true))

// pilhas de contêineres
const CORES_CONTEINER = ['#22346b', '#2c3f7a', '#1e4a5c', '#5b2c3a', '#3a3f63', '#7a6420']
function conteiner(cx, cy, largura, altura, cor) {
  const nervuras = []
  for (let n = cx + 8; n < cx + largura - 4; n += 9) nervuras.push(`<line x1="${r1(n)}" y1="${r1(cy + 4)}" x2="${r1(n)}" y2="${r1(cy + altura - 4)}"/>`)
  return `<rect x="${r1(cx)}" y="${r1(cy)}" width="${r1(largura)}" height="${r1(altura)}" fill="${cor}"/>` +
    `<g stroke="#000" stroke-opacity="0.25" stroke-width="1.5">${nervuras.join('')}</g>` +
    `<rect x="${r1(cx)}" y="${r1(cy)}" width="${r1(largura)}" height="3" fill="#fff" opacity="0.08"/>`
}
function pilha(px, colunas, niveis, largura = 92, altura = 40) {
  const blocos = []
  for (let c = 0; c < colunas; c++) {
    const n = Math.max(1, Math.round(niveis - aleatorio() * 1.6))
    for (let l = 0; l < n; l++) {
      const cor = CORES_CONTEINER[Math.floor(aleatorio() * CORES_CONTEINER.length)]
      blocos.push(conteiner(px + c * (largura + 4), 820 - (l + 1) * (altura + 3), largura, altura, cor))
    }
  }
  return blocos.join('')
}
add(pilha(20, 6, 4))
add(pilha(1330, 6, 4))
add(pilha(620, 3, 2, 80, 34))
add(pilha(1060, 3, 2, 80, 34))

/* ---------- rodovia ---------- */
add(`<rect x="0" y="830" width="${W}" height="250" fill="url(#asfalto)"/>`)
add(`<rect x="0" y="830" width="${W}" height="6" fill="#2b3666"/>`) // mureta
add(`<rect x="0" y="842" width="${W}" height="3" fill="#cbd5e1" opacity="0.28"/>`) // linha da borda
add(`<rect x="0" y="1062" width="${W}" height="3" fill="#cbd5e1" opacity="0.2"/>`)
const faixas = []
for (let fx = -20; fx < W; fx += 120) faixas.push(`<rect x="${fx}" y="948" width="64" height="7" rx="2"/>`)
add(`<g fill="${AMARELO}" opacity="0.85">${faixas.join('')}</g>`)

// postes
function poste(px) {
  return `<circle cx="${px + 34}" cy="742" r="90" fill="url(#poste)"/>` +
    `<g fill="#26326a"><rect x="${px}" y="740" width="7" height="96"/><rect x="${px}" y="738" width="40" height="5"/></g>` +
    `<rect x="${px + 28}" y="742" width="16" height="5" rx="2" fill="#fff3a6"/>`
}
for (const px of [40, 470, 1360, 1800]) add(poste(px))

/* ---------- caminhões ---------- */
function iconeDoca(ix, iy, escala) {
  // ícone da marca (moldura com setas), simplificado
  return `<g transform="translate(${ix} ${iy}) scale(${escala})" fill="${AMARELO}">
    <path d="M0 0h44v6H6v38h38v6H0z"/><path d="M100 0H56v6h38v38H56v6h44z"/>
    <path d="M14 25 30 13v24z"/><rect x="28" y="20" width="18" height="10"/>
    <path d="M86 25 70 13v24z"/><rect x="54" y="20" width="18" height="10"/>
  </g>`
}
function caminhao(cx, base, escala, paraEsquerda = false) {
  const t = paraEsquerda ? `translate(${cx} ${base}) scale(${-escala} ${escala})` : `translate(${cx} ${base}) scale(${escala})`
  return `<g transform="${t}">
    <ellipse cx="300" cy="4" rx="320" ry="14" fill="#000" opacity="0.35"/>
    <ellipse cx="760" cy="-52" rx="210" ry="58" fill="url(#farol)"/>
    <circle cx="4" cy="-80" r="26" fill="url(#lanterna)"/>
    <rect x="0" y="-210" width="420" height="168" rx="6" fill="#1f2d5c"/>
    <rect x="0" y="-210" width="420" height="5" fill="#fff" opacity="0.12"/>
    <rect x="0" y="-78" width="420" height="10" fill="${AMARELO}"/>
    ${iconeDoca(150, -176, 1.2)}
    <rect x="2" y="-90" width="7" height="18" fill="#ff4d4d"/>
    <rect x="10" y="-44" width="590" height="14" fill="#0a0f22"/>
    <path d="M430 -44 V-176 H540 L580 -118 L588 -44 Z" fill="#e9ecf3"/>
    <path d="M456 -164 H530 L566 -118 H456 Z" fill="#0b1430"/>
    <path d="M462 -158 H492 L476 -124 H462 Z" fill="#fff" opacity="0.12"/>
    <rect x="430" y="-92" width="158" height="8" fill="${AMARELO}"/>
    <rect x="576" y="-66" width="14" height="14" rx="2" fill="#fffbe0"/>
    <g fill="#04060d">
      <circle cx="70" cy="-28" r="27"/><circle cx="132" cy="-28" r="27"/><circle cx="330" cy="-28" r="27"/>
      <circle cx="476" cy="-28" r="27"/><circle cx="548" cy="-28" r="27"/>
    </g>
    <g fill="#3a4675">
      <circle cx="70" cy="-28" r="10"/><circle cx="132" cy="-28" r="10"/><circle cx="330" cy="-28" r="10"/>
      <circle cx="476" cy="-28" r="10"/><circle cx="548" cy="-28" r="10"/>
    </g>
  </g>`
}
add(caminhao(60, 935, 0.98))
add(caminhao(1860, 1040, 1.02, true))

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Porto e rodovia à noite">
${partes.join('\n')}
</svg>
`
writeFileSync(saida, svg)
console.log(`fundo do login gerado: ${(svg.length / 1024).toFixed(1)} KB`)
