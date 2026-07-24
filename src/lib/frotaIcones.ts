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

/** Ícones SVG laterais — cada tipo com silhueta distinta (não emoji genérico). */
const SVG: Record<FrotaIconeGrupo, string> = {
  // Carro curto
  passeio: `
    <svg viewBox="0 0 48 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M8 18h32l-2-6c-1-3-3-5-7-5H17c-4 0-6 2-7 5l-2 6z" fill="#2563eb"/>
      <path d="M16 12h8l2 4H14l2-4z" fill="#93c5fd"/>
      <circle cx="14" cy="20" r="3.2" fill="#0f172a"/><circle cx="34" cy="20" r="3.2" fill="#0f172a"/>
      <circle cx="14" cy="20" r="1.2" fill="#94a3b8"/><circle cx="34" cy="20" r="1.2" fill="#94a3b8"/>
    </svg>`,
  // SUV mais alto
  utilitario: `
    <svg viewBox="0 0 48 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M7 19h34v-7c0-3-2-5-6-5H16c-5 0-7 3-7 6v6z" fill="#0d9488"/>
      <path d="M15 10h14l1.5 5H13.5L15 10z" fill="#99f6e4"/>
      <rect x="36" y="12" width="4" height="5" rx="0.5" fill="#115e59"/>
      <circle cx="14" cy="21" r="3.2" fill="#0f172a"/><circle cx="34" cy="21" r="3.2" fill="#0f172a"/>
      <circle cx="14" cy="21" r="1.2" fill="#94a3b8"/><circle cx="34" cy="21" r="1.2" fill="#94a3b8"/>
    </svg>`,
  // Pickup / Fiorino — cabine + caçamba
  fiorino: `
    <svg viewBox="0 0 48 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M6 19h14V11c0-2 1.5-3.5 4-3.5h4l3 4.5V19H6z" fill="#ea580c"/>
      <rect x="24" y="13" width="18" height="6" rx="1" fill="#c2410c"/>
      <path d="M12 11h6l1 4h-8l1-4z" fill="#fdba74"/>
      <circle cx="12" cy="21" r="3" fill="#0f172a"/><circle cx="36" cy="21" r="3" fill="#0f172a"/>
      <circle cx="12" cy="21" r="1.1" fill="#94a3b8"/><circle cx="36" cy="21" r="1.1" fill="#94a3b8"/>
    </svg>`,
  // Van / furgão — caixa alta
  van: `
    <svg viewBox="0 0 48 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="6" y="8" width="30" height="12" rx="2" fill="#7c3aed"/>
      <path d="M36 12h6v8h-6z" fill="#5b21b6"/>
      <rect x="8" y="10" width="8" height="5" rx="0.5" fill="#ddd6fe"/>
      <circle cx="14" cy="22" r="3" fill="#0f172a"/><circle cx="34" cy="22" r="3" fill="#0f172a"/>
      <circle cx="14" cy="22" r="1.1" fill="#94a3b8"/><circle cx="34" cy="22" r="1.1" fill="#94a3b8"/>
    </svg>`,
  // VUC — baú urbano curto
  vuc: `
    <svg viewBox="0 0 48 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="14" y="7" width="28" height="13" rx="1.5" fill="#0284c7"/>
      <path d="M6 20V11c0-1.5 1-2.5 2.5-2.5H14v11.5H6z" fill="#0369a1"/>
      <rect x="7.5" y="11" width="5" height="4" rx="0.4" fill="#bae6fd"/>
      <circle cx="12" cy="22" r="3" fill="#0f172a"/><circle cx="34" cy="22" r="3" fill="#0f172a"/>
      <circle cx="12" cy="22" r="1.1" fill="#94a3b8"/><circle cx="34" cy="22" r="1.1" fill="#94a3b8"/>
    </svg>`,
  // HR — cabine avançada + baú baixo
  hr: `
    <svg viewBox="0 0 48 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="16" y="9" width="26" height="11" rx="1" fill="#ca8a04"/>
      <path d="M5 20V10.5C5 9 6.2 8 8 8h8v12H5z" fill="#a16207"/>
      <rect x="6.5" y="10" width="6" height="5" rx="0.4" fill="#fef08a"/>
      <line x1="22" y1="11" x2="22" y2="18" stroke="#854d0e" stroke-width="1"/>
      <line x1="30" y1="11" x2="30" y2="18" stroke="#854d0e" stroke-width="1"/>
      <circle cx="11" cy="22" r="3" fill="#0f172a"/><circle cx="35" cy="22" r="3" fill="#0f172a"/>
      <circle cx="11" cy="22" r="1.1" fill="#94a3b8"/><circle cx="35" cy="22" r="1.1" fill="#94a3b8"/>
    </svg>`,
  // 3/4 leve — caminhão leve baú
  leve: `
    <svg viewBox="0 0 48 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="15" y="7" width="27" height="13" rx="1.5" fill="#eab308"/>
      <path d="M5 20V10c0-1.5 1.2-2.5 3-2.5h7V20H5z" fill="#f97316"/>
      <rect x="6.5" y="10.5" width="5.5" height="4.5" rx="0.4" fill="#ffedd5"/>
      <circle cx="11" cy="22" r="3" fill="#0f172a"/><circle cx="34" cy="22" r="3" fill="#0f172a"/>
      <circle cx="11" cy="22" r="1.1" fill="#94a3b8"/><circle cx="34" cy="22" r="1.1" fill="#94a3b8"/>
    </svg>`,
  // Toco — rígido 2 eixos, baú médio
  toco: `
    <svg viewBox="0 0 48 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="14" y="6" width="30" height="14" rx="1.5" fill="#16a34a"/>
      <path d="M4 20V9.5C4 8 5.5 7 7.5 7H14v13H4z" fill="#15803d"/>
      <rect x="5.5" y="9.5" width="6" height="5" rx="0.4" fill="#bbf7d0"/>
      <circle cx="10" cy="22" r="3.1" fill="#0f172a"/><circle cx="36" cy="22" r="3.1" fill="#0f172a"/>
      <circle cx="10" cy="22" r="1.1" fill="#94a3b8"/><circle cx="36" cy="22" r="1.1" fill="#94a3b8"/>
    </svg>`,
  // Truck — 3 eixos (eixo duplo traseiro)
  truck: `
    <svg viewBox="0 0 48 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="13" y="6" width="31" height="14" rx="1.5" fill="#1d4ed8"/>
      <path d="M3 20V9C3 7.5 4.5 6.5 6.5 6.5H13V20H3z" fill="#1e40af"/>
      <rect x="4.5" y="9" width="6" height="5" rx="0.4" fill="#bfdbfe"/>
      <circle cx="9" cy="22" r="2.8" fill="#0f172a"/>
      <circle cx="32" cy="22" r="2.8" fill="#0f172a"/>
      <circle cx="39" cy="22" r="2.8" fill="#0f172a"/>
      <circle cx="9" cy="22" r="1" fill="#94a3b8"/>
      <circle cx="32" cy="22" r="1" fill="#94a3b8"/>
      <circle cx="39" cy="22" r="1" fill="#94a3b8"/>
    </svg>`,
  // Bitruck — 4 eixos
  bitruck: `
    <svg viewBox="0 0 48 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="12" y="6" width="33" height="14" rx="1.5" fill="#b45309"/>
      <path d="M2 20V9C2 7.5 3.5 6.5 5.5 6.5H12V20H2z" fill="#92400e"/>
      <rect x="3.5" y="9" width="6" height="5" rx="0.4" fill="#fde68a"/>
      <circle cx="8" cy="22" r="2.5" fill="#0f172a"/>
      <circle cx="27" cy="22" r="2.5" fill="#0f172a"/>
      <circle cx="34" cy="22" r="2.5" fill="#0f172a"/>
      <circle cx="41" cy="22" r="2.5" fill="#0f172a"/>
      <circle cx="8" cy="22" r="0.9" fill="#94a3b8"/>
      <circle cx="27" cy="22" r="0.9" fill="#94a3b8"/>
      <circle cx="34" cy="22" r="0.9" fill="#94a3b8"/>
      <circle cx="41" cy="22" r="0.9" fill="#94a3b8"/>
    </svg>`,
  // Carreta — cavalo + semi
  carreta: `
    <svg viewBox="0 0 48 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2 19V10c0-1.5 1-2.5 2.5-2.5H10l2 4v7.5H2z" fill="#334155"/>
      <rect x="3.2" y="10.5" width="5" height="4" rx="0.3" fill="#94a3b8"/>
      <rect x="15" y="8" width="31" height="11" rx="1" fill="#475569"/>
      <rect x="12" y="16" width="4" height="3" fill="#64748b"/>
      <circle cx="7" cy="22" r="2.6" fill="#0f172a"/>
      <circle cx="24" cy="22" r="2.6" fill="#0f172a"/>
      <circle cx="40" cy="22" r="2.6" fill="#0f172a"/>
      <circle cx="7" cy="22" r="0.9" fill="#94a3b8"/>
      <circle cx="24" cy="22" r="0.9" fill="#94a3b8"/>
      <circle cx="40" cy="22" r="0.9" fill="#94a3b8"/>
    </svg>`,
  // Carreta LS — semi mais longo / baixo
  carreta_ls: `
    <svg viewBox="0 0 48 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2 19V11c0-1.2 0.9-2 2.2-2H9l1.5 3.5V19H2z" fill="#0f766e"/>
      <rect x="3" y="11.5" width="4.5" height="3.5" rx="0.3" fill="#5eead4"/>
      <rect x="13" y="9" width="34" height="10" rx="1" fill="#0d9488"/>
      <rect x="10.5" y="16" width="3.5" height="2.5" fill="#14b8a6"/>
      <circle cx="6" cy="22" r="2.4" fill="#0f172a"/>
      <circle cx="22" cy="22" r="2.4" fill="#0f172a"/>
      <circle cx="32" cy="22" r="2.4" fill="#0f172a"/>
      <circle cx="42" cy="22" r="2.4" fill="#0f172a"/>
    </svg>`,
  // Vanderleia — eixos espaçados no semi
  vanderleia: `
    <svg viewBox="0 0 48 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2 19V10.5c0-1.3 1-2.2 2.3-2.2H9.5l1.8 4V19H2z" fill="#7c2d12"/>
      <rect x="3.2" y="11" width="5" height="4" rx="0.3" fill="#fdba74"/>
      <rect x="14" y="8" width="32" height="11" rx="1" fill="#9a3412"/>
      <rect x="11.5" y="16" width="3.5" height="2.5" fill="#c2410c"/>
      <circle cx="6.5" cy="22" r="2.4" fill="#0f172a"/>
      <circle cx="20" cy="22" r="2.4" fill="#0f172a"/>
      <circle cx="42" cy="22" r="2.4" fill="#0f172a"/>
      <line x1="23" y1="22" x2="39" y2="22" stroke="#ea580c" stroke-width="1.5" stroke-dasharray="2 2"/>
    </svg>`,
  // Bitrem — cavalo + 2 reboques
  bitrem: `
    <svg viewBox="0 0 48 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M1 19V11c0-1 0.8-1.8 2-1.8H7l1.2 3V19H1z" fill="#1e3a8a"/>
      <rect x="2" y="11.5" width="4" height="3.2" rx="0.2" fill="#93c5fd"/>
      <rect x="10" y="9" width="16" height="10" rx="0.8" fill="#1d4ed8"/>
      <rect x="28" y="9" width="19" height="10" rx="0.8" fill="#2563eb"/>
      <rect x="8.5" y="16.5" width="2" height="2" fill="#3b82f6"/>
      <rect x="26.5" y="16.5" width="2" height="2" fill="#3b82f6"/>
      <circle cx="4.5" cy="22" r="2.2" fill="#0f172a"/>
      <circle cx="16" cy="22" r="2.2" fill="#0f172a"/>
      <circle cx="36" cy="22" r="2.2" fill="#0f172a"/>
      <circle cx="43" cy="22" r="2.2" fill="#0f172a"/>
    </svg>`,
  // Rodotrem — composição longa (3 módulos)
  rodotrem: `
    <svg viewBox="0 0 48 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M1 19V11.5c0-0.9 0.7-1.6 1.7-1.6H6l1 2.8V19H1z" fill="#312e81"/>
      <rect x="1.8" y="12" width="3.5" height="3" rx="0.2" fill="#a5b4fc"/>
      <rect x="8.5" y="9.5" width="11" height="9.5" rx="0.6" fill="#3730a3"/>
      <rect x="21" y="9.5" width="12" height="9.5" rx="0.6" fill="#4338ca"/>
      <rect x="34.5" y="9.5" width="12.5" height="9.5" rx="0.6" fill="#4f46e5"/>
      <rect x="7.5" y="16.5" width="1.5" height="2" fill="#6366f1"/>
      <rect x="19.8" y="16.5" width="1.5" height="2" fill="#6366f1"/>
      <rect x="33.2" y="16.5" width="1.5" height="2" fill="#6366f1"/>
      <circle cx="4" cy="22" r="2" fill="#0f172a"/>
      <circle cx="13" cy="22" r="2" fill="#0f172a"/>
      <circle cx="26" cy="22" r="2" fill="#0f172a"/>
      <circle cx="40" cy="22" r="2" fill="#0f172a"/>
    </svg>`,
  outros: `
    <svg viewBox="0 0 48 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="10" y="8" width="30" height="12" rx="2" fill="#64748b"/>
      <path d="M4 20V11c0-1.2 1-2 2.2-2H10v11H4z" fill="#475569"/>
      <circle cx="12" cy="22" r="3" fill="#0f172a"/><circle cx="34" cy="22" r="3" fill="#0f172a"/>
    </svg>`,
}

/** HTML do ícone (Leaflet / innerHTML). */
export function frotaIconeHtml(grupo: FrotaIconeGrupo, className = 'frota-veiculo-ico'): string {
  const inner = (SVG[grupo] ?? SVG.outros).trim()
  return `<span class="${className}" data-grupo="${grupo}">${inner}</span>`
}

export function frotaIconeSvgRaw(grupo: FrotaIconeGrupo): string {
  return (SVG[grupo] ?? SVG.outros).trim()
}
