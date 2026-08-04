/** Mantém só dígitos (máx. 11). */
export function cpfDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11)
}

/** Formata progressivamente: 000.000.000-00 */
export function formatCpf(value: string): string {
  const d = cpfDigits(value)
  const p1 = d.slice(0, 3)
  const p2 = d.slice(3, 6)
  const p3 = d.slice(6, 9)
  const p4 = d.slice(9, 11)

  if (d.length <= 3) return p1
  if (d.length <= 6) return `${p1}.${p2}`
  if (d.length <= 9) return `${p1}.${p2}.${p3}`
  return `${p1}.${p2}.${p3}-${p4}`
}
