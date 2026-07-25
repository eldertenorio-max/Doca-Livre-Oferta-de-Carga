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
  // Todos com a frente à esquerda (mesmo sentido dos caminhões).
  passeio: svg(`
    ${ground(44)}
    <path d="M12 36v-2.8c0-4.2 2.2-7.6 6.8-9.4l7.2-1.5 6.8-8.4c1.2-1.5 3-2.3 5-2.3h22c2.1 0 4 .9 5.2 2.5l5.4 7.2 9.8 1.6c5.2 1.6 8.4 5.4 8.8 10.6V36z" fill="${C}"/>
    <path d="M33.5 14.2 39.2 12h18.5l4.8 9.8H32.2z" fill="#fff"/>
    ${wheel(30)}${wheel(88)}
  `),

  utilitario: svg(`
    ${ground(46)}
    <path d="M10 36V23.2c0-1.4 1.1-2.5 2.5-2.5h6.2l7.4-8.6c.9-1 2.2-1.6 3.6-1.6h14.2c1.7 0 3.1 1.4 3.1 3.1V22h53.5c2 0 3.5 1.5 3.5 3.4V36z" fill="${C}"/>
    <path d="M28.2 13.2h12.6v8.6H25.8z" fill="#fff"/>
    ${wheel(28)}${wheel(92)}
  `),

  fiorino: svg(`
    ${ground(44)}
    <path d="M12 36V24.8c0-4.6 2.6-7.8 7.2-9.2l6.4-.9c2.2-3.2 5.4-4.9 9.6-4.9h4.2c1.5 0 2.8.7 3.6 1.9l4.2 5.6H100c2 0 3.2 1.6 3.2 3.6V36z" fill="${C}"/>
    <path d="M32.6 12.2c2.2-1.4 4.6-2.1 7.6-2.1h2.4l3.8 5.4H31z" fill="#fff"/>
    ${wheel(28)}${wheel(90)}
  `),

  van: svg(`
    ${ground(46)}
    <path d="M11 36V15.2c0-2.6 2.1-4.7 4.7-4.7h68.5c2.5 0 4.5 2 4.5 4.5V36z" fill="${C}"/>
    <rect x="16.5" y="14.2" width="15" height="9.2" rx="1.3" fill="#fff"/>
    ${wheel(28)}${wheel(84)}
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
