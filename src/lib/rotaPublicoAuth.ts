import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from './supabase'
import { isLocalDev, isSiteOfertaDeCarga } from './siteOfertaDeCarga'

const ERRO_GOOGLE_DESLIGADO =
  'O login Google ainda não está ligado no Supabase. Painel → Authentication → Providers → Google → Enable (Client ID e Secret do Google Cloud).'

export type ContaRotaPublico = {
  id: string
  email: string
  nome: string
  foto: string | null
}

function contaDeUser(user: User): ContaRotaPublico {
  const meta = user.user_metadata || {}
  const nome = String(meta.full_name || meta.name || user.email || 'Conta Google').trim()
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
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  return user ? contaDeUser(user) : null
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

export async function sairRotaPublico() {
  if (!supabase) return
  await supabase.auth.signOut()
}

export function ouvirSessaoRotaPublico(cb: (conta: ContaRotaPublico | null) => void): () => void {
  if (!supabase) {
    cb(null)
    return () => {}
  }
  let alive = true
  void supabase.auth.getSession().then(({ data }) => {
    if (!alive) return
    cb(data.session?.user ? contaDeUser(data.session.user) : null)
  })
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!alive) return
    cb(session?.user ? contaDeUser(session.user) : null)
  })
  return () => {
    alive = false
    data.subscription.unsubscribe()
  }
}

export function useRotaPublicoAuth() {
  const [conta, setConta] = useState<ContaRotaPublico | null>(null)
  const [pronto, setPronto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const unsub = ouvirSessaoRotaPublico((c) => {
      setConta(c)
      setPronto(true)
    })
    return unsub
  }, [])

  async function entrar() {
    setBusy(true)
    setErro('')
    const r = await entrarComGoogleRotaPublico()
    if (!r.ok) setErro(r.erro || 'Não foi possível entrar com Google.')
    setBusy(false)
  }

  async function sair() {
    await sairRotaPublico()
  }

  return { conta, pronto, busy, erro, entrar, sair }
}
