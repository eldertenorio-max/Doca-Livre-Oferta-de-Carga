import type { ClassificacaoRota, Rota } from '../types'
import { isSupabaseConfigured, supabase } from './supabase'
import { isUuid, newVeiculoId } from './veiculosSync'

export function newRotaId(): string {
  return newVeiculoId()
}

/** Seeds fixos do demo — não migrar para UUID (evita duplicar a cada refresh). */
const SEED_ROTA_IDS = new Set(['r1', 'r2', 'r3', 'r4'])

export function isSeedRotaId(id: string): boolean {
  return SEED_ROTA_IDS.has(id)
}

function asClassificacao(raw: unknown): ClassificacaoRota {
  const v = String(raw || 'B').toUpperCase()
  if (v === 'A' || v === 'B' || v === 'C') return v
  return 'B'
}

function normTxt(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Chave estável para detectar a mesma rota (origem + destino). */
export function chaveRota(r: Pick<Rota, 'origem' | 'destino'>): string {
  return `${normTxt(r.origem)}|${normTxt(r.destino)}`
}

function scoreRota(x: Rota): number {
  return (
    (isUuid(x.id) ? 100 : isSeedRotaId(x.id) ? 10 : 50) +
    (x.situacao === 'ativo' ? 5 : 0)
  )
}

function escolherMelhorRota(a: Rota, b: Rota): Rota {
  const sa = scoreRota(a)
  const sb = scoreRota(b)
  if (sb > sa) return b
  if (sa > sb) return a
  if (isUuid(b.id) && !isUuid(a.id)) return b
  return a
}

/**
 * Remove duplicatas da mesma origem→destino.
 * Prefere: UUID > id local; ativo > inativo.
 */
export function dedupeRotas(rotas: Rota[]): Rota[] {
  const best = new Map<string, Rota>()
  for (const r of rotas) {
    const k = chaveRota(r)
    if (!k || k === '|') continue
    const prev = best.get(k)
    best.set(k, prev ? escolherMelhorRota(prev, r) : r)
  }
  return Array.from(best.values())
}

function asCoord(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function mapRotaRow(row: Record<string, unknown>): Rota {
  return {
    id: String(row.id),
    descricao: String(row.descricao || ''),
    origem: String(row.origem || ''),
    destino: String(row.destino || ''),
    origem_lat: asCoord(row.origem_lat),
    origem_lng: asCoord(row.origem_lng),
    destino_lat: asCoord(row.destino_lat),
    destino_lng: asCoord(row.destino_lng),
    classificacao: asClassificacao(row.classificacao),
    frete_tabela: Number(row.frete_tabela) || 0,
    km: Number(row.km) || 0,
    situacao: row.situacao === 'inativo' ? 'inativo' : 'ativo',
  }
}

export async function carregarRotasDoSupabase(): Promise<Rota[] | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase.from('rotas').select('*').order('created_at', {
    ascending: false,
  })
  if (error) {
    console.warn('[rotas] falha ao listar:', error.message)
    return null
  }
  return dedupeRotas((data ?? []).map((r) => mapRotaRow(r as Record<string, unknown>)))
}

/** Une rotas locais com remotas e remove duplicatas origem→destino. */
export function mergeRotasLocalRemote(local: Rota[], remote: Rota[]): Rota[] {
  const byId = new Map<string, Rota>()
  for (const r of local) byId.set(r.id, r)

  for (const rem of remote) {
    const k = chaveRota(rem)
    for (const [id, loc] of [...byId.entries()]) {
      if (id === rem.id) continue
      if (chaveRota(loc) !== k) continue
      // Remoto UUID ganha de seed / id local antigo
      if (isUuid(rem.id) || !isUuid(id)) byId.delete(id)
    }
    const prev = byId.get(rem.id)
    byId.set(rem.id, prev ? { ...prev, ...rem, id: rem.id } : rem)
  }

  return dedupeRotas(Array.from(byId.values()))
}

export async function upsertRotaRemote(
  r: Rota,
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  if (!isSupabaseConfigured || !supabase) return { ok: true, id: r.id }
  const id = isUuid(r.id) ? r.id : newRotaId()
  const row: Record<string, unknown> = {
    id,
    descricao: r.descricao.trim(),
    origem: r.origem.trim(),
    destino: r.destino.trim(),
    origem_lat: r.origem_lat ?? null,
    origem_lng: r.origem_lng ?? null,
    destino_lat: r.destino_lat ?? null,
    destino_lng: r.destino_lng ?? null,
    classificacao: asClassificacao(r.classificacao),
    frete_tabela: Number(r.frete_tabela) || 0,
    km: Number(r.km) || 0,
    situacao: r.situacao === 'inativo' ? 'inativo' : 'ativo',
  }
  const { error } = await supabase.from('rotas').upsert(row)
  if (!error) return { ok: true, id }

  // Colunas de coordenadas ainda não existem no Supabase
  if (/origem_lat|origem_lng|destino_lat|destino_lng/i.test(error.message)) {
    const {
      origem_lat: _ol,
      origem_lng: _og,
      destino_lat: _dl,
      destino_lng: _dg,
      ...rest
    } = row
    const retry = await supabase.from('rotas').upsert(rest)
    if (retry.error) {
      console.warn('[rotas] falha ao gravar:', retry.error.message)
      return { ok: false, erro: retry.error.message }
    }
    return { ok: true, id }
  }

  console.warn('[rotas] falha ao gravar:', error.message)
  return { ok: false, erro: error.message }
}

/**
 * Rotas que ainda precisam migrar para UUID/tabela:
 * — não é seed demo
 * — não é UUID
 * — ainda não existe outra rota UUID com a mesma origem/destino
 */
export function rotasPendentesMigracao(rotas: Rota[]): Rota[] {
  const keysComUuid = new Set(
    rotas.filter((r) => isUuid(r.id)).map((r) => chaveRota(r)),
  )
  return rotas.filter((r) => {
    if (isUuid(r.id) || isSeedRotaId(r.id)) return false
    if (keysComUuid.has(chaveRota(r))) return false
    return true
  })
}
