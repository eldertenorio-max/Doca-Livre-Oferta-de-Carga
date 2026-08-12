import type { ClassificacaoRota, PontoPassagemRota, Rota } from '../types'
import { isSupabaseConfigured, supabase } from './supabase'
import { isUuid, newVeiculoId } from './veiculosSync'

export function newRotaId(): string {
  return newVeiculoId()
}

export function newPontoPassagemId(): string {
  return `pp_${Math.random().toString(36).slice(2, 10)}`
}

export function limparPontosPassagemRota(
  pontos: PontoPassagemRota[] | undefined,
): PontoPassagemRota[] {
  return (pontos ?? [])
    .filter((p) => {
      const end = (p.endereco || '').trim()
      if (end.length >= 3) return true
      return (
        p.lat != null &&
        p.lng != null &&
        Number.isFinite(Number(p.lat)) &&
        Number.isFinite(Number(p.lng))
      )
    })
    .map((p) => ({
      id: p.id || newPontoPassagemId(),
      endereco: (p.endereco || '').trim(),
      lat: p.lat ?? null,
      lng: p.lng ?? null,
    }))
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

/** Chave estável para detectar a mesma rota (origem + vias + destino). */
export function chaveRota(
  r: Pick<Rota, 'origem' | 'destino'> & { pontos_passagem?: PontoPassagemRota[] },
): string {
  const vias = (r.pontos_passagem ?? [])
    .map((p) => normTxt(p.endereco || ''))
    .filter(Boolean)
    .join('>')
  return vias
    ? `${normTxt(r.origem)}|via:${vias}|${normTxt(r.destino)}`
    : `${normTxt(r.origem)}|${normTxt(r.destino)}`
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

function mapPontosPassagem(raw: unknown): PontoPassagemRota[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return null
      const o = item as Record<string, unknown>
      const endereco = String(o.endereco || '').trim()
      if (!endereco) return null
      return {
        id: String(o.id || `pp_${idx}`),
        endereco,
        lat: asCoord(o.lat),
        lng: asCoord(o.lng),
      } satisfies PontoPassagemRota
    })
    .filter((p): p is PontoPassagemRota => Boolean(p))
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
    pontos_passagem: mapPontosPassagem(row.pontos_passagem),
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
    if (!prev) {
      byId.set(rem.id, rem)
      continue
    }
    const pontosRem = rem.pontos_passagem ?? []
    const pontosPrev = prev.pontos_passagem ?? []
    byId.set(rem.id, {
      ...prev,
      ...rem,
      id: rem.id,
      // Sync sem coluna / array vazio não apaga waypoints locais
      pontos_passagem: pontosRem.length > 0 ? pontosRem : pontosPrev,
      origem_lat: rem.origem_lat ?? prev.origem_lat ?? null,
      origem_lng: rem.origem_lng ?? prev.origem_lng ?? null,
      destino_lat: rem.destino_lat ?? prev.destino_lat ?? null,
      destino_lng: rem.destino_lng ?? prev.destino_lng ?? null,
      km: rem.km > 0 ? rem.km : prev.km || 0,
    })
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
    pontos_passagem: limparPontosPassagemRota(r.pontos_passagem).map((p) => ({
      id: p.id,
      endereco: p.endereco.trim(),
      lat: p.lat ?? null,
      lng: p.lng ?? null,
    })),
    classificacao: asClassificacao(r.classificacao),
    frete_tabela: Number(r.frete_tabela) || 0,
    km: Number(r.km) || 0,
    situacao: r.situacao === 'inativo' ? 'inativo' : 'ativo',
  }
  const { error } = await supabase.from('rotas').upsert(row)
  if (!error) return { ok: true, id }

  // Colunas novas ainda não existem no Supabase
  if (/pontos_passagem/i.test(error.message)) {
    const { pontos_passagem: _pp, ...semPontos } = row
    const retryPp = await supabase.from('rotas').upsert(semPontos)
    if (!retryPp.error) return { ok: true, id }
    // segue para fallback de coords se necessário
    if (/origem_lat|origem_lng|destino_lat|destino_lng/i.test(retryPp.error.message)) {
      const {
        origem_lat: _ol,
        origem_lng: _og,
        destino_lat: _dl,
        destino_lng: _dg,
        ...rest
      } = semPontos
      const retry = await supabase.from('rotas').upsert(rest)
      if (retry.error) {
        console.warn('[rotas] falha ao gravar:', retry.error.message)
        return { ok: false, erro: retry.error.message }
      }
      return { ok: true, id }
    }
    console.warn('[rotas] falha ao gravar:', retryPp.error.message)
    return { ok: false, erro: retryPp.error.message }
  }

  // Colunas de coordenadas ainda não existem no Supabase
  if (/origem_lat|origem_lng|destino_lat|destino_lng/i.test(error.message)) {
    const {
      origem_lat: _ol,
      origem_lng: _og,
      destino_lat: _dl,
      destino_lng: _dg,
      pontos_passagem: _pp,
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
