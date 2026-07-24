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

type Paint = { hi: string; mid: string; lo: string }

/**
 * Ícones laterais realistas: lataria com gradiente, vidro com reflexo,
 * pneu + aro metálico e sombra no chão.
 */
function svg(id: string, paint: Paint, inner: string): string {
  return `<svg viewBox="0 0 120 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>
    <linearGradient id="${id}-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${paint.hi}"/>
      <stop offset="48%" stop-color="${paint.mid}"/>
      <stop offset="100%" stop-color="${paint.lo}"/>
    </linearGradient>
    <linearGradient id="${id}-glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="50%" stop-color="#94a3b8"/>
      <stop offset="100%" stop-color="#475569"/>
    </linearGradient>
    <linearGradient id="${id}-tire" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <radialGradient id="${id}-rim" cx="38%" cy="32%" r="68%">
      <stop offset="0%" stop-color="#f1f5f9"/>
      <stop offset="55%" stop-color="#94a3b8"/>
      <stop offset="100%" stop-color="#475569"/>
    </radialGradient>
  </defs>${inner}</svg>`
}

function ground(): string {
  return `<ellipse cx="60" cy="43.5" rx="48" ry="2.4" fill="#94a3b8" opacity=".28"/>`
}

function wheel(id: string, cx: number, cy = 36, r = 6.2): string {
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-tire)"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 1.5}" fill="#1e293b"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 2.6}" fill="url(#${id}-rim)"/>
    <circle cx="${cx}" cy="${cy}" r="1.35" fill="#64748b"/>
    <circle cx="${cx - 1.2}" cy="${cy - 1.4}" r="1.1" fill="#fff" opacity=".25"/>
  `
}

function headlight(x: number, y: number): string {
  return `<rect x="${x}" y="${y}" width="5.5" height="3.2" rx="1" fill="#fde68a"/><rect x="${x + 0.6}" y="${y + 0.5}" width="4.2" height="1.2" rx=".5" fill="#fff" opacity=".55"/>`
}

function taillight(x: number, y: number): string {
  return `<rect x="${x}" y="${y}" width="4.2" height="3" rx=".8" fill="#ef4444"/><rect x="${x + 0.5}" y="${y + 0.4}" width="3.2" height="1" rx=".4" fill="#fecaca" opacity=".7"/>`
}

const SVG: Record<FrotaIconeGrupo, string> = {
  passeio: svg('ps', { hi: '#d0d7e2', mid: '#8b96a8', lo: '#5b6575' }, `
    ${ground()}
    <path d="M14 34c1.2-7.5 5-13 12.5-15.5l9-1.2c3.5-5.5 9.5-8.8 18.5-8.8s15 3.3 18.5 8.8l8.5 1.2c7 2 11 8 12 15.5H14z" fill="url(#ps-body)"/>
    <path d="M14 34h92v1.8H14z" fill="#334155" opacity=".3"/>
    <path d="M38 12.5c4.2-3.2 9-4.8 16-4.8s11.8 1.6 16 4.8l-2.2 10.2H40.2L38 12.5z" fill="url(#ps-glass)"/>
    <path d="M54 8.2v14.5" stroke="#64748b" stroke-width="1.2" opacity=".45"/>
    <path d="M40 13.2c3.5-2.2 7.5-3.2 14-3.2v3.5H41.2z" fill="#fff" opacity=".38"/>
    ${headlight(16, 26)}
    ${taillight(99, 26)}
    <path d="M52 30h16" stroke="#e2e8f0" stroke-width="1.4" opacity=".5" stroke-linecap="round"/>
    ${wheel('ps', 34)}${wheel('ps', 86)}
  `),

  utilitario: svg('ut', { hi: '#fde047', mid: '#eab308', lo: '#a16207' }, `
    ${ground()}
    <path d="M12 35c1.5-9 5.5-14.5 14-17l10-.8c2.8-4.2 8.2-6.7 16.5-6.7s13.7 2.5 16.5 6.7l11 .8c7.5 2 12 8.5 13.2 17H12z" fill="url(#ut-body)"/>
    <path d="M12 35h96v1.6H12z" fill="#854d0e" opacity=".28"/>
    <path d="M39 13c3.8-2.8 8.2-4.2 14.5-4.2s10.7 1.4 14.5 4.2l-1.8 11.2H40.8L39 13z" fill="url(#ut-glass)"/>
    <path d="M53.5 9.2v14.5" stroke="#a16207" stroke-width="1.1" opacity=".4"/>
    <path d="M40.5 13.6c3.2-2 7-3 13-3v3.2H41.6z" fill="#fff" opacity=".42"/>
    <rect x="100" y="20" width="7" height="9" rx="1.2" fill="#854d0e"/>
    ${headlight(14.5, 27)}
    ${wheel('ut', 33)}${wheel('ut', 87)}
  `),

  fiorino: svg('fi', { hi: '#b8c2d0', mid: '#7b8798', lo: '#4b5563' }, `
    ${ground()}
    <path d="M10 35c1.2-7.5 4-13 11-15.5h11c2.5-3.8 6.5-6 12-6h5l7.5 9.5V35H10z" fill="url(#fi-body)"/>
    <path d="M54 21.5h56v13.5H54z" fill="#64748b"/>
    <path d="M54 21.5h56v3.2H54z" fill="#475569"/>
    <path d="M54 24.7h56v2" fill="#94a3b8" opacity=".25"/>
    <path d="M35 15c3-2.2 6.2-3.2 10.5-3.2h3.5l5 8.2H36.2L35 15z" fill="url(#fi-glass)"/>
    <path d="M36.2 15.5c2.4-1.5 5-2.2 8.8-2.2v2.8H37z" fill="#fff" opacity=".35"/>
    ${headlight(12.5, 27)}
    ${wheel('fi', 30)}${wheel('fi', 92)}
  `),

  van: svg('vn', { hi: '#818cf8', mid: '#4f46e5', lo: '#312e81' }, `
    ${ground()}
    <path d="M10 35V14.5c0-2.8 2.2-5 5-5h62c1.2 0 2.2.5 3 1.3L94 22v13H10z" fill="url(#vn-body)"/>
    <path d="M10 35h84v1.5H10z" fill="#1e1b4b" opacity=".32"/>
    <rect x="16" y="13.5" width="18" height="11.5" rx="1.8" fill="url(#vn-glass)"/>
    <path d="M16 13.5h18v3.2H16z" fill="#fff" opacity=".38"/>
    <path d="M40 14h48" stroke="#1e1b4b" stroke-width="1.4" opacity=".3"/>
    <path d="M52 14v14M68 14v14" stroke="#1e1b4b" stroke-width="1" opacity=".22"/>
    ${headlight(12, 27)}
    ${taillight(89, 26.5)}
    ${wheel('vn', 30)}${wheel('vn', 82)}
  `),

  hr: svg('hr', { hi: '#fef08a', mid: '#facc15', lo: '#ca8a04' }, `
    ${ground()}
    <rect x="36" y="12" width="74" height="23" rx="2.5" fill="url(#hr-body)"/>
    <path d="M36 12h74v4H36z" fill="#fff" opacity=".22"/>
    <path d="M48 15v16M62 15v16M76 15v16M90 15v16" stroke="#a16207" stroke-width="1" opacity=".28"/>
    <path d="M8 35V15.5C8 12.5 10.5 10 13.5 10H36v25H8z" fill="#64748b"/>
    <path d="M8 15.5h28v3H8z" fill="#94a3b8" opacity=".35"/>
    <rect x="12" y="14.5" width="16" height="11" rx="1.6" fill="url(#hr-glass)"/>
    <path d="M12 14.5h16v3H12z" fill="#fff" opacity=".42"/>
    ${headlight(9.5, 28)}
    ${wheel('hr', 22)}${wheel('hr', 92)}
  `),

  vuc: svg('vu', { hi: '#7dd3fc', mid: '#0ea5e9', lo: '#0369a1' }, `
    ${ground()}
    <rect x="34" y="10.5" width="76" height="24.5" rx="2.8" fill="url(#vu-body)"/>
    <path d="M34 10.5h76v4.5H34z" fill="#fff" opacity=".24"/>
    <path d="M48 14v16M64 14v16M80 14v16M96 14v16" stroke="#0369a1" stroke-width="1" opacity=".3"/>
    <path d="M8 35V15c0-2.8 2.2-5 5-5h21v25H8z" fill="#0369a1"/>
    <rect x="11.5" y="14.5" width="15.5" height="11" rx="1.6" fill="url(#vu-glass)"/>
    <path d="M11.5 14.5h15.5v3H11.5z" fill="#fff" opacity=".42"/>
    ${headlight(9.5, 28)}
    ${wheel('vu', 22)}${wheel('vu', 90)}
  `),

  leve: svg('lv', { hi: '#fdba74', mid: '#fb923c', lo: '#c2410c' }, `
    ${ground()}
    <rect x="34" y="10" width="76" height="25" rx="2.8" fill="url(#lv-body)"/>
    <path d="M34 10h76v4.5H34z" fill="#fff" opacity=".2"/>
    <path d="M8 35V14.5C8 11.8 10.2 9.5 13 9.5h21V35H8z" fill="#9a3412"/>
    <rect x="11.5" y="14" width="15.5" height="11" rx="1.6" fill="url(#lv-glass)"/>
    <path d="M11.5 14h15.5v3H11.5z" fill="#fff" opacity=".42"/>
    ${headlight(9.5, 28)}
    ${wheel('lv', 22)}${wheel('lv', 92)}
  `),

  toco: svg('tc', { hi: '#86efac', mid: '#22c55e', lo: '#15803d' }, `
    ${ground()}
    <rect x="32" y="9" width="80" height="26" rx="2.8" fill="url(#tc-body)"/>
    <path d="M32 9h80v4.5H32z" fill="#fff" opacity=".22"/>
    <path d="M48 13v17M66 13v17M84 13v17M100 13v17" stroke="#166534" stroke-width="1" opacity=".28"/>
    <path d="M6 35V13.5C6 10.8 8.2 8.5 11 8.5h21V35H6z" fill="#14532d"/>
    <rect x="9.5" y="13.5" width="15.5" height="11" rx="1.6" fill="url(#tc-glass)"/>
    <path d="M9.5 13.5h15.5v3H9.5z" fill="#fff" opacity=".42"/>
    ${headlight(7.5, 27.5)}
    ${wheel('tc', 20)}${wheel('tc', 94)}
  `),

  truck: svg('tr', { hi: '#93c5fd', mid: '#3b82f6', lo: '#1d4ed8' }, `
    ${ground()}
    <rect x="30" y="8.5" width="84" height="26.5" rx="2.8" fill="url(#tr-body)"/>
    <path d="M30 8.5h84v4.5H30z" fill="#fff" opacity=".22"/>
    <path d="M46 12.5v17M64 12.5v17M82 12.5v17M100 12.5v17" stroke="#1e40af" stroke-width="1" opacity=".28"/>
    <path d="M5 35V13C5 10.2 7.2 8 10 8h20v27H5z" fill="#1e3a8a"/>
    <rect x="8.5" y="13" width="15" height="11" rx="1.5" fill="url(#tr-glass)"/>
    <path d="M8.5 13h15v3H8.5z" fill="#fff" opacity=".42"/>
    ${headlight(6.5, 27.5)}
    ${wheel('tr', 18, 36, 5.8)}${wheel('tr', 78, 36, 5.8)}${wheel('tr', 96, 36, 5.8)}
  `),

  bitruck: svg('bt', { hi: '#fcd34d', mid: '#f59e0b', lo: '#b45309' }, `
    ${ground()}
    <rect x="28" y="8.5" width="86" height="26.5" rx="2.8" fill="url(#bt-body)"/>
    <path d="M28 8.5h86v4.5H28z" fill="#fff" opacity=".18"/>
    <path d="M4 35V13C4 10.2 6.2 8 9 8h19v27H4z" fill="#78350f"/>
    <rect x="7.5" y="13" width="14" height="11" rx="1.5" fill="url(#bt-glass)"/>
    <path d="M7.5 13h14v3H7.5z" fill="#fff" opacity=".42"/>
    ${headlight(5.5, 27.5)}
    ${wheel('bt', 16, 36, 5.5)}${wheel('bt', 52, 36, 5.5)}${wheel('bt', 78, 36, 5.5)}${wheel('bt', 98, 36, 5.5)}
  `),

  carreta: svg('cr', { hi: '#cbd5e1', mid: '#64748b', lo: '#334155' }, `
    ${ground()}
    <path d="M4 35V16c0-2.4 1.9-4.4 4.3-4.4h14l5 8.5V35H4z" fill="#1e293b"/>
    <rect x="7.5" y="16.5" width="12" height="9" rx="1.3" fill="url(#cr-glass)"/>
    <path d="M7.5 16.5h12v2.5H7.5z" fill="#fff" opacity=".35"/>
    <rect x="30" y="11" width="84" height="24" rx="2.2" fill="url(#cr-body)"/>
    <path d="M30 11h84v4H30z" fill="#fff" opacity=".16"/>
    <rect x="25" y="27" width="6" height="5" rx=".6" fill="#64748b"/>
    ${headlight(5.5, 28)}
    ${wheel('cr', 15, 36, 5.6)}${wheel('cr', 48, 36, 5.6)}${wheel('cr', 98, 36, 5.6)}
  `),

  carreta_ls: svg('ls', { hi: '#5eead4', mid: '#14b8a6', lo: '#0f766e' }, `
    ${ground()}
    <path d="M3 35V16.5c0-2.2 1.7-4 3.9-4h13l4.5 8V35H3z" fill="#115e59"/>
    <rect x="6.5" y="17" width="11" height="8.5" rx="1.2" fill="url(#ls-glass)"/>
    <path d="M6.5 17h11v2.4H6.5z" fill="#fff" opacity=".35"/>
    <rect x="27" y="11.5" width="89" height="23.5" rx="2.2" fill="url(#ls-body)"/>
    <path d="M27 11.5h89v4H27z" fill="#fff" opacity=".16"/>
    <rect x="22.5" y="27" width="5.5" height="4.5" rx=".5" fill="#2dd4bf"/>
    ${headlight(4.5, 28)}
    ${wheel('ls', 13, 36, 5.4)}${wheel('ls', 44, 36, 5.4)}${wheel('ls', 72, 36, 5.4)}${wheel('ls', 100, 36, 5.4)}
  `),

  vanderleia: svg('vd', { hi: '#fdba74', mid: '#ea580c', lo: '#7c2d12' }, `
    ${ground()}
    <path d="M4 35V16c0-2.4 1.9-4.4 4.3-4.4h14l5 8.5V35H4z" fill="#7c2d12"/>
    <rect x="7.5" y="16.5" width="12" height="9" rx="1.3" fill="url(#vd-glass)"/>
    <rect x="30" y="11" width="84" height="24" rx="2.2" fill="url(#vd-body)"/>
    <path d="M30 11h84v4H30z" fill="#fff" opacity=".12"/>
    <rect x="25" y="27" width="6" height="5" rx=".6" fill="#c2410c"/>
    ${headlight(5.5, 28)}
    ${wheel('vd', 15, 36, 5.5)}${wheel('vd', 42, 36, 5.5)}${wheel('vd', 102, 36, 5.5)}
    <path d="M55 37.5h38" stroke="#fdba74" stroke-width="1.5" stroke-dasharray="5 3" opacity=".65"/>
  `),

  bitrem: svg('br', { hi: '#60a5fa', mid: '#2563eb', lo: '#1e3a8a' }, `
    ${ground()}
    <path d="M2 35V17c0-2 1.6-3.6 3.6-3.6h11L20 20v15H2z" fill="#172554"/>
    <rect x="5" y="17.5" width="10" height="8" rx="1.1" fill="url(#br-glass)"/>
    <rect x="23" y="11" width="40" height="24" rx="2" fill="url(#br-body)"/>
    <rect x="67" y="11" width="49" height="24" rx="2" fill="#1d4ed8"/>
    <path d="M23 11h40v3.5H23z" fill="#fff" opacity=".14"/>
    <path d="M67 11h49v3.5H67z" fill="#fff" opacity=".14"/>
    <rect x="20" y="28" width="4" height="4" rx=".4" fill="#3b82f6"/>
    <rect x="63.5" y="28" width="4" height="4" rx=".4" fill="#3b82f6"/>
    ${headlight(3.5, 28)}
    ${wheel('br', 11, 36, 5.2)}${wheel('br', 40, 36, 5.2)}${wheel('br', 82, 36, 5.2)}${wheel('br', 104, 36, 5.2)}
  `),

  rodotrem: svg('rd', { hi: '#a5b4fc', mid: '#6366f1', lo: '#3730a3' }, `
    ${ground()}
    <path d="M1 35V17.5c0-1.8 1.4-3.2 3.2-3.2h9L16 20.5V35H1z" fill="#1e1b4b"/>
    <rect x="3.8" y="18" width="8.5" height="7.5" rx="1" fill="url(#rd-glass)"/>
    <rect x="18" y="11.5" width="28" height="23.5" rx="1.8" fill="url(#rd-body)"/>
    <rect x="49" y="11.5" width="30" height="23.5" rx="1.8" fill="#4f46e5"/>
    <rect x="82" y="11.5" width="36" height="23.5" rx="1.8" fill="#6366f1"/>
    <rect x="16" y="28.5" width="3" height="3.5" rx=".3" fill="#818cf8"/>
    <rect x="46.5" y="28.5" width="3" height="3.5" rx=".3" fill="#818cf8"/>
    <rect x="79.5" y="28.5" width="3" height="3.5" rx=".3" fill="#818cf8"/>
    ${headlight(2.5, 28)}
    ${wheel('rd', 9, 36, 5)}${wheel('rd', 30, 36, 5)}${wheel('rd', 62, 36, 5)}${wheel('rd', 98, 36, 5)}
  `),

  outros: svg('ot', { hi: '#cbd5e1', mid: '#64748b', lo: '#334155' }, `
    ${ground()}
    <rect x="28" y="11" width="82" height="24" rx="2.5" fill="url(#ot-body)"/>
    <path d="M8 35V15.5c0-2.4 1.9-4.4 4.3-4.4H28V35H8z" fill="#1e293b"/>
    <rect x="11.5" y="16" width="12" height="9" rx="1.3" fill="url(#ot-glass)"/>
    ${headlight(9, 28)}
    ${wheel('ot', 20)}${wheel('ot', 90)}
  `),
}

export function frotaIconeHtml(grupo: FrotaIconeGrupo, className = 'frota-veiculo-ico'): string {
  return `<span class="${className}" data-grupo="${grupo}">${(SVG[grupo] ?? SVG.outros).trim()}</span>`
}

export function frotaIconeSvgRaw(grupo: FrotaIconeGrupo): string {
  return (SVG[grupo] ?? SVG.outros).trim()
}
