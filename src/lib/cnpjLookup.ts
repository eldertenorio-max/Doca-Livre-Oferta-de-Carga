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

/** Monta o endereço completo a partir da consulta CNPJ (Receita). */
export function montarEnderecoCnpj(d: DadosCnpjLookup): string {
  const rua = [d.endereco, d.numero].filter(Boolean).join(', ')
  const cidadeUf = [d.cidade, d.uf].filter(Boolean).join(' - ')
  return [rua, d.bairro, cidadeUf, d.cep].filter(Boolean).join(', ')
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
  descricao_tipo_de_logradouro?: string
  numero?: string
  complemento?: string
  ddd_telefone_1?: string
  email?: string
}

type OpenCnpj = {
  cnpj?: string
  razao_social?: string
  nome_fantasia?: string
  cep?: string
  uf?: string
  municipio?: string
  bairro?: string
  tipo_logradouro?: string
  logradouro?: string
  numero?: string
  complemento?: string
  email?: string
  telefones?: Array<{ ddd?: string; numero?: string; is_fax?: boolean }>
}

type Tentativa =
  | { tipo: 'ok'; dados: DadosCnpjLookup }
  | { tipo: 'ausente' }
  | { tipo: 'limite' }
  | { tipo: 'falha' }

function texto(valor: unknown) {
  return String(valor || '').trim()
}

function telefoneDeDigitos(bruto: string) {
  const dddTel = bruto.replace(/\D/g, '')
  if (dddTel.length >= 10) return formatPhoneBr(dddTel)
  if (dddTel.length >= 8) return dddTel
  return ''
}

function montarDados(input: {
  digits: string
  cnpj?: string
  razao: string
  fantasia: string
  cep: string
  cidade: string
  uf: string
  endereco: string
  numero: string
  bairro: string
  complemento: string
  telefone: string
  email: string
}): DadosCnpjLookup | null {
  if (!input.razao && !input.fantasia) return null
  const razao = input.razao || input.fantasia
  return {
    razao_social: razao,
    nome_fantasia: input.fantasia || razao,
    cnpj: formatCnpj(input.cnpj || input.digits),
    cep: formatCep(input.cep),
    cidade: input.cidade,
    uf: input.uf.toUpperCase().slice(0, 2),
    endereco: input.endereco,
    numero: input.numero,
    bairro: input.bairro,
    complemento: input.complemento,
    telefone: input.telefone,
    email: input.email.toLowerCase(),
  }
}

/** Devolve assim que uma fonte acha o CNPJ, sem esperar a outra terminar. */
function primeiraConsultaUtil(tarefas: Array<Promise<Tentativa>>): Promise<Tentativa[]> {
  return new Promise((resolve) => {
    const saidas: Tentativa[] = []
    let faltam = tarefas.length
    if (faltam === 0) {
      resolve(saidas)
      return
    }
    for (const tarefa of tarefas) {
      void tarefa.then((item) => {
        saidas.push(item)
        faltam -= 1
        if (item.tipo === 'ok' || faltam === 0) resolve(saidas)
      })
    }
  })
}

async function baixarJson(url: string): Promise<{ status: number; data: unknown } | 'rede'> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    })
    if (!res.ok) return { status: res.status, data: null }
    return { status: res.status, data: await res.json() }
  } catch {
    return 'rede'
  } finally {
    clearTimeout(timer)
  }
}

/** OpenCNPJ espelha a Receita e aceita chamada direto do navegador. */
async function consultarOpenCnpj(digits: string): Promise<Tentativa> {
  const res = await baixarJson(`https://api.opencnpj.org/${digits}`)
  if (res === 'rede') return { tipo: 'falha' }
  if (res.status === 404) return { tipo: 'ausente' }
  if (res.status === 429) return { tipo: 'limite' }
  if (res.status !== 200 || !res.data) return { tipo: 'falha' }
  const data = res.data as OpenCnpj
  const tel = (data.telefones || []).find((t) => t && !t.is_fax && (t.ddd || t.numero))
  const dados = montarDados({
    digits,
    cnpj: data.cnpj,
    razao: texto(data.razao_social),
    fantasia: texto(data.nome_fantasia),
    cep: texto(data.cep),
    cidade: texto(data.municipio),
    uf: texto(data.uf),
    endereco: [texto(data.tipo_logradouro), texto(data.logradouro)].filter(Boolean).join(' '),
    numero: texto(data.numero),
    bairro: texto(data.bairro),
    complemento: texto(data.complemento),
    telefone: telefoneDeDigitos(`${tel?.ddd || ''}${tel?.numero || ''}`),
    email: texto(data.email),
  })
  return dados ? { tipo: 'ok', dados } : { tipo: 'falha' }
}

async function consultarBrasilApi(digits: string): Promise<Tentativa> {
  const res = await baixarJson(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
  if (res === 'rede') return { tipo: 'falha' }
  if (res.status === 404) return { tipo: 'ausente' }
  if (res.status === 429) return { tipo: 'limite' }
  if (res.status !== 200 || !res.data) return { tipo: 'falha' }
  const data = res.data as BrasilApiCnpj
  const dados = montarDados({
    digits,
    cnpj: data.cnpj,
    razao: texto(data.razao_social),
    fantasia: texto(data.nome_fantasia),
    cep: texto(data.cep),
    cidade: texto(data.municipio),
    uf: texto(data.uf),
    endereco: [texto(data.descricao_tipo_de_logradouro), texto(data.logradouro)].filter(Boolean).join(' '),
    numero: texto(data.numero),
    bairro: texto(data.bairro),
    complemento: texto(data.complemento),
    telefone: telefoneDeDigitos(texto(data.ddd_telefone_1)),
    email: texto(data.email),
  })
  return dados ? { tipo: 'ok', dados } : { tipo: 'falha' }
}

/**
 * Consulta o CNPJ na base pública da Receita.
 * A BrasilAPI às vezes responde 500; nesse caso usa a OpenCNPJ.
 */
export async function buscarDadosPorCnpj(
  cnpj: string,
): Promise<{ ok: true; dados: DadosCnpjLookup } | { ok: false; erro: string }> {
  const digits = cnpjDigits(cnpj)
  if (digits.length !== 14) return { ok: false, erro: 'CNPJ incompleto.' }
  if (!isValidCnpj(digits)) return { ok: false, erro: 'CNPJ inválido.' }

  const tentativas = await primeiraConsultaUtil([
    consultarOpenCnpj(digits),
    consultarBrasilApi(digits),
  ])
  const achou = tentativas.find((t) => t.tipo === 'ok')
  if (achou?.tipo === 'ok') return { ok: true, dados: achou.dados }
  if (tentativas.every((t) => t.tipo === 'ausente')) {
    return { ok: false, erro: 'CNPJ não encontrado na Receita Federal.' }
  }
  if (tentativas.some((t) => t.tipo === 'limite')) {
    return { ok: false, erro: 'Muitas consultas. Aguarde alguns segundos e tente de novo.' }
  }
  return {
    ok: false,
    erro: 'Falha de rede ao consultar o CNPJ. Verifique a internet e tente novamente.',
  }
}
