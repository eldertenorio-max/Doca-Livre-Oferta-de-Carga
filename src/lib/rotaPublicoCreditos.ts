/** Créditos avulsos de cálculo de rota (PIX). Na conta Google, ou neste aparelho se ainda não entrou. */

import { supabase } from './supabase'
import { sessaoRotaPublico } from './rotaPublicoAuth'

const STORAGE_KEY = 'doca-rota-publico-creditos-v1'
const TX_KEY = 'doca-rota-publico-pix-tx-v1'

export type PacoteCreditoRota = {
  id: string
  creditos: number
  preco: number
  titulo: string
  sub: string
  destaque?: boolean
}

export const PACOTES_CREDITO_ROTA: PacoteCreditoRota[] = [
  {
    id: '50',
    creditos: 50,
    preco: 29.9,
    titulo: '50 créditos',
    sub: '50 cálculos de rota',
    destaque: true,
  },
  {
    id: '100',
    creditos: 100,
    preco: 59.9,
    titulo: '100 créditos',
    sub: '100 cálculos de rota',
  },
  {
    id: '200',
    creditos: 200,
    preco: 99.9,
    titulo: '200 créditos',
    sub: '200 cálculos de rota',
  },
]

type RpcCreditos = {
  ok?: boolean
  creditos?: number
  erro?: string
}

function lerCreditosLocais(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  } catch {
    return 0
  }
}

function gravarCreditosLocais(n: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.floor(n))))
  } catch {
    /* ignore */
  }
}

function zerarCreditosLocais() {
  gravarCreditosLocais(0)
  try {
    localStorage.removeItem(TX_KEY)
  } catch {
    /* ignore */
  }
}

function rpcCreditos(data: unknown): RpcCreditos {
  if (!data || typeof data !== 'object') return {}
  return data as RpcCreditos
}

export function creditosRotaPublico(): number {
  return lerCreditosLocais()
}

export async function saldoCreditosRotaPublico(): Promise<number> {
  const conta = await sessaoRotaPublico()
  if (conta && supabase) {
    const { data, error } = await supabase.rpc('rota_publico_meus_creditos')
    if (!error) {
      const n = Number(rpcCreditos(data).creditos)
      if (Number.isFinite(n) && n >= 0) return Math.floor(n)
    }
  }
  return lerCreditosLocais()
}

export function consumirCreditoRotaPublico(): boolean {
  const n = lerCreditosLocais()
  if (n < 1) return false
  gravarCreditosLocais(n - 1)
  return true
}

export async function consumirCreditoRotaPublicoConta(): Promise<boolean> {
  const conta = await sessaoRotaPublico()
  if (conta && supabase) {
    const { data, error } = await supabase.rpc('rota_publico_consumir_credito')
    if (!error && rpcCreditos(data).ok) return true
    return false
  }
  return consumirCreditoRotaPublico()
}

export function creditarPacoteRotaPublico(pacote: PacoteCreditoRota, txid: string): boolean {
  const id = txid.trim()
  if (!id) return false
  try {
    const raw = localStorage.getItem(TX_KEY)
    const usados = raw ? (JSON.parse(raw) as string[]) : []
    if (usados.includes(id)) return false
    usados.push(id)
    localStorage.setItem(TX_KEY, JSON.stringify(usados.slice(-80)))
  } catch {
    return false
  }
  gravarCreditosLocais(lerCreditosLocais() + pacote.creditos)
  return true
}

export async function creditarPacoteRotaPublicoNaConta(
  pacote: PacoteCreditoRota,
  txid: string,
): Promise<{ ok: boolean; erro?: string; creditos?: number }> {
  const conta = await sessaoRotaPublico()
  if (!conta || !supabase) {
    return { ok: false, erro: 'Entre com Google para guardar os créditos na sua conta.' }
  }
  const { data, error } = await supabase.rpc('rota_publico_creditar_pacote', {
    p_pacote: pacote.id,
    p_txid: txid,
  })
  const parsed = rpcCreditos(data)
  if (error) {
    return { ok: false, erro: 'Não foi possível gravar na conta. Rode o SQL de créditos no Supabase.' }
  }
  if (!parsed.ok) {
    if (parsed.erro === 'ja_usado') return { ok: false, erro: 'Este pagamento já foi usado nesta conta.' }
    if (parsed.erro === 'nao_autenticado') {
      return { ok: false, erro: 'Entre com Google para guardar os créditos na sua conta.' }
    }
    return { ok: false, erro: 'Não foi possível liberar os créditos.' }
  }
  return { ok: true, creditos: parsed.creditos }
}

export async function migrarCreditosLocaisParaConta(): Promise<number | null> {
  const local = lerCreditosLocais()
  const conta = await sessaoRotaPublico()
  if (!conta || !supabase) return local
  if (local > 0) {
    const { data, error } = await supabase.rpc('rota_publico_migrar_local', { p_saldo: local })
    if (error || !rpcCreditos(data).ok) return local
    zerarCreditosLocais()
    const n = Number(rpcCreditos(data).creditos)
    return Number.isFinite(n) ? Math.floor(n) : 0
  }
  const { data } = await supabase.rpc('rota_publico_meus_creditos')
  const n = Number(rpcCreditos(data).creditos)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

export function novoTxidPix() {
  return `DOC${Date.now().toString(36).toUpperCase()}`.replace(/[^A-Z0-9]/g, '').slice(0, 25)
}
