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
    preco: 5,
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
  ok?: boolean | string
  creditos?: number
  erro?: string
  ja_creditado?: boolean
  quando?: string
  pacote_id?: string
  email?: string
  encontrado?: boolean
  valor?: number
  saldo_atual?: number
  txid?: string
  status?: string
  presente?: number
  presente_ids?: unknown
}

export type SaldoRotaPublico = {
  creditos: number
  presente: number
  presenteIds: string[]
}

const PRESENTE_VISTO_KEY = 'doca-rota-presente-visto-v1'

function idsPresente(raw: unknown): string[] {
  if (typeof raw === 'string') {
    try {
      return idsPresente(JSON.parse(raw))
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

export function presenteJaVistoLocal(ids: string[]): boolean {
  if (ids.length === 0) return true
  try {
    const raw = localStorage.getItem(PRESENTE_VISTO_KEY)
    const vistos = raw ? (JSON.parse(raw) as string[]) : []
    if (!Array.isArray(vistos)) return false
    return ids.every((id) => vistos.includes(id))
  } catch {
    return false
  }
}

function gravarPresenteVistoLocal(ids: string[]) {
  try {
    const raw = localStorage.getItem(PRESENTE_VISTO_KEY)
    const prev = raw ? (JSON.parse(raw) as string[]) : []
    const base = Array.isArray(prev) ? prev : []
    localStorage.setItem(PRESENTE_VISTO_KEY, JSON.stringify([...new Set([...base, ...ids])].slice(-80)))
  } catch {
    /* ignore */
  }
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
  if (typeof data === 'string') {
    try {
      return rpcCreditos(JSON.parse(data))
    } catch {
      return {}
    }
  }
  if (Array.isArray(data)) return rpcCreditos(data[0])
  if (!data || typeof data !== 'object') return {}
  return data as RpcCreditos
}

function rpcOk(data: unknown): boolean {
  const o = rpcCreditos(data).ok
  return o === true || o === 'true'
}

function rpcComTempo<T>(p: Promise<T>, ms = 6000): Promise<T | null> {
  return new Promise((resolve) => {
    const t = window.setTimeout(() => resolve(null), ms)
    void p.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      () => {
        window.clearTimeout(t)
        resolve(null)
      },
    )
  })
}

export function creditosRotaPublico(): number {
  return lerCreditosLocais()
}

export async function consultarCreditosRotaPublico(): Promise<SaldoRotaPublico> {
  const vazio: SaldoRotaPublico = { creditos: 0, presente: 0, presenteIds: [] }
  const conta = await sessaoRotaPublico()
  if (conta && supabase) {
    const res = await rpcComTempo(supabase.rpc('rota_publico_meus_creditos'))
    if (res && !res.error) {
      const parsed = rpcCreditos(res.data)
      const n = Number(parsed.creditos)
      const presente = Number(parsed.presente)
      return {
        creditos: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0,
        presente: Number.isFinite(presente) && presente > 0 ? Math.floor(presente) : 0,
        presenteIds: idsPresente(parsed.presente_ids),
      }
    }
  }
  return { ...vazio, creditos: lerCreditosLocais() }
}

export async function saldoCreditosRotaPublico(): Promise<number> {
  return (await consultarCreditosRotaPublico()).creditos
}

export async function marcarPresenteRotaVisto(ids: string[]): Promise<void> {
  gravarPresenteVistoLocal(ids)
  if (!supabase || ids.length === 0) return
  await supabase.rpc('rota_publico_marcar_presente_visto', { p_ids: ids })
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
    const res = await rpcComTempo(supabase.rpc('rota_publico_consumir_credito'), 12000)
    if (res && !res.error && rpcOk(res.data)) return true
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
    return { ok: false, erro: 'Entre na calculadora para guardar os créditos na sua conta.' }
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
    if (parsed.erro === 'ja_usado') {
      const quando = parsed.quando ? ` em ${formatarQuandoPix(parsed.quando)}` : ''
      return {
        ok: false,
        erro: `Este código já adicionou os créditos${quando}. Comprovante antigo não gera crédito de novo.`,
        creditos: parsed.creditos,
      }
    }
    if (parsed.erro === 'nao_autenticado') {
      return { ok: false, erro: 'Entre na calculadora para guardar os créditos na sua conta.' }
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
    const res = await rpcComTempo(
      supabase.rpc('rota_publico_migrar_local', { p_saldo: local }),
    )
    if (!res || res.error || !rpcCreditos(res.data).ok) return local
    zerarCreditosLocais()
    const n = Number(rpcCreditos(res.data).creditos)
    return Number.isFinite(n) ? Math.floor(n) : 0
  }
  return local
}

export function novoTxidPix() {
  return `DOC${Date.now().toString(36).toUpperCase()}`.replace(/[^A-Z0-9]/g, '').slice(0, 25)
}

export type ConsultaPixCredito = {
  encontrado: boolean
  ja_creditado: boolean
  txid?: string
  email?: string
  pacote_id?: string
  creditos?: number
  valor?: number
  quando?: string
  saldo_atual?: number
  status?: string
}

function formatarQuandoPix(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR')
  } catch {
    return iso
  }
}

export async function consultarPixCreditoRota(txid: string): Promise<{
  ok: boolean
  erro?: string
  dados?: ConsultaPixCredito
}> {
  const codigo = txid.replace(/[^A-Za-z0-9_]/g, '')
  if (codigo.length < 6) return { ok: false, erro: 'Cole o código do pagamento (mínimo 6 caracteres).' }
  if (!supabase) return { ok: false, erro: 'Supabase não configurado.' }
  const { data, error } = await supabase.rpc('rota_publico_consultar_pix', { p_txid: codigo })
  const parsed = rpcCreditos(data)
  if (error) return { ok: false, erro: 'Não foi possível consultar. Rode o SQL de consulta PIX no Supabase.' }
  if (!parsed.ok) return { ok: false, erro: parsed.erro === 'codigo_curto' ? 'Código curto demais.' : 'Consulta inválida.' }
  return {
    ok: true,
    dados: {
      encontrado: Boolean(parsed.encontrado),
      ja_creditado: Boolean(parsed.ja_creditado ?? parsed.encontrado),
      txid: parsed.txid,
      email: parsed.email,
      pacote_id: parsed.pacote_id,
      creditos: parsed.creditos,
      valor: parsed.valor,
      quando: parsed.quando,
      saldo_atual: parsed.saldo_atual,
      status: parsed.status,
    },
  }
}
