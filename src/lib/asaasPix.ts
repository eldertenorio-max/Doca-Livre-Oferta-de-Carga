import { supabase } from './supabase'

export type CobrancaAsaas = {
  paymentId: string
  payload: string
  imagem: string
  valor: number
  creditos: number
  pacoteId: string
  tipo: 'credito' | 'plano'
  expiracao?: string
}

type RespostaAsaas = {
  ok?: boolean
  erro?: string
  asaas?: boolean
  resend?: boolean
  sandbox?: boolean
  paymentId?: string
  payload?: string
  imagem?: string
  valor?: number
  creditos?: number
  pacoteId?: string
  tipo?: 'credito' | 'plano'
  expiracao?: string
  pago?: boolean
  status?: string
  emailEnviado?: boolean
  saldo?: number
}

async function chamarAsaas(body: Record<string, unknown>): Promise<RespostaAsaas> {
  if (!supabase) return { ok: false, erro: 'Supabase não configurado.' }
  const { data, error } = await supabase.functions.invoke('asaas-pix', { body })
  const payload = (data ?? {}) as RespostaAsaas
  if (payload && payload.ok === false) {
    return { ok: false, erro: payload.erro || 'Não foi possível falar com o PIX.' }
  }
  if (error) {
    let msg = error.message || 'Falha ao chamar o PIX automático.'
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const bodyErr = (await ctx.json()) as RespostaAsaas
        if (bodyErr?.erro) msg = bodyErr.erro
      } catch {
        /* ignore */
      }
    }
    if (/not found|404|Failed to send a request/i.test(msg)) {
      return { ok: false, erro: 'asaas_nao_configurado' }
    }
    return { ok: false, erro: msg }
  }
  return payload
}

export function asaasNaoConfigurado(erro?: string) {
  const t = (erro || '').toLowerCase()
  return t.includes('asaas_nao_configurado') || t.includes('asaas_api_key')
}

export async function statusConfigAsaas(): Promise<{
  ok: boolean
  asaas?: boolean
  resend?: boolean
  sandbox?: boolean
}> {
  const r = await chamarAsaas({ action: 'config' })
  return {
    ok: Boolean(r.ok),
    asaas: Boolean(r.asaas),
    resend: Boolean(r.resend),
    sandbox: Boolean(r.sandbox),
  }
}

export async function criarPixAsaas(input: {
  tipo: 'credito' | 'plano'
  pacoteId: string
  cpfCnpj: string
  email?: string
  nome?: string
}): Promise<{ ok: true; cobranca: CobrancaAsaas } | { ok: false; erro: string }> {
  const r = await chamarAsaas({
    action: 'criar',
    tipo: input.tipo,
    pacote: input.pacoteId,
    cpfCnpj: input.cpfCnpj,
    email: input.email || '',
    nome: input.nome || '',
  })
  if (!r.ok || !r.paymentId || !r.payload) {
    return { ok: false, erro: r.erro || 'Não foi possível gerar o QR Code PIX.' }
  }
  return {
    ok: true,
    cobranca: {
      paymentId: r.paymentId,
      payload: r.payload,
      imagem: r.imagem || '',
      valor: Number(r.valor || 0),
      creditos: Number(r.creditos || 0),
      pacoteId: r.pacoteId || input.pacoteId,
      tipo: r.tipo || input.tipo,
      expiracao: r.expiracao,
    },
  }
}

export async function statusPixAsaas(paymentId: string): Promise<{
  ok: boolean
  erro?: string
  pago?: boolean
  status?: string
  emailEnviado?: boolean
  saldo?: number
}> {
  return chamarAsaas({ action: 'status', paymentId })
}
