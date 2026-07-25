export type FrotaIconeGrupo =
  | 'van'
  | 'fiorino'
  | 'utilitario'
  | 'passeio'
  | 'hr'
  | 'vuc'
  | 'leve'
  | 'toco'
  | 'truck'
  | 'bitruck'
  | 'carreta'
  | 'carreta_ls'
  | 'vanderleia'
  | 'bitrem'
  | 'rodotrem'
  | 'outros'

/** Cor única das silhuetas (estilo flat, vista lateral). */
const C = '#252b39'

function svg(inner: string): string {
  return `<svg viewBox="0 0 120 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`
}

function ground(rx = 50): string {
  return `<ellipse cx="60" cy="45.2" rx="${rx}" ry="1.7" fill="#94a3b8" opacity=".35"/>`
}

/** Roda com recorte branco ao redor (vão do para-lama, como nas silhuetas). */
function wheel(cx: number, r = 6, cy = 37): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r + 1.9}" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${C}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.34}" fill="#fff"/>`
}

/** Cabine de caminhão (canto superior esquerdo arredondado + janela vazada). */
function cab(x: number, top: number, w: number): string {
  return `
    <path d="M${x} 36V${top + 4}q0-4 4-4h${w - 4}v${36 - top}z" fill="${C}"/>
    <rect x="${x + 3}" y="${top + 3.5}" width="${w - 8}" height="7.5" rx="1.2" fill="#fff"/>
  `
}

/** Caminhão baú completo: cabine + caixa + rodas. */
function bauSvg(
  cabX: number,
  cabTop: number,
  cabW: number,
  boxTop: number,
  boxEnd: number,
  wheels: string,
): string {
  const boxX = cabX + cabW + 2
  return svg(`
    ${ground()}
    <rect x="${boxX}" y="${boxTop}" width="${boxEnd - boxX}" height="${36 - boxTop}" rx="2" fill="${C}"/>
    ${cab(cabX, cabTop, cabW)}
    ${wheels}
  `)
}

/** Cavalo mecânico (trator de carreta). */
function cavalo(x: number, top: number, w: number): string {
  return `
    <path d="M${x} 36V${top + 3.5}q0-3.5 3.5-3.5h${w - 12}l8.5 8.5V36z" fill="${C}"/>
    <rect x="${x + 2.8}" y="${top + 3.2}" width="${w - 13}" height="7" rx="1.1" fill="#fff"/>
  `
}

const SVG: Record<FrotaIconeGrupo, string> = {
  passeio: svg(`
    ${ground(44)}
    <path d="M13 36v-3.6c0-5.6 4-9.7 10.6-11.2l8.9-1.6c4.3-5.4 10.5-8.1 19.6-8.1 9 0 15.2 2.6 19.6 7.8l9.3 1.9c6.7 1.5 11 5.8 11 11.6V36z" fill="${C}"/>
    <path d="M40 18.4c3.4-4.2 8-6.2 13.9-6.3v6.3z" fill="#fff"/>
    <path d="M56.8 12.1c5.8.2 10.2 2.2 13.5 6.3H56.8z" fill="#fff"/>
    ${wheel(33)}${wheel(87)}
  `),

  utilitario: svg(`
    ${ground(46)}
    <path d="M11 36V22.7c0-1.3 1-2.3 2.3-2.3h7.4l6.7-8.2c.8-.9 1.9-1.5 3.1-1.5h11.7c1.6 0 2.9 1.3 2.9 2.9v6.8h56.4c2.1 0 3.5 1.6 3.5 3.6V36z" fill="${C}"/>
    <path d="M31.2 13.3h10.3v7.1H25.4z" fill="#fff"/>
    ${wheel(30)}${wheel(90)}
  `),

  fiorino: svg(`
    ${ground(44)}
    <path d="M14 36V24.4c0-4.9 2.9-8.4 7.8-9.8l7.7-1c2.3-3 5.6-4.6 10.1-4.6h3.9c1.4 0 2.7.6 3.6 1.7l4.8 5.9h44.6c2.2 0 3.5 1.7 3.5 3.9V36z" fill="${C}"/>
    <path d="M35.8 11.6c2.4-1.5 5.1-2.2 8.5-2.2h2l4.5 5.7H33.6z" fill="#fff"/>
    ${wheel(30)}${wheel(88)}
  `),

  van: svg(`
    ${ground(46)}
    <path d="M12 36V16c0-2.8 2.2-5 5-5h57.8c1.5 0 2.9.6 3.9 1.8L91.9 26c1.4 1.6 2.1 3.6 2.1 5.7V36z" fill="${C}"/>
    <rect x="17" y="15" width="16" height="9.5" rx="1.4" fill="#fff"/>
    <path d="M64 15h9.3l8.2 9.5H64z" fill="#fff"/>
    ${wheel(30)}${wheel(80)}
  `),

  hr: bauSvg(10, 12, 24, 14, 108, `${wheel(22, 5.8)}${wheel(92, 5.8)}`),

  vuc: bauSvg(9, 11, 25, 12.5, 110, `${wheel(21, 5.8)}${wheel(90, 5.8)}`),

  leve: bauSvg(9, 10.5, 25, 12, 111, `${wheel(21, 5.8)}${wheel(92, 5.8)}`),

  toco: bauSvg(8, 10, 25, 11, 112, `${wheel(20, 5.8)}${wheel(94, 5.8)}`),

  truck: bauSvg(7, 9.5, 25, 10.5, 113, `${wheel(18, 5.6)}${wheel(80, 5.6)}${wheel(97, 5.6)}`),

  bitruck: bauSvg(
    6,
    9.5,
    24,
    10,
    114,
    `${wheel(15, 5.4)}${wheel(31, 5.4)}${wheel(83, 5.4)}${wheel(100, 5.4)}`,
  ),

  carreta: svg(`
    ${ground()}
    <rect x="30" y="11" width="84" height="25" rx="2" fill="${C}"/>
    ${cavalo(5, 13, 23)}
    ${wheel(14, 5.6)}${wheel(46, 5.6)}${wheel(98, 5.6)}
  `),

  carreta_ls: svg(`
    ${ground()}
    <rect x="27" y="11.5" width="89" height="24.5" rx="2" fill="${C}"/>
    ${cavalo(4, 13.5, 22)}
    ${wheel(13, 5.4)}${wheel(42, 5.4)}${wheel(72, 5.4)}${wheel(100, 5.4)}
  `),

  vanderleia: svg(`
    ${ground()}
    <rect x="30" y="11" width="84" height="25" rx="2" fill="${C}"/>
    ${cavalo(5, 13, 23)}
    ${wheel(14, 5.5)}${wheel(42, 5.5)}${wheel(102, 5.5)}
  `),

  bitrem: svg(`
    ${ground()}
    <rect x="24" y="12" width="40" height="24" rx="1.8" fill="${C}"/>
    <rect x="68" y="12" width="49" height="24" rx="1.8" fill="${C}"/>
    ${cavalo(3, 14, 20)}
    ${wheel(11, 5)}${wheel(38, 5)}${wheel(60, 5)}${wheel(84, 5)}${wheel(106, 5)}
  `),

  rodotrem: svg(`
    ${ground()}
    <rect x="21" y="12.5" width="32" height="23.5" rx="1.6" fill="${C}"/>
    <rect x="56" y="12.5" width="29" height="23.5" rx="1.6" fill="${C}"/>
    <rect x="88" y="12.5" width="30" height="23.5" rx="1.6" fill="${C}"/>
    ${cavalo(2, 14.5, 18)}
    ${wheel(9, 4.8)}${wheel(30, 4.8)}${wheel(50, 4.8)}${wheel(72, 4.8)}${wheel(96, 4.8)}${wheel(112, 4.8)}
  `),

  outros: bauSvg(9, 11, 24, 13, 110, `${wheel(20, 5.8)}${wheel(90, 5.8)}`),
}

export function frotaIconeHtml(grupo: FrotaIconeGrupo, className = 'frota-veiculo-ico'): string {
  return `<span class="${className}" data-grupo="${grupo}">${(SVG[grupo] ?? SVG.outros).trim()}</span>`
}

export function frotaIconeSvgRaw(grupo: FrotaIconeGrupo): string {
  return (SVG[grupo] ?? SVG.outros).trim()
}
