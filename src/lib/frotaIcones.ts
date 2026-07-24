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
 * Ícones flat, traço único — silhueta lateral reconhecível por tipo.
 * viewBox 64×32, rodas e cabine padronizadas.
 */
function svg(body: string): string {
  return `<svg viewBox="0 0 64 32" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true">${body}</svg>`
}

function wheel(cx: number, cy = 24, r = 3.2): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#0f172a"/><circle cx="${cx}" cy="${cy}" r="${r * 0.38}" fill="#e2e8f0"/>`
}

function wheels(...xs: number[]): string {
  return xs.map((x) => wheel(x)).join('')
}

const SVG: Record<FrotaIconeGrupo, string> = {
  // Carro passeio — perfil curto
  passeio: svg(`
    <path d="M10 22h44c0-1.5-.5-3-2-4.5L48 12c-1.2-2-3-3-5.5-3H22c-2.5 0-4.2 1-5.5 3l-4 5.5C11 19 10.5 20.5 10 22z" fill="#3b82f6"/>
    <path d="M22 11.5h16l3 6.5H19l3-6.5z" fill="#bfdbfe"/>
    <path d="M14 22h36" stroke="#1e40af" stroke-width="1" opacity=".35"/>
    ${wheels(18, 46)}
  `),

  // Utilitário — SUV mais alto
  utilitario: svg(`
    <path d="M9 22h46V13c0-2.5-1.8-4.5-4.5-4.5H18C13.5 8.5 11 11 11 14v8z" fill="#0d9488"/>
    <path d="M18 10h20l2.5 7H15.5L18 10z" fill="#99f6e4"/>
    <rect x="48" y="13" width="5" height="6" rx="1" fill="#115e59"/>
    ${wheels(17, 47)}
  `),

  // Fiorino — cabine + caçamba
  fiorino: svg(`
    <path d="M8 22h18V12.5c0-2 1.5-3.5 3.5-3.5h6L39 14v8H8z" fill="#f97316"/>
    <rect x="38" y="14.5" width="18" height="7.5" rx="1.2" fill="#ea580c"/>
    <path d="M16 11.5h9l1.5 5H14.5l1.5-5z" fill="#ffedd5"/>
    ${wheels(16, 48)}
  `),

  // Van / furgão — caixa alta contínua
  van: svg(`
    <rect x="8" y="8" width="40" height="14" rx="2.5" fill="#6366f1"/>
    <path d="M48 12h8v10h-8z" fill="#4f46e5"/>
    <rect x="11" y="10.5" width="10" height="6" rx="1" fill="#c7d2fe"/>
    <path d="M24 10.5h20" stroke="#4338ca" stroke-width="1.2" opacity=".4"/>
    ${wheels(17, 46)}
  `),

  // VUC — baú urbano compacto + cabine curta
  vuc: svg(`
    <rect x="20" y="8" width="36" height="14" rx="2" fill="#0284c7"/>
    <path d="M7 22V12c0-1.8 1.4-3 3.2-3H20v13H7z" fill="#0369a1"/>
    <rect x="9" y="11.5" width="7.5" height="5.5" rx="1" fill="#bae6fd"/>
    ${wheels(14, 46)}
  `),

  // HR — cabine avançada + baú curto
  hr: svg(`
    <rect x="22" y="9.5" width="34" height="12.5" rx="1.8" fill="#ca8a04"/>
    <path d="M7 22V11.5C7 9.8 8.4 8.5 10.2 8.5H22V22H7z" fill="#a16207"/>
    <rect x="9" y="11" width="8" height="6" rx="1" fill="#fef08a"/>
    <path d="M28 11.5v8M36 11.5v8M44 11.5v8" stroke="#854d0e" stroke-width="1" opacity=".45"/>
    ${wheels(14, 47)}
  `),

  // 3/4 leve — baú médio, cabine standard
  leve: svg(`
    <rect x="21" y="7.5" width="36" height="14.5" rx="2" fill="#eab308"/>
    <path d="M7 22V11c0-1.8 1.5-3 3.5-3H21v14H7z" fill="#f59e0b"/>
    <rect x="9" y="11" width="8" height="6" rx="1" fill="#fef3c7"/>
    ${wheels(14, 47)}
  `),

  // Toco — rígido 2 eixos, baú longo
  toco: svg(`
    <rect x="20" y="7" width="38" height="15" rx="2" fill="#16a34a"/>
    <path d="M6 22V10.5C6 8.8 7.5 7.5 9.5 7.5H20V22H6z" fill="#15803d"/>
    <rect x="8" y="10.5" width="8.5" height="6" rx="1" fill="#bbf7d0"/>
    ${wheels(13, 48)}
  `),

  // Truck — 3 eixos (duplo traseiro)
  truck: svg(`
    <rect x="19" y="6.5" width="40" height="15.5" rx="2" fill="#2563eb"/>
    <path d="M5 22V10C5 8.2 6.6 7 8.8 7H19v15H5z" fill="#1d4ed8"/>
    <rect x="7" y="10" width="8.5" height="6" rx="1" fill="#bfdbfe"/>
    ${wheels(12, 42, 51)}
  `),

  // Bitruck — 4 eixos
  bitruck: svg(`
    <rect x="18" y="6.5" width="42" height="15.5" rx="2" fill="#b45309"/>
    <path d="M4 22V10C4 8.2 5.6 7 7.8 7H18v15H4z" fill="#92400e"/>
    <rect x="6" y="10" width="8.5" height="6" rx="1" fill="#fde68a"/>
    ${wheels(11, 34, 43, 52)}
  `),

  // Carreta — cavalo + 1 semi
  carreta: svg(`
    <path d="M3 22V11.5C3 9.8 4.3 8.5 6.2 8.5h8.5L17 13v9H3z" fill="#334155"/>
    <rect x="4.5" y="11.5" width="7" height="5" rx="0.8" fill="#94a3b8"/>
    <rect x="20" y="8" width="41" height="14" rx="1.8" fill="#475569"/>
    <rect x="17" y="17" width="4" height="3" rx="0.4" fill="#64748b"/>
    ${wheels(9, 30, 52)}
  `),

  // Carreta LS — semi alongado + 3 eixos no reboque
  carreta_ls: svg(`
    <path d="M3 22V12C3 10.4 4.2 9.2 5.8 9.2h7.5L15.5 13.5V22H3z" fill="#0f766e"/>
    <rect x="4.3" y="12" width="6.5" height="4.5" rx="0.7" fill="#5eead4"/>
    <rect x="18" y="8.5" width="44" height="13.5" rx="1.6" fill="#0d9488"/>
    <rect x="15.5" y="17" width="3.5" height="2.8" rx="0.3" fill="#14b8a6"/>
    ${wheels(8.5, 28, 40, 54)}
  `),

  // Vanderleia — eixos bem espaçados no semi
  vanderleia: svg(`
    <path d="M3 22V11.5C3 9.9 4.3 8.6 6.1 8.6h8L16.5 13V22H3z" fill="#9a3412"/>
    <rect x="4.5" y="11.5" width="7" height="5" rx="0.8" fill="#fdba74"/>
    <rect x="19.5" y="8" width="41.5" height="14" rx="1.8" fill="#c2410c"/>
    <rect x="16.5" y="17" width="4" height="3" rx="0.3" fill="#ea580c"/>
    ${wheels(9, 26, 54)}
    <path d="M30 24h18" stroke="#fb923c" stroke-width="1.4" stroke-dasharray="3 2" opacity=".85"/>
  `),

  // Bitrem — cavalo + 2 reboques
  bitrem: svg(`
    <path d="M2 22V12C2 10.5 3.1 9.4 4.7 9.4h6.5L13 13.2V22H2z" fill="#1e3a8a"/>
    <rect x="3.3" y="12" width="5.8" height="4.2" rx="0.6" fill="#93c5fd"/>
    <rect x="15" y="8.5" width="20" height="13.5" rx="1.5" fill="#1d4ed8"/>
    <rect x="37" y="8.5" width="25" height="13.5" rx="1.5" fill="#2563eb"/>
    <rect x="13.5" y="17.5" width="2.2" height="2.2" rx="0.3" fill="#3b82f6"/>
    <rect x="35" y="17.5" width="2.2" height="2.2" rx="0.3" fill="#3b82f6"/>
    ${wheels(7, 24, 44, 56)}
  `),

  // Rodotrem — 3 módulos (composição longa)
  rodotrem: svg(`
    <path d="M1.5 22V12.2C1.5 10.8 2.5 9.8 3.9 9.8h5.5L11 13V22H1.5z" fill="#312e81"/>
    <rect x="2.6" y="12.2" width="5" height="4" rx="0.5" fill="#a5b4fc"/>
    <rect x="12.5" y="9" width="14" height="13" rx="1.3" fill="#3730a3"/>
    <rect x="28" y="9" width="15" height="13" rx="1.3" fill="#4338ca"/>
    <rect x="44.5" y="9" width="18" height="13" rx="1.3" fill="#4f46e5"/>
    <rect x="11.2" y="17.5" width="1.8" height="2" rx="0.2" fill="#6366f1"/>
    <rect x="26.5" y="17.5" width="1.8" height="2" rx="0.2" fill="#6366f1"/>
    <rect x="43" y="17.5" width="1.8" height="2" rx="0.2" fill="#6366f1"/>
    ${wheels(6, 18, 35, 52)}
  `),

  outros: svg(`
    <rect x="16" y="9" width="40" height="13" rx="2" fill="#64748b"/>
    <path d="M6 22V12c0-1.5 1.2-2.5 2.8-2.5H16V22H6z" fill="#475569"/>
    <rect x="7.5" y="12" width="6" height="5" rx="0.8" fill="#cbd5e1"/>
    ${wheels(13, 46)}
  `),
}

/** HTML do ícone (Leaflet / innerHTML). */
export function frotaIconeHtml(grupo: FrotaIconeGrupo, className = 'frota-veiculo-ico'): string {
  const inner = (SVG[grupo] ?? SVG.outros).trim()
  return `<span class="${className}" data-grupo="${grupo}">${inner}</span>`
}

export function frotaIconeSvgRaw(grupo: FrotaIconeGrupo): string {
  return (SVG[grupo] ?? SVG.outros).trim()
}
