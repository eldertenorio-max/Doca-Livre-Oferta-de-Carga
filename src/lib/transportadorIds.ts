/** IDs legados do seed local → UUIDs do Supabase. */
const LEGACY_TO_UUID: Record<string, string> = {
  t1: '11111111-1111-1111-1111-111111111111',
  t2: '22222222-2222-2222-2222-222222222222',
  t3: '33333333-3333-3333-3333-333333333333',
  t4: '44444444-4444-4444-4444-444444444444',
  t5: '55555555-5555-5555-5555-555555555555',
}

/** Converte t1/t2/… para o UUID do banco (ou devolve o próprio id). */
export function canonicalTransportadorId(id: string | null | undefined): string | null {
  if (!id) return null
  const trimmed = id.trim()
  if (!trimmed) return null
  return LEGACY_TO_UUID[trimmed] || trimmed
}

export function isLegacyTransportadorId(id: string | null | undefined): boolean {
  return Boolean(id && LEGACY_TO_UUID[id])
}
