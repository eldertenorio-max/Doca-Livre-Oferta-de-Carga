import type { ClassificacaoRota, Rota } from '../types'
import { isSupabaseConfigured, supabase } from './supabase'
import { isUuid, newVeiculoId } from './veiculosSync'

export function newRotaId(): string {
  return newVeiculoId()
}

function asClassificacao(raw: unknown): ClassificacaoRota {
  const v = String(raw || 'B').toUpperCase()
  if (v === 'A' || v === 'B' || v === 'C') return v
  return 'B'
}

export function mapRotaRow(row: Record<string, unknown>): Rota {
  return {
    id: String(row.id),
    descricao: String(row.descricao || ''),
    origem: String(row.origem || ''),
    destino: String(row.destino || ''),
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
  return (data ?? []).map((r) => mapRotaRow(r as Record<string, unknown>))
}

/** Une rotas locais com remotas; ids `r-…` / seed cedem ao UUID do servidor por origem+destino. */
export function mergeRotasLocalRemote(local: Rota[], remote: Rota[]): Rota[] {
  const byId = new Map<string, Rota>()
  for (const r of local) byId.set(r.id, r)

  const chave = (r: Rota) =>
    `${r.origem.trim().toLowerCase()}|${r.destino.trim().toLowerCase()}|${r.descricao.trim().toLowerCase()}`

  for (const rem of remote) {
    const k = chave(rem)
    for (const [id, loc] of [...byId.entries()]) {
      if (id === rem.id) continue
      if (isUuid(id)) continue
      if (chave(loc) !== k) continue
      byId.delete(id)
    }
    const prev = byId.get(rem.id)
    byId.set(rem.id, prev ? { ...prev, ...rem, id: rem.id } : rem)
  }

  return Array.from(byId.values())
}

export async function upsertRotaRemote(
  r: Rota,
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  if (!isSupabaseConfigured || !supabase) return { ok: true, id: r.id }
  const id = isUuid(r.id) ? r.id : newRotaId()
  const row = {
    id,
    descricao: r.descricao.trim(),
    origem: r.origem.trim(),
    destino: r.destino.trim(),
    classificacao: asClassificacao(r.classificacao),
    frete_tabela: Number(r.frete_tabela) || 0,
    km: Number(r.km) || 0,
    situacao: r.situacao === 'inativo' ? 'inativo' : 'ativo',
  }
  const { error } = await supabase.from('rotas').upsert(row)
  if (error) {
    console.warn('[rotas] falha ao gravar:', error.message)
    return { ok: false, erro: error.message }
  }
  return { ok: true, id }
}
