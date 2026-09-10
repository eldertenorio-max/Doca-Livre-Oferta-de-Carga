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

/** Consulta pública via BrasilAPI. */
export async function consultarCnpj(cnpj: string): Promise<CnpjConsulta | null> {
  const digits = somenteDigitosCnpj(cnpj)
  if (digits.length !== 14) return null

  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Falha ao consultar CNPJ')

  const data = (await res.json()) as {
    razao_social?: string | null
    nome_fantasia?: string | null
    ddd_telefone_1?: string | null
    email?: string | null
    logradouro?: string | null
    numero?: string | null
    bairro?: string | null
    cep?: string | null
    municipio?: string | null
    uf?: string | null
    descricao_tipo_de_logradouro?: string | null
  }

  const razao = (data.razao_social || '').trim()
  const fantasia = (data.nome_fantasia || '').trim() || razao
  const tipo = (data.descricao_tipo_de_logradouro || '').trim()
  const logradouroBase = (data.logradouro || '').trim()
  const logradouro = [tipo, logradouroBase].filter(Boolean).join(' ')

  return {
    cnpj: digits,
    razao_social: razao,
    nome_fantasia: fantasia,
    telefone: data.ddd_telefone_1?.trim() || undefined,
    email: data.email?.trim() || undefined,
    logradouro: logradouro || undefined,
    numero: data.numero?.trim() || undefined,
    bairro: data.bairro?.trim() || undefined,
    cep: data.cep?.replace(/\D/g, '') || undefined,
    cidade: data.municipio?.trim() || undefined,
    uf: data.uf?.trim() || undefined,
  }
}
