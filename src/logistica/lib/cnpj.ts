import { buscarDadosPorCnpj } from '../../lib/cnpjLookup'

export type CnpjConsulta = {
  cnpj: string
  razao_social: string
  nome_fantasia: string
  telefone?: string
  email?: string
  logradouro?: string
  numero?: string
  bairro?: string
  cep?: string
  cidade?: string
  uf?: string
}

export function somenteDigitosCnpj(value: string) {
  return value.replace(/\D/g, '').slice(0, 14)
}

export function maskCnpj(value: string) {
  const d = somenteDigitosCnpj(value)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

/** Consulta pública da Receita (OpenCNPJ, com BrasilAPI de reserva). */
export async function consultarCnpj(cnpj: string): Promise<CnpjConsulta | null> {
  const digits = somenteDigitosCnpj(cnpj)
  if (digits.length !== 14) return null
  const res = await buscarDadosPorCnpj(digits)
  if (!res.ok) {
    if (/não encontrado/i.test(res.erro)) return null
    throw new Error(res.erro)
  }
  const d = res.dados
  return {
    cnpj: digits,
    razao_social: d.razao_social,
    nome_fantasia: d.nome_fantasia,
    telefone: d.telefone || undefined,
    email: d.email || undefined,
    logradouro: d.endereco || undefined,
    numero: d.numero || undefined,
    bairro: d.bairro || undefined,
    cep: d.cep || undefined,
    cidade: d.cidade || undefined,
    uf: d.uf || undefined,
  }
}
