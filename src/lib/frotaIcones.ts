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

/**
 * Estilo ilustração flat (referência): perfil lateral, vidros claros,
 * rodas com pneu + calota, cabine e baú bem definidos.
 */
function svg(inner: string): string {
  return `<svg viewBox="0 0 96 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`
}

function wheel(cx: number, cy = 31, r = 5): string {
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#1e293b"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 1.6}" fill="#64748b"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 3.1}" fill="#e2e8f0"/>
    <circle cx="${cx}" cy="${cy}" r="1.1" fill="#94a3b8"/>
  `
}

const SVG: Record<FrotaIconeGrupo, string> = {
  // Sedã / passeio — prata azulado
  passeio: svg(`
    <ellipse cx="48" cy="34" rx="38" ry="2.2" fill="#cbd5e1" opacity=".45"/>
    <path d="M12 28c1-6 4-10 10-12h8c3-4 8-6 14-6s11 2 14 6h10c5 1 8 5 9 12H12z" fill="#94a3b8"/>
    <path d="M32 12c4-3 8-4 14-4 6 0 10 1 14 4l-2 8H34l-2-8z" fill="#e2e8f0"/>
    <path d="M34 12.5l1.5 7.5h10V12c-4-.3-8 0-11.5.5z" fill="#f8fafc" opacity=".9"/>
    <path d="M48 12v8h12.5l1.5-7.5C58 12 53 11.7 48 12z" fill="#f1f5f9"/>
    <rect x="14" y="22" width="5" height="3" rx="1" fill="#fbbf24"/>
    <rect x="77" y="22" width="4" height="3" rx="1" fill="#ef4444" opacity=".85"/>
    ${wheel(28)}${wheel(68)}
  `),

  // Utilitário / SUV — amarelo ouro (como hatch da referência)
  utilitario: svg(`
    <ellipse cx="48" cy="34" rx="38" ry="2.2" fill="#cbd5e1" opacity=".45"/>
    <path d="M11 29c1-7 4-12 11-14h9c2-3 7-5 14-5s12 2 14 5h12c6 1 9 6 10 14H11z" fill="#eab308"/>
    <path d="M33 12c4-2.5 8-3.5 13-3.5s9 1 13 3.5l-1.5 9H34.5L33 12z" fill="#fef9c3"/>
    <path d="M35 12.5l1 8.5h10V12.2c-3.5-.2-7 0-11 .3z" fill="#fffbeb"/>
    <path d="M48 12.2V21h11l1-8.5C56 12.2 52 12 48 12.2z" fill="#fef08a"/>
    <rect x="78" y="18" width="6" height="7" rx="1" fill="#ca8a04"/>
    <rect x="13" y="23" width="5" height="3" rx="1" fill="#fde68a"/>
    ${wheel(27)}${wheel(69)}
  `),

  // Fiorino / pickup — cinza claro + caçamba
  fiorino: svg(`
    <ellipse cx="48" cy="34" rx="40" ry="2.2" fill="#cbd5e1" opacity=".45"/>
    <path d="M10 29c1-6 3-11 9-13h10c2-3 5-5 10-5h4l6 8v10H10z" fill="#64748b"/>
    <path d="M31 13c3-2 6-3 10-3h3l4 7H32l-1-4z" fill="#e2e8f0"/>
    <rect x="48" y="18" width="38" height="11" rx="1.5" fill="#94a3b8"/>
    <path d="M48 18h38v2.5H48z" fill="#64748b" opacity=".35"/>
    <rect x="12" y="23" width="5" height="3" rx="1" fill="#fbbf24"/>
    ${wheel(26)}${wheel(72)}
  `),

  // Van / furgão — roxo/azul escuro caixa alta
  van: svg(`
    <ellipse cx="48" cy="34" rx="40" ry="2.2" fill="#cbd5e1" opacity=".45"/>
    <rect x="10" y="10" width="62" height="19" rx="3" fill="#4f46e5"/>
    <path d="M72 14h14v15H72z" fill="#3730a3"/>
    <rect x="14" y="13" width="16" height="9" rx="1.5" fill="#c7d2fe"/>
    <path d="M14 13h16v3H14z" fill="#e0e7ff" opacity=".7"/>
    <path d="M34 13h34" stroke="#312e81" stroke-width="1.5" opacity=".35"/>
    <rect x="12" y="24" width="5" height="3" rx="1" fill="#fbbf24"/>
    ${wheel(26)}${wheel(68)}
  `),

  // VUC — baú azul + cabine
  vuc: svg(`
    <ellipse cx="50" cy="34" rx="40" ry="2.2" fill="#cbd5e1" opacity=".45"/>
    <rect x="28" y="9" width="58" height="20" rx="2.5" fill="#0ea5e9"/>
    <path d="M8 29V14c0-2.5 2-4.5 4.5-4.5H28V29H8z" fill="#0284c7"/>
    <rect x="11" y="14" width="12" height="9" rx="1.5" fill="#e0f2fe"/>
    <path d="M11 14h12v3H11z" fill="#f0f9ff" opacity=".8"/>
    <rect x="10" y="24" width="5" height="3" rx="1" fill="#fbbf24"/>
    <path d="M40 12v14M52 12v14M64 12v14" stroke="#0369a1" stroke-width="1.2" opacity=".3"/>
    ${wheel(20)}${wheel(70)}
  `),

  // HR — cabine avançada + baú amarelo (como truck da referência)
  hr: svg(`
    <ellipse cx="50" cy="34" rx="40" ry="2.2" fill="#cbd5e1" opacity=".45"/>
    <rect x="30" y="11" width="56" height="18" rx="2" fill="#facc15"/>
    <path d="M8 29V13.5C8 11 10 9 13 9h17v20H8z" fill="#64748b"/>
    <rect x="11" y="13" width="13" height="9" rx="1.5" fill="#e2e8f0"/>
    <path d="M11 13h13v2.5H11z" fill="#f8fafc"/>
    <rect x="10" y="24" width="5" height="3" rx="1" fill="#fbbf24"/>
    <path d="M42 14v12M54 14v12M66 14v12" stroke="#ca8a04" stroke-width="1.2" opacity=".35"/>
    ${wheel(20)}${wheel(72)}
  `),

  // 3/4 leve — cabine laranja + baú
  leve: svg(`
    <ellipse cx="50" cy="34" rx="40" ry="2.2" fill="#cbd5e1" opacity=".45"/>
    <rect x="30" y="9" width="56" height="20" rx="2.5" fill="#fb923c"/>
    <path d="M8 29V13c0-2.5 2-4.5 4.8-4.5H30V29H8z" fill="#ea580c"/>
    <rect x="11" y="13.5" width="13" height="9" rx="1.5" fill="#ffedd5"/>
    <path d="M11 13.5h13v2.5H11z" fill="#fff7ed"/>
    <rect x="10" y="24" width="5" height="3" rx="1" fill="#fde68a"/>
    ${wheel(20)}${wheel(72)}
  `),

  // Toco — baú verde longo
  toco: svg(`
    <ellipse cx="50" cy="34" rx="42" ry="2.2" fill="#cbd5e1" opacity=".45"/>
    <rect x="28" y="8" width="60" height="21" rx="2.5" fill="#22c55e"/>
    <path d="M7 29V12.5C7 10 9.2 8 12 8h16v21H7z" fill="#15803d"/>
    <rect x="10" y="13" width="13" height="9" rx="1.5" fill="#bbf7d0"/>
    <path d="M10 13h13v2.5H10z" fill="#dcfce7"/>
    <rect x="9" y="24" width="5" height="3" rx="1" fill="#fbbf24"/>
    ${wheel(19)}${wheel(74)}
  `),

  // Truck — 3 eixos, azul
  truck: svg(`
    <ellipse cx="50" cy="34" rx="42" ry="2.2" fill="#cbd5e1" opacity=".45"/>
    <rect x="26" y="7.5" width="64" height="21.5" rx="2.5" fill="#3b82f6"/>
    <path d="M6 29V12C6 9.5 8.2 7.5 11 7.5h15V29H6z" fill="#1d4ed8"/>
    <rect x="9" y="12.5" width="13" height="9" rx="1.5" fill="#bfdbfe"/>
    <path d="M9 12.5h13v2.5H9z" fill="#eff6ff"/>
    <rect x="8" y="24" width="5" height="3" rx="1" fill="#fbbf24"/>
    ${wheel(18)}${wheel(62)}${wheel(76)}
  `),

  // Bitruck — 4 eixos, marrom/laranja cabine
  bitruck: svg(`
    <ellipse cx="50" cy="34" rx="42" ry="2.2" fill="#cbd5e1" opacity=".45"/>
    <rect x="24" y="7.5" width="66" height="21.5" rx="2.5" fill="#d97706"/>
    <path d="M5 29V12C5 9.5 7.2 7.5 10 7.5h14V29H5z" fill="#b45309"/>
    <rect x="8" y="12.5" width="12" height="9" rx="1.5" fill="#fde68a"/>
    <path d="M8 12.5h12v2.5H8z" fill="#fef3c7"/>
    <rect x="7" y="24" width="5" height="3" rx="1" fill="#fbbf24"/>
    ${wheel(16)}${wheel(48)}${wheel(64)}${wheel(80)}
  `),

  // Carreta — cavalo + semi cinza
  carreta: svg(`
    <ellipse cx="52" cy="34" rx="42" ry="2.2" fill="#cbd5e1" opacity=".45"/>
    <path d="M4 29V14c0-2.2 1.8-4 4-4h12l4 7v12H4z" fill="#475569"/>
    <rect x="7" y="14.5" width="10" height="7.5" rx="1.2" fill="#cbd5e1"/>
    <path d="M7 14.5h10v2H7z" fill="#e2e8f0"/>
    <rect x="26" y="10" width="66" height="19" rx="2" fill="#64748b"/>
    <rect x="22" y="23" width="5" height="4" rx="0.6" fill="#94a3b8"/>
    <rect x="6" y="24" width="4.5" height="2.5" rx="0.8" fill="#fbbf24"/>
    ${wheel(14)}${wheel(42)}${wheel(78)}
  `),

  // Carreta LS — semi mais longo, teal
  carreta_ls: svg(`
    <ellipse cx="52" cy="34" rx="42" ry="2.2" fill="#cbd5e1" opacity=".45"/>
    <path d="M4 29V14.5c0-2 1.6-3.5 3.6-3.5h11l3.5 6.5V29H4z" fill="#0f766e"/>
    <rect x="6.5" y="15" width="9.5" height="7" rx="1.1" fill="#99f6e4"/>
    <rect x="24" y="10.5" width="70" height="18.5" rx="2" fill="#14b8a6"/>
    <rect x="20.5" y="23" width="4.5" height="3.5" rx="0.5" fill="#2dd4bf"/>
    <rect x="5.5" y="24" width="4.5" height="2.5" rx="0.8" fill="#fbbf24"/>
    ${wheel(13)}${wheel(40)}${wheel(60)}${wheel(82)}
  `),

  // Vanderleia — eixos espaçados
  vanderleia: svg(`
    <ellipse cx="52" cy="34" rx="42" ry="2.2" fill="#cbd5e1" opacity=".45"/>
    <path d="M4 29V14c0-2.2 1.8-4 4-4h12l4 7v12H4z" fill="#9a3412"/>
    <rect x="7" y="14.5" width="10" height="7.5" rx="1.2" fill="#fed7aa"/>
    <rect x="26" y="10" width="66" height="19" rx="2" fill="#c2410c"/>
    <rect x="22" y="23" width="5" height="4" rx="0.6" fill="#ea580c"/>
    <rect x="6" y="24" width="4.5" height="2.5" rx="0.8" fill="#fbbf24"/>
    ${wheel(14)}${wheel(38)}${wheel(82)}
    <path d="M48 32h26" stroke="#fb923c" stroke-width="1.6" stroke-dasharray="4 3" opacity=".7"/>
  `),

  // Bitrem — 2 reboques
  bitrem: svg(`
    <ellipse cx="52" cy="34" rx="44" ry="2.2" fill="#cbd5e1" opacity=".45"/>
    <path d="M3 29V15c0-1.8 1.5-3.2 3.4-3.2h9.5L18 17v12H3z" fill="#1e3a8a"/>
    <rect x="5.5" y="15.5" width="8.5" height="6.5" rx="1" fill="#93c5fd"/>
    <rect x="21" y="10" width="32" height="19" rx="2" fill="#1d4ed8"/>
    <rect x="56" y="10" width="38" height="19" rx="2" fill="#2563eb"/>
    <rect x="18.5" y="23.5" width="3.5" height="3" rx="0.4" fill="#3b82f6"/>
    <rect x="53" y="23.5" width="3.5" height="3" rx="0.4" fill="#3b82f6"/>
    <rect x="4.5" y="24" width="4" height="2.5" rx="0.7" fill="#fbbf24"/>
    ${wheel(11)}${wheel(34)}${wheel(68)}${wheel(86)}
  `),

  // Rodotrem — 3 módulos
  rodotrem: svg(`
    <ellipse cx="52" cy="34" rx="44" ry="2.2" fill="#cbd5e1" opacity=".45"/>
    <path d="M2 29V15.5c0-1.6 1.3-2.9 3-2.9h8L14.5 17V29H2z" fill="#312e81"/>
    <rect x="4.2" y="16" width="7.5" height="6" rx="0.9" fill="#a5b4fc"/>
    <rect x="17" y="10.5" width="22" height="18.5" rx="1.8" fill="#3730a3"/>
    <rect x="41" y="10.5" width="24" height="18.5" rx="1.8" fill="#4338ca"/>
    <rect x="67" y="10.5" width="27" height="18.5" rx="1.8" fill="#4f46e5"/>
    <rect x="15.2" y="23.5" width="2.5" height="2.5" rx="0.3" fill="#6366f1"/>
    <rect x="39" y="23.5" width="2.5" height="2.5" rx="0.3" fill="#6366f1"/>
    <rect x="65.2" y="23.5" width="2.5" height="2.5" rx="0.3" fill="#6366f1"/>
    <rect x="3.5" y="24" width="3.5" height="2.3" rx="0.6" fill="#fbbf24"/>
    ${wheel(9)}${wheel(26)}${wheel(52)}${wheel(80)}
  `),

  outros: svg(`
    <ellipse cx="48" cy="34" rx="38" ry="2.2" fill="#cbd5e1" opacity=".45"/>
    <rect x="24" y="10" width="62" height="19" rx="2.5" fill="#64748b"/>
    <path d="M8 29V14c0-2.2 1.8-4 4-4h12v19H8z" fill="#475569"/>
    <rect x="11" y="14.5" width="10" height="8" rx="1.2" fill="#cbd5e1"/>
    ${wheel(18)}${wheel(70)}
  `),
}

export function frotaIconeHtml(grupo: FrotaIconeGrupo, className = 'frota-veiculo-ico'): string {
  return `<span class="${className}" data-grupo="${grupo}">${(SVG[grupo] ?? SVG.outros).trim()}</span>`
}

export function frotaIconeSvgRaw(grupo: FrotaIconeGrupo): string {
  return (SVG[grupo] ?? SVG.outros).trim()
}
