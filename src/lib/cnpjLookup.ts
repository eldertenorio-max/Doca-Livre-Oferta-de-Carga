import { cnpjDigits, formatCnpj, isValidCnpj } from './cnpj'
import { formatPhoneBr } from './phoneBr'

export type DadosCnpjLookup = {
  razao_social: string
  nome_fantasia: string
  cnpj: string
  cep: string
  cidade: string
  uf: string
  endereco: string
  numero: string
  bairro: string
  complemento: string
  telefone: string
  email: string
}

function formatCep(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

type BrasilApiCnpj = {
  cnpj?: string
  razao_social?: string
  nome_fantasia?: string
  cep?: string
  uf?: string
  municipio?: string
  bairro?: string
  logradouro?: string
  numero?: string
  complemento?: string
  ddd_telefone_1?: string
  email?: string
  descricao_situacao_cadastral?: string
}

/**
 * Consulta pública BrasilAPI (Receita Federal).
 * https://brasilapi.com.br/docs#tag/CNPJ
 */
export async function buscarDadosPorCnpj(
  cnpj: string,
): Promise<{ ok: true; dados: DadosCnpjLookup } | { ok: false; erro: string }> {
  const digits = cnpjDigits(cnpj)
  if (digits.length !== 14) return { ok: false, erro: 'CNPJ incompleto.' }
  if (!isValidCnpj(digits)) return { ok: false, erro: 'CNPJ inválido.' }

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      headers: { Accept: 'application/json' },
    })
    if (res.status === 404) {
      return { ok: false, erro: 'CNPJ não encontrado na Receita Federal.' }
    }
    if (res.status === 429) {
      return { ok: false, erro: 'Muitas consultas. Aguarde alguns segundos e tente de novo.' }
    }
    if (!res.ok) {
      return { ok: false, erro: `Não foi possível consultar o CNPJ (${res.status}).` }
    }

    const data = (await res.json()) as BrasilApiCnpj
    const razao = (data.razao_social || '').trim()
    const fantasia = (data.nome_fantasia || '').trim() || razao
    const dddTel = (data.ddd_telefone_1 || '').replace(/\D/g, '')
    let telefone = ''
    if (dddTel.length >= 10) {
      telefone = formatPhoneBr(dddTel)
    } else if (dddTel.length >= 8) {
      // só número local — mantém como veio
      telefone = dddTel
    }

    return {
      ok: true,
      dados: {
        razao_social: razao,
        nome_fantasia: fantasia,
        cnpj: formatCnpj(data.cnpj || digits),
        cep: formatCep(data.cep || ''),
        cidade: (data.municipio || '').trim(),
        uf: (data.uf || '').trim().toUpperCase().slice(0, 2),
        endereco: (data.logradouro || '').trim(),
        numero: (data.numero || '').trim(),
        bairro: (data.bairro || '').trim(),
        complemento: (data.complemento || '').trim(),
        telefone,
        email: (data.email || '').trim().toLowerCase(),
      },
    }
  } catch {
    return {
      ok: false,
      erro: 'Falha de rede ao consultar o CNPJ. Verifique a internet e tente novamente.',
    }
  }
}
