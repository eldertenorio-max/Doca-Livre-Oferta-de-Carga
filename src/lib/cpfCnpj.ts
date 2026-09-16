export function soDigitos(valor: string) {
  return (valor || '').replace(/\D/g, '')
}

function dvCpf(nums: number[], factor: number) {
  const soma = nums.reduce((acc, n, i) => acc + n * (factor - i), 0)
  const rest = (soma * 10) % 11
  return rest === 10 ? 0 : rest
}

export function cpfValido(valor: string) {
  const d = soDigitos(valor)
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  const nums = d.split('').map(Number)
  if (dvCpf(nums.slice(0, 9), 10) !== nums[9]) return false
  return dvCpf(nums.slice(0, 10), 11) === nums[10]
}

function dvCnpj(nums: number[], pesos: number[]) {
  const soma = nums.reduce((acc, n, i) => acc + n * pesos[i], 0)
  const rest = soma % 11
  return rest < 2 ? 0 : 11 - rest
}

export function cnpjValido(valor: string) {
  const d = soDigitos(valor)
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const nums = d.split('').map(Number)
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  if (dvCnpj(nums.slice(0, 12), p1) !== nums[12]) return false
  return dvCnpj(nums.slice(0, 13), p2) === nums[13]
}

export function cpfCnpjValido(valor: string) {
  const d = soDigitos(valor)
  if (d.length === 11) return cpfValido(d)
  if (d.length === 14) return cnpjValido(d)
  return false
}

export function formatarCpfCnpj(valor: string) {
  const d = soDigitos(valor).slice(0, 14)
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}
