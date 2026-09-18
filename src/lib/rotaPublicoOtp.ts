import { supabase } from './supabase'

type Ok = {
  ok: true
  mensagem?: string
  email?: string
  email_mascarado?: string
}

type Fail = { ok: false; erro: string }

async function chamar(action: string, body: Record<string, unknown>): Promise<Ok | Fail> {
  if (!supabase) return { ok: false, erro: 'Supabase não configurado.' }
  const { data, error } = await supabase.functions.invoke('rota-publico-otp', {
    body: { action, ...body },
  })
  const payload = (data ?? {}) as Ok & Fail & { message?: string }
  if (payload && payload.ok === false) {
    return { ok: false, erro: payload.erro || payload.message || 'Não foi possível concluir.' }
  }
  if (error) {
    let msg = error.message || 'Falha ao enviar o código.'
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const bodyErr = (await ctx.json()) as Fail
        if (bodyErr?.erro) msg = bodyErr.erro
      } catch {
        /* ignore */
      }
    }
    if (/not found|404|Failed to send a request/i.test(msg)) {
      return { ok: false, erro: 'Função de código ainda não está no ar. Faça o deploy de rota-publico-otp.' }
    }
    return { ok: false, erro: msg }
  }
  if (!payload || payload.ok !== true) {
    return { ok: false, erro: 'Não foi possível concluir.' }
  }
  return payload
}

export async function rotaPublicoEnviarCodigoCadastro(email: string) {
  return chamar('cadastro_enviar', { email })
}

export async function rotaPublicoConfirmarCadastro(input: {
  email: string
  codigo: string
  senha: string
  nome: string
}) {
  return chamar('cadastro_confirmar', input)
}

export async function rotaPublicoEnviarCodigoSenha(email: string) {
  return chamar('senha_enviar', { email })
}

export async function rotaPublicoConfirmarNovaSenha(input: {
  email: string
  codigo: string
  senha: string
}) {
  return chamar('senha_confirmar', input)
}
