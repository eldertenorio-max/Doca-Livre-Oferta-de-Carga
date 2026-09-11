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

/** Cor do veículo no mapa e no filtro (mesma silhueta, cor diferente). */
export const CORES_FROTA: Record<FrotaIconeGrupo, string> = {
  passeio: '#2563eb',
  utilitario: '#0891b2',
  fiorino: '#0d9488',
  van: '#4f46e5',
  hr: '#65a30d',
  vuc: '#16a34a',
  leve: '#ca8a04',
  toco: '#ea580c',
  truck: '#dc2626',
  bitruck: '#e11d48',
  carreta: '#7c3aed',
  carreta_ls: '#6d28d9',
  vanderleia: '#c026d3',
  bitrem: '#0284c7',
  rodotrem: '#1d4ed8',
  outros: '#64748b',
}

function svg(inner: string): string {
  return `<svg viewBox="0 0 120 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`
}

function ground(rx = 50): string {
  return `<ellipse cx="60" cy="45.2" rx="${rx}" ry="1.7" fill="#94a3b8" opacity=".35"/>`
}

/** Roda com recorte branco ao redor (vão do para-lama, como nas silhuetas). */
function wheel(cx: number, r = 6, cy = 37): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r + 1.9}" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#1e293b"/><circle cx="${cx}" cy="${cy}" r="${r * 0.34}" fill="#f8fafc"/>`
}

/** Cabine de caminhão (canto superior esquerdo arredondado + janela vazada). */
function cab(x: number, top: number, w: number, cor: string): string {
  return `
    <path d="M${x} 36V${top + 4}q0-4 4-4h${w - 4}v${36 - top}z" fill="${cor}"/>
    <rect x="${x + 3}" y="${top + 3.5}" width="${w - 8}" height="7.5" rx="1.2" fill="#fff" opacity=".92"/>
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
  cor: string,
): string {
  const boxX = cabX + cabW + 2
  return svg(`
    ${ground()}
    <rect x="${boxX}" y="${boxTop}" width="${boxEnd - boxX}" height="${36 - boxTop}" rx="2" fill="${cor}"/>
    ${cab(cabX, cabTop, cabW, cor)}
    ${wheels}
  `)
}

/** Cavalo mecânico (trator de carreta). */
function cavalo(x: number, top: number, w: number, cor: string): string {
  return `
    <path d="M${x} 36V${top + 3.5}q0-3.5 3.5-3.5h${w - 12}l8.5 8.5V36z" fill="${cor}"/>
    <rect x="${x + 2.8}" y="${top + 3.2}" width="${w - 13}" height="7" rx="1.1" fill="#fff" opacity=".92"/>
  `
}

function montarSvg(): Record<FrotaIconeGrupo, string> {
  const c = CORES_FROTA
  return {
    passeio: svg(`
      <g transform="translate(120 0) scale(-1 1)">
        ${ground(44)}
        <path d="M12 36v-2.8c0-4.2 2.2-7.6 6.8-9.4l7.2-1.5 6.8-8.4c1.2-1.5 3-2.3 5-2.3h22c2.1 0 4 .9 5.2 2.5l5.4 7.2 9.8 1.6c5.2 1.6 8.4 5.4 8.8 10.6V36z" fill="${c.passeio}"/>
        <path d="M33.5 14.2 39.2 12h18.5l4.8 9.8H32.2z" fill="#fff" opacity=".92"/>
        ${wheel(30)}${wheel(88)}
      </g>
    `),

    utilitario: svg(`
      ${ground(46)}
      <path d="M10 36V23.2c0-1.4 1.1-2.5 2.5-2.5h6.2l7.4-8.6c.9-1 2.2-1.6 3.6-1.6h14.2c1.7 0 3.1 1.4 3.1 3.1V22h53.5c2 0 3.5 1.5 3.5 3.4V36z" fill="${c.utilitario}"/>
      <path d="M28.2 13.2h12.6v8.6H25.8z" fill="#fff" opacity=".92"/>
      ${wheel(28)}${wheel(92)}
    `),

    fiorino: svg(`
      ${ground(34)}
      <rect x="52" y="14" width="40" height="22" rx="1.4" fill="${c.fiorino}"/>
      <path d="M22 36V26c0-1.1.9-2 2-2.1l6.5-1.2 4.8-6.2c.6-.8 1.6-1.3 2.6-1.3H52V36z" fill="${c.fiorino}"/>
      <path d="M36.5 17.2 40.2 16h7.2v7.8H35.2z" fill="#fff" opacity=".92"/>
      ${wheel(34, 4.8)}${wheel(80, 4.8)}
    `),

    van: svg(`
      ${ground(46)}
      <rect x="48" y="9" width="58" height="27" rx="1.8" fill="${c.van}"/>
      <path d="M11 36V24.5c0-1.3 1-2.4 2.3-2.5l8.8-1.6 6.8-9.2c.9-1.2 2.3-1.9 3.8-1.9H48V36z" fill="${c.van}"/>
      <path d="M30.5 12.8 36.2 11.2h9.2v10.5H28.8z" fill="#fff" opacity=".92"/>
      ${wheel(26, 5.6)}${wheel(90, 5.6)}
    `),

    hr: bauSvg(14, 14, 22, 16.5, 88, `${wheel(26, 5.2)}${wheel(74, 5.2)}`, c.hr),
    vuc: bauSvg(12, 12.5, 23, 14.5, 96, `${wheel(24, 5.4)}${wheel(80, 5.4)}`, c.vuc),
    leve: bauSvg(10, 11, 24, 12.5, 104, `${wheel(22, 5.6)}${wheel(88, 5.6)}`, c.leve),
    toco: bauSvg(8, 10, 25, 11, 112, `${wheel(20, 5.8)}${wheel(94, 5.8)}`, c.toco),
    truck: bauSvg(7, 9.5, 25, 10.5, 113, `${wheel(18, 5.6)}${wheel(80, 5.6)}${wheel(97, 5.6)}`, c.truck),
    bitruck: bauSvg(
      6,
      9.5,
      24,
      10,
      114,
      `${wheel(15, 5.4)}${wheel(31, 5.4)}${wheel(83, 5.4)}${wheel(100, 5.4)}`,
      c.bitruck,
    ),

    carreta: svg(`
      ${ground()}
      <rect x="30" y="11" width="84" height="25" rx="2" fill="${c.carreta}"/>
      ${cavalo(5, 13, 23, c.carreta)}
      ${wheel(14, 5.6)}${wheel(46, 5.6)}${wheel(98, 5.6)}
    `),

    carreta_ls: svg(`
      ${ground()}
      <rect x="27" y="11.5" width="89" height="24.5" rx="2" fill="${c.carreta_ls}"/>
      ${cavalo(4, 13.5, 22, c.carreta_ls)}
      ${wheel(13, 5.4)}${wheel(42, 5.4)}${wheel(72, 5.4)}${wheel(100, 5.4)}
    `),

    vanderleia: svg(`
      ${ground()}
      <rect x="30" y="11" width="84" height="25" rx="2" fill="${c.vanderleia}"/>
      ${cavalo(5, 13, 23, c.vanderleia)}
      ${wheel(14, 5.5)}${wheel(42, 5.5)}${wheel(102, 5.5)}
    `),

    bitrem: svg(`
      ${ground()}
      <rect x="24" y="12" width="40" height="24" rx="1.8" fill="${c.bitrem}"/>
      <rect x="68" y="12" width="49" height="24" rx="1.8" fill="${c.bitrem}"/>
      ${cavalo(3, 14, 20, c.bitrem)}
      ${wheel(11, 5)}${wheel(38, 5)}${wheel(60, 5)}${wheel(84, 5)}${wheel(106, 5)}
    `),

    rodotrem: svg(`
      ${ground()}
      <rect x="21" y="12.5" width="32" height="23.5" rx="1.6" fill="${c.rodotrem}"/>
      <rect x="56" y="12.5" width="29" height="23.5" rx="1.6" fill="${c.rodotrem}"/>
      <rect x="88" y="12.5" width="30" height="23.5" rx="1.6" fill="${c.rodotrem}"/>
      ${cavalo(2, 14.5, 18, c.rodotrem)}
      ${wheel(9, 4.8)}${wheel(30, 4.8)}${wheel(50, 4.8)}${wheel(72, 4.8)}${wheel(96, 4.8)}${wheel(112, 4.8)}
    `),

    outros: bauSvg(9, 11, 24, 13, 110, `${wheel(20, 5.8)}${wheel(90, 5.8)}`, c.outros),
  }
}

const SVG = montarSvg()

export function frotaIconeHtml(grupo: FrotaIconeGrupo, className = 'frota-veiculo-ico'): string {
  return `<span class="${className}" data-grupo="${grupo}">${(SVG[grupo] ?? SVG.outros).trim()}</span>`
}

export function frotaIconeSvgRaw(grupo: FrotaIconeGrupo): string {
  return (SVG[grupo] ?? SVG.outros).trim()
}
