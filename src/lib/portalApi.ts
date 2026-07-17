/**
 * Cliente do portal OTP — igual WMS Plus (enviar código por e-mail).
 * Com Supabase configurado: Edge Function `portal-otp` + Resend.
 * Sem Supabase / falha da função: fallback local (só desenvolvimento).
 */

import { isSupabaseConfigured, supabase } from './supabase'
import {
  loadPortalAccounts,
  portalCadastroConcluir as localCadastroConcluir,
  portalCadastroEnviarCodigo as localCadastroEnviar,
  portalCadastroVerificarCodigo as localCadastroVerificar,
  portalSenhaEnviarCodigo as localSenhaEnviar,
  portalSenhaRedefinir as localSenhaRedefinir,
  portalSenhaVerificarCodigo as localSenhaVerificar,
} from './portalAuth'

type OkMail = {
  ok: true
  mensagem?: string
  email?: string
  email_mascarado?: string
  debug_codigo?: string
  smtp_motivo?: string
}

type OkVerify = {
  ok: true
  verify_token: string
  email?: string
  usuario?: string
  mensagem?: string
}

type Fail = { ok: false; erro: string }

const useRemoteOtp = () => isSupabaseConfigured && Boolean(supabase)

async function invokeOtp<T extends { ok?: boolean; erro?: string; smtp_motivo?: string }>(
  action: string,
  body: Record<string, unknown>,
): Promise<T | Fail> {
  if (!supabase) return { ok: false, erro: 'Supabase não configurado.' }
  try {
    const { data, error } = await supabase.functions.invoke('portal-otp', {
      body: { action, ...body },
    })
    if (error) {
      const msg = error.message || 'Falha ao chamar o serviço de e-mail.'
      // Função não publicada → deixa o caller fazer fallback local
      if (/not found|404|Failed to send/i.test(msg)) {
        return { ok: false, erro: `__FALLBACK__:${msg}` }
      }
      return { ok: false, erro: msg }
    }
    const payload = (data ?? {}) as T & Fail
    if (!payload.ok) {
      const base = payload.erro || 'Não foi possível concluir a operação.'
      const detail = (payload.smtp_motivo || '').trim()
      return {
        ok: false,
        erro: detail && !base.includes(detail) ? `${base} (${detail})` : base,
      }
    }
    return payload
  } catch (e) {
    return {
      ok: false,
      erro: `__FALLBACK__:${e instanceof Error ? e.message : 'Falha de conexão'}`,
    }
  }
}

function isFallback(res: Fail) {
  return res.erro.startsWith('__FALLBACK__')
}

export async function portalCadastroEnviarCodigo(email: string): Promise<OkMail | Fail> {
  const e = email.trim().toLowerCase()
  if (!e.includes('@')) return { ok: false, erro: 'Informe um e-mail válido.' }

  const localUsers = loadPortalAccounts()
  if (localUsers.some((u) => u.email.toLowerCase() === e)) {
    return { ok: false, erro: 'Este e-mail já está cadastrado.' }
  }

  if (useRemoteOtp()) {
    const remote = await invokeOtp<OkMail>('cadastro_enviar', { email: e })
    if (remote.ok) return remote
    if (!isFallback(remote as Fail)) return remote as Fail
  }

  const local = await localCadastroEnviar(e)
  if (!local.ok) return local
  return {
    ...local,
    mensagem:
      'Código gerado em modo local (e-mail real ainda não configurado). Use o código abaixo.',
  }
}

export async function portalCadastroVerificarCodigo(
  email: string,
  codigo: string,
): Promise<OkVerify | Fail> {
  if (useRemoteOtp()) {
    const remote = await invokeOtp<OkVerify>('cadastro_verificar', {
      email: email.trim().toLowerCase(),
      codigo: codigo.trim(),
    })
    if (remote.ok) return remote
    if (!isFallback(remote as Fail)) return remote as Fail
  }
  return localCadastroVerificar(email, codigo)
}

export async function portalCadastroConcluir(input: {
  verifyToken: string
  usuario: string
  senha: string
  confirmarSenha: string
}) {
  // Conta continua local; se o token veio do Edge, valida no servidor.
  if (useRemoteOtp() && input.verifyToken.includes('.')) {
    const check = await invokeOtp<{ ok: true; email: string }>('validar_token', {
      finalidade: 'cadastro',
      verify_token: input.verifyToken,
    })
    if (check.ok) {
      // Token Edge válido — conclui localmente com e-mail confirmado
      const forged = btoa(
        JSON.stringify({
          e: check.email,
          exp: Date.now() + 30 * 60_000,
          p: 'cadastro',
        }),
      )
      return localCadastroConcluir({ ...input, verifyToken: forged })
    }
    if (!isFallback(check as Fail)) return check as Fail
  }
  return localCadastroConcluir(input)
}

export async function portalSenhaEnviarCodigo(
  identificador: string,
): Promise<OkMail | Fail> {
  const id = identificador.trim().toLowerCase()
  const account = loadPortalAccounts().find(
    (u) => u.usuario.toLowerCase() === id || u.email.toLowerCase() === id,
  )
  if (!account) return { ok: false, erro: 'Conta não encontrada.' }

  if (useRemoteOtp()) {
    const remote = await invokeOtp<OkMail>('senha_enviar', {
      email: account.email.toLowerCase(),
    })
    if (remote.ok) return remote
    if (!isFallback(remote as Fail)) return remote as Fail
  }

  const local = await localSenhaEnviar(identificador)
  if (!local.ok) return local
  return {
    ...local,
    mensagem:
      'Código gerado em modo local (e-mail real ainda não configurado). Use o código abaixo.',
  }
}

export async function portalSenhaVerificarCodigo(
  identificador: string,
  codigo: string,
): Promise<OkVerify | Fail> {
  const id = identificador.trim().toLowerCase()
  const account = loadPortalAccounts().find(
    (u) => u.usuario.toLowerCase() === id || u.email.toLowerCase() === id,
  )
  if (!account) return { ok: false, erro: 'Conta não encontrada.' }

  if (useRemoteOtp()) {
    const remote = await invokeOtp<OkVerify>('senha_verificar', {
      email: account.email.toLowerCase(),
      codigo: codigo.trim(),
    })
    if (remote.ok) {
      return { ...remote, usuario: account.usuario }
    }
    if (!isFallback(remote as Fail)) return remote as Fail
  }
  return localSenhaVerificar(identificador, codigo)
}

export async function portalSenhaRedefinir(input: {
  verifyToken: string
  senha: string
  confirmarSenha: string
}) {
  if (useRemoteOtp() && input.verifyToken.includes('.')) {
    const check = await invokeOtp<{ ok: true; email: string }>('validar_token', {
      finalidade: 'senha',
      verify_token: input.verifyToken,
    })
    if (check.ok) {
      const account = loadPortalAccounts().find(
        (u) => u.email.toLowerCase() === check.email,
      )
      const forged = btoa(
        JSON.stringify({
          e: check.email,
          u: account?.usuario,
          exp: Date.now() + 30 * 60_000,
          p: 'senha',
        }),
      )
      return localSenhaRedefinir({ ...input, verifyToken: forged })
    }
    if (!isFallback(check as Fail)) return check as Fail
  }
  return localSenhaRedefinir(input)
}

/** Confirma e-mail do cadastro público de transportador. */
export async function portalEmailEnviarCodigo(email: string) {
  return portalCadastroEnviarCodigo(email)
}

export async function portalEmailVerificarCodigo(email: string, codigo: string) {
  return portalCadastroVerificarCodigo(email, codigo)
}
