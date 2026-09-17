import { supabase } from './supabase'

export type PresenteRotaItem = {
  id: string
  email: string
  creditos: number
  criado_em: string
  criado_por: string
  aplicado_em?: string | null
  visto_em?: string | null
  email_enviado_em?: string | null
  email_erro?: string | null
}

type RespostaPresente = {
  ok?: boolean
  erro?: string
  resend?: boolean
  id?: string
  email?: string
  creditos?: number
  aplicado?: boolean
  contaExiste?: boolean
  saldo?: number
  emailEnviado?: boolean
  emailErro?: string
  presentes?: PresenteRotaItem[]
}

async function chamarPresente(body: Record<string, unknown>): Promise<RespostaPresente> {
  if (!supabase) return { ok: false, erro: 'Supabase não configurado.' }
  const { data, error } = await supabase.functions.invoke('rota-presente', { body })
  const payload = (data ?? {}) as RespostaPresente
  if (payload && payload.ok === false) {
    return { ok: false, erro: payload.erro || 'Não foi possível enviar o presente.' }
  }
  if (error) {
    let msg = error.message || 'Falha ao chamar o presente de créditos.'
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const bodyErr = (await ctx.json()) as RespostaPresente
        if (bodyErr?.erro) msg = bodyErr.erro
      } catch {
        /* ignore */
      }
    }
    if (/not found|404|Failed to send a request/i.test(msg)) {
      return { ok: false, erro: 'Função de presente ainda não está no ar. Faça o deploy de rota-presente.' }
    }
    return { ok: false, erro: msg }
  }
  return payload
}

export async function presentearCreditosRota(input: {
  email: string
  creditos: number
  adminEmail: string
  adminUsuario: string
}): Promise<RespostaPresente> {
  return chamarPresente({
    action: 'presentear',
    email: input.email,
    creditos: input.creditos,
    adminEmail: input.adminEmail,
    adminUsuario: input.adminUsuario,
  })
}

export async function listarPresentesRota(input: {
  adminEmail: string
  adminUsuario: string
}): Promise<{ ok: boolean; erro?: string; presentes: PresenteRotaItem[] }> {
  const r = await chamarPresente({
    action: 'listar',
    adminEmail: input.adminEmail,
    adminUsuario: input.adminUsuario,
  })
  if (!r.ok) return { ok: false, erro: r.erro, presentes: [] }
  return { ok: true, presentes: Array.isArray(r.presentes) ? r.presentes : [] }
}

export async function statusPresenteRota(): Promise<{ ok: boolean; resend?: boolean }> {
  const r = await chamarPresente({ action: 'config' })
  return { ok: Boolean(r.ok), resend: Boolean(r.resend) }
}
