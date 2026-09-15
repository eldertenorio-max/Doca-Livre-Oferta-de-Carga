import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './supabase'
import { isLocalDev, isSiteOfertaDeCarga } from './siteOfertaDeCarga'

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

export async function entrarComGoogleRotaPublico(): Promise<{ ok: boolean; erro?: string }> {
  if (!supabase || !isSupabaseConfigured) {
    return { ok: false, erro: 'O login Google ainda não está configurado neste site.' }
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectOAuthRotaPublico(),
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('provider') || msg.includes('unsupported')) {
      return { ok: false, erro: 'Ative o login Google no painel do Supabase (Authentication → Providers).' }
    }
    return { ok: false, erro: 'Não foi possível entrar com Google. Tente de novo.' }
  }
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
