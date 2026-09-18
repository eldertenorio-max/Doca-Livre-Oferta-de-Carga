import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from './supabase'
import { isLocalDev, isSiteOfertaDeCarga } from './siteOfertaDeCarga'

const ERRO_GOOGLE_DESLIGADO =
  'O login Google ainda não está ligado no Supabase. Painel → Authentication → Providers → Google → Enable (Client ID e Secret do Google Cloud).'

/** Marca a conta Auth como só do site aberto (calculadora/mapa). Não entra no sistema. */
export const ORIGEM_ROTA_PUBLICO = 'rota_publico'

export type ContaRotaPublico = {
  id: string
  email: string
  nome: string
  foto: string | null
}

export function ehContaSoSiteAberto(user: User | null | undefined): boolean {
  if (!user) return false
  return String(user.user_metadata?.origem || '').trim() === ORIGEM_ROTA_PUBLICO
}

function contaDeUser(user: User): ContaRotaPublico {
  const meta = user.user_metadata || {}
  const nome = String(meta.full_name || meta.name || meta.nome || user.email || 'Conta').trim()
  const foto =
    typeof meta.avatar_url === 'string'
      ? meta.avatar_url
      : typeof meta.picture === 'string'
        ? meta.picture
        : null
  return { id: user.id, email: user.email || '', nome, foto }
}

export function redirectOAuthRotaPublico() {
  if (typeof window === 'undefined') return undefined
  const { origin, pathname, search } = window.location
  if (isSiteOfertaDeCarga() || isLocalDev()) {
    const path = pathname && pathname !== '' ? pathname : '/'
    return `${origin}${path}${search}`
  }
  return `${origin}/#/rota`
}

export async function sessaoRotaPublico(): Promise<ContaRotaPublico | null> {
  if (!supabase) return null
  if (authPronto) return authLast
  await garantirAuth()
  return authLast
}

function mensagemErroGoogle(raw: string) {
  const t = raw.trim()
  let msg = t
  try {
    const j = JSON.parse(t) as { msg?: string; error_description?: string; message?: string }
    msg = String(j.msg || j.error_description || j.message || t)
  } catch {
    /* texto simples */
  }
  const low = msg.toLowerCase()
  if (low.includes('provider') || low.includes('not enabled') || low.includes('unsupported')) {
    return ERRO_GOOGLE_DESLIGADO
  }
  return 'Não foi possível entrar com Google. Tente de novo.'
}

export function mensagemErroAuthRota(raw: string) {
  const t = (raw || '').trim()
  const low = t.toLowerCase()
  if (low.includes('invalid login') || low.includes('invalid credentials')) {
    return 'E-mail ou senha incorretos.'
  }
  if (low.includes('email not confirmed') || low.includes('not confirmed')) {
    return 'Confirme o e-mail que enviamos e entre de novo.'
  }
  if (
    low.includes('already registered') ||
    low.includes('already been registered') ||
    low.includes('user already')
  ) {
    return 'Este e-mail já tem conta. Entre com a senha.'
  }
  if (low.includes('password') && (low.includes('least') || low.includes('6'))) {
    return 'A senha precisa ter pelo menos 6 caracteres.'
  }
  if (low.includes('rate limit') || low.includes('security purposes')) {
    return 'Aguarde uns segundos e tente de novo.'
  }
  if (low.includes('signup is disabled')) {
    return 'O cadastro por e-mail ainda não está ligado no Supabase.'
  }
  return t || 'Não foi possível entrar. Tente de novo.'
}

function emailOk(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

async function googleProviderLigado(): Promise<boolean | null> {
  if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey) return false
  try {
    const ctrl = new AbortController()
    const t = window.setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      signal: ctrl.signal,
    })
    window.clearTimeout(t)
    if (!r.ok) return null
    const j = (await r.json()) as { external?: { google?: boolean } }
    return Boolean(j.external?.google)
  } catch {
    return null
  }
}

export async function entrarComGoogleRotaPublico(): Promise<{ ok: boolean; erro?: string }> {
  if (!supabase || !isSupabaseConfigured) {
    return { ok: false, erro: 'O login Google ainda não está configurado neste site.' }
  }
  const ligado = await googleProviderLigado()
  if (ligado === false) {
    return { ok: false, erro: ERRO_GOOGLE_DESLIGADO }
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectOAuthRotaPublico(),
      queryParams: { prompt: 'select_account' },
      skipBrowserRedirect: true,
    },
  })
  if (error) return { ok: false, erro: mensagemErroGoogle(error.message) }
  if (!data.url) return { ok: false, erro: 'Não foi possível abrir o login Google. Tente de novo.' }
  window.location.assign(data.url)
  return { ok: true }
}

export async function cadastrarEmailRotaPublico(input: {
  email: string
  senha: string
  nome?: string
}): Promise<{ ok: boolean; erro?: string; precisaConfirmar?: boolean }> {
  if (!supabase || !isSupabaseConfigured) {
    return { ok: false, erro: 'O cadastro ainda não está configurado neste site.' }
  }
  const email = input.email.trim().toLowerCase()
  const senha = input.senha
  const nome = (input.nome || '').trim() || email.split('@')[0] || 'Conta'
  if (!emailOk(email)) return { ok: false, erro: 'Informe um e-mail válido.' }
  if (senha.length < 6) return { ok: false, erro: 'A senha precisa ter pelo menos 6 caracteres.' }

  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: {
      emailRedirectTo: redirectOAuthRotaPublico(),
      data: {
        origem: ORIGEM_ROTA_PUBLICO,
        nome,
        full_name: nome,
      },
    },
  })
  if (error) return { ok: false, erro: mensagemErroAuthRota(error.message) }
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { ok: false, erro: 'Este e-mail já tem conta. Entre com a senha.' }
  }
  if (!data.session) {
    return {
      ok: true,
      precisaConfirmar: true,
    }
  }
  return { ok: true }
}

export async function entrarEmailRotaPublico(input: {
  email: string
  senha: string
}): Promise<{ ok: boolean; erro?: string }> {
  if (!supabase || !isSupabaseConfigured) {
    return { ok: false, erro: 'O login ainda não está configurado neste site.' }
  }
  const email = input.email.trim().toLowerCase()
  const senha = input.senha
  if (!emailOk(email)) return { ok: false, erro: 'Informe um e-mail válido.' }
  if (!senha) return { ok: false, erro: 'Informe a senha.' }
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
  if (error) return { ok: false, erro: mensagemErroAuthRota(error.message) }
  return { ok: true }
}

export async function recuperarSenhaRotaPublico(emailRaw: string): Promise<{ ok: boolean; erro?: string }> {
  if (!supabase || !isSupabaseConfigured) {
    return { ok: false, erro: 'A recuperação de senha ainda não está configurada.' }
  }
  const email = emailRaw.trim().toLowerCase()
  if (!emailOk(email)) return { ok: false, erro: 'Informe um e-mail válido.' }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectOAuthRotaPublico(),
  })
  if (error) return { ok: false, erro: mensagemErroAuthRota(error.message) }
  return { ok: true }
}

export async function definirNovaSenhaRotaPublico(senha: string): Promise<{ ok: boolean; erro?: string }> {
  if (!supabase) return { ok: false, erro: 'Supabase não configurado.' }
  if (senha.length < 6) return { ok: false, erro: 'A senha precisa ter pelo menos 6 caracteres.' }
  const { error } = await supabase.auth.updateUser({ password: senha })
  if (error) return { ok: false, erro: mensagemErroAuthRota(error.message) }
  return { ok: true }
}

export async function sairRotaPublico() {
  if (!supabase) return
  await supabase.auth.signOut()
}

let senhaRecoveryAtiva = false

type AuthCb = (conta: ContaRotaPublico | null) => void
const authCbs = new Set<AuthCb>()
let authLast: ContaRotaPublico | null = null
let authPronto = false
let authStart: Promise<void> | null = null

function emitirAuth(conta: ContaRotaPublico | null) {
  authLast = conta
  authPronto = true
  authCbs.forEach((cb) => cb(conta))
}

function sessaoDeGet(data: { session: { user: User } | null } | null) {
  const user = data?.session?.user
  return user ? contaDeUser(user) : null
}

function garantirAuth(): Promise<void> {
  if (!supabase) {
    authPronto = true
    authLast = null
    return Promise.resolve()
  }
  if (authStart) return authStart
  const client = supabase
  authStart = new Promise<void>((resolve) => {
    let done = false
    const finish = (conta: ContaRotaPublico | null) => {
      if (conta) emitirAuth(conta)
      else if (!authPronto) emitirAuth(null)
      if (done) return
      done = true
      resolve()
    }
    const t = window.setTimeout(() => finish(authLast), 4000)
    void client.auth.getSession().then(
      ({ data }) => {
        window.clearTimeout(t)
        finish(sessaoDeGet(data))
      },
      () => {
        window.clearTimeout(t)
        finish(authLast)
      },
    )
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') senhaRecoveryAtiva = true
      emitirAuth(session?.user ? contaDeUser(session.user) : null)
      if (!done) {
        done = true
        resolve()
      }
    })
  })
  return authStart
}

export function ouvirSessaoRotaPublico(cb: AuthCb): () => void {
  if (!supabase) {
    cb(null)
    return () => {}
  }
  authCbs.add(cb)
  if (authPronto) cb(authLast)
  void garantirAuth()
  return () => {
    authCbs.delete(cb)
  }
}

export function useRotaPublicoAuth() {
  const [conta, setConta] = useState<ContaRotaPublico | null>(null)
  const [pronto, setPronto] = useState(false)
  const [busyGoogle, setBusyGoogle] = useState(false)
  const [busyEmail, setBusyEmail] = useState(false)
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [redefinirSenha, setRedefinirSenha] = useState(senhaRecoveryAtiva)

  useEffect(() => {
    const unsub = ouvirSessaoRotaPublico((c) => {
      setConta(c)
      setPronto(true)
      if (senhaRecoveryAtiva) setRedefinirSenha(true)
    })
    return unsub
  }, [])

  async function entrar() {
    setBusyGoogle(true)
    setErro('')
    setInfo('')
    const r = await entrarComGoogleRotaPublico()
    if (!r.ok) setErro(r.erro || 'Não foi possível entrar com Google.')
    setBusyGoogle(false)
  }

  async function entrarEmail(email: string, senha: string) {
    setBusyEmail(true)
    setErro('')
    setInfo('')
    const r = await entrarEmailRotaPublico({ email, senha })
    if (!r.ok) setErro(r.erro || 'Não foi possível entrar.')
    setBusyEmail(false)
    return r
  }

  async function cadastrar(email: string, senha: string, nome: string) {
    setBusyEmail(true)
    setErro('')
    setInfo('')
    const r = await cadastrarEmailRotaPublico({ email, senha, nome })
    if (!r.ok) setErro(r.erro || 'Não foi possível criar a conta.')
    else if (r.precisaConfirmar) {
      setInfo('Enviamos um e-mail para confirmar. Depois disso, entre aqui com e-mail e senha.')
    }
    setBusyEmail(false)
    return r
  }

  async function recuperar(email: string) {
    setBusyEmail(true)
    setErro('')
    setInfo('')
    const r = await recuperarSenhaRotaPublico(email)
    if (!r.ok) setErro(r.erro || 'Não foi possível enviar o e-mail.')
    else setInfo('Se o e-mail existir, enviamos o link para criar uma senha nova.')
    setBusyEmail(false)
    return r
  }

  async function novaSenha(senha: string) {
    setBusyEmail(true)
    setErro('')
    setInfo('')
    const r = await definirNovaSenhaRotaPublico(senha)
    if (!r.ok) setErro(r.erro || 'Não foi possível gravar a senha.')
    else {
      senhaRecoveryAtiva = false
      setRedefinirSenha(false)
      setInfo('Senha atualizada. Você já está na calculadora.')
    }
    setBusyEmail(false)
    return r
  }

  async function sair() {
    await sairRotaPublico()
  }

  return {
    conta,
    pronto,
    busy: busyGoogle || busyEmail,
    busyGoogle,
    busyEmail,
    erro,
    info,
    redefinirSenha,
    entrar,
    entrarEmail,
    cadastrar,
    recuperar,
    novaSenha,
    sair,
  }
}
