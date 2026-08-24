/** Marcas usuais de térmico / aparelho de refrigeração em baú. */
export const MARCAS_TERMICO = [
  'Thermo King',
  'Carrier',
  'Zanotti',
  'Mitsubishi',
  'Hubbard',
  'GAH',
  'Frigoblock',
  'Elber',
  'Recrusul',
  'MGM',
  'TKT',
  'Schmitz',
  'Lamberet',
  'Superfrio',
  'Outra',
] as const

export type MarcaTermico = (typeof MARCAS_TERMICO)[number]

export function aclimatacaoComTermico(v?: string | null): boolean {
  const s = (v || '').trim().toLowerCase()
  return s === 'refrigerado' || s === 'congelado'
}

export function parseTempC(raw: unknown): number | undefined {
  if (raw === '' || raw == null) return undefined
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'))
  if (!Number.isFinite(n)) return undefined
  return Math.min(40, Math.max(-50, n))
}

export function selectMarcaTermico(marca?: string | null): string {
  const m = (marca || '').trim()
  if (!m) return ''
  const conhecida = MARCAS_TERMICO.find(
    (x) => x !== 'Outra' && x.toLowerCase() === m.toLowerCase(),
  )
  return conhecida ?? 'Outra'
}
