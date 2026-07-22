/** Mantém só dígitos (máx. 14). */
export function cnpjDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 14)
}

/** Formata progressivamente: 00.000.000/0000-00 */
export function formatCnpj(value: string): string {
  const d = cnpjDigits(value)
  const p1 = d.slice(0, 2)
  const p2 = d.slice(2, 5)
  const p3 = d.slice(5, 8)
  const p4 = d.slice(8, 12)
  const p5 = d.slice(12, 14)

  if (d.length <= 2) return p1
  if (d.length <= 5) return `${p1}.${p2}`
  if (d.length <= 8) return `${p1}.${p2}.${p3}`
  if (d.length <= 12) return `${p1}.${p2}.${p3}/${p4}`
  return `${p1}.${p2}.${p3}/${p4}-${p5}`
}

function calcDigito(base: string, pesos: number[]): number {
  let soma = 0
  for (let i = 0; i < pesos.length; i++) {
    soma += Number(base[i]) * pesos[i]
  }
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

/** Valida CNPJ (14 dígitos + dígitos verificadores). */
export function isValidCnpj(value: string): boolean {
  const d = cnpjDigits(value)
  if (d.length !== 14) return false
  if (/^(\d)\1{13}$/.test(d)) return false

  const d1 = calcDigito(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  if (d1 !== Number(d[12])) return false
  const d2 = calcDigito(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return d2 === Number(d[13])
}
