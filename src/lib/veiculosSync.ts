import type { Veiculo, FotosVeiculo } from '../types'
import { isSupabaseConfigured, supabase } from './supabase'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value?: string | null): boolean {
  return Boolean(value && UUID_RE.test(value))
}

export function newVeiculoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function normPlaca(placa: string): string {
  return (placa || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

function mapFotos(raw: unknown, fotoUrl?: string | null): FotosVeiculo | undefined {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as FotosVeiculo
  }
  if (fotoUrl) return { dianteira: fotoUrl } as FotosVeiculo
  return undefined
}

export function mapVeiculoRow(row: Record<string, unknown>): Veiculo {
  const fotos = mapFotos(row.fotos, row.foto_url as string | null)
  return {
    id: String(row.id),
    placa: String(row.placa || '').toUpperCase(),
    transportador_id: (row.transportador_id as string | null) ?? null,
    renavam: (row.renavam as string) || undefined,
    condutor: (row.condutor as string) || undefined,
    tipo: String(row.tipo || 'Outros'),
    marca: (row.marca as string) || undefined,
    modelo: (row.modelo as string) || undefined,
    cor: (row.cor as string) || undefined,
    ano_fabricacao: (row.ano_fabricacao as string) || undefined,
    ano_modelo: (row.ano_modelo as string) || undefined,
    uf_licenciamento: (row.uf_licenciamento as string) || undefined,
    foto_url: (row.foto_url as string) || fotos?.dianteira,
    fotos,
    tipo_carroceria: (row.tipo_carroceria as string) || undefined,
    qtd_pallets: row.qtd_pallets != null ? Number(row.qtd_pallets) : undefined,
    aclimatacao: (row.aclimatacao as string) || undefined,
    capacidade_kg: row.capacidade_kg != null ? Number(row.capacidade_kg) : undefined,
    cubagem_m3: row.cubagem_m3 != null ? Number(row.cubagem_m3) : undefined,
    eixos: row.eixos != null ? Number(row.eixos) : undefined,
    frete_minimo: Number(row.frete_minimo) || 0,
    disponivel_mapa: row.disponivel_mapa !== false,
    usa_manobrista: Boolean(row.usa_manobrista),
    padiado: Boolean(row.padiado),
    situacao: row.situacao === 'inativo' ? 'inativo' : 'ativo',
    created_at: String(row.created_at || new Date().toISOString()),
  }
}

export async function carregarVeiculosDoSupabase(): Promise<Veiculo[] | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase.from('veiculos').select('*').order('created_at', {
    ascending: false,
  })
  if (error) {
    console.warn('[veiculos] falha ao listar:', error.message)
    return null
  }
  return (data ?? []).map((r) => mapVeiculoRow(r as Record<string, unknown>))
}

/** Une frota local com a remota (placa local `v-…` cede ao UUID do servidor). */
export function mergeVeiculosLocalRemote(local: Veiculo[], remote: Veiculo[]): Veiculo[] {
  const byId = new Map<string, Veiculo>()
  for (const v of local) byId.set(v.id, v)

  for (const r of remote) {
    const placaR = normPlaca(r.placa)
    // Remove duplicata local sem UUID com a mesma placa (+ mesma empresa, se houver)
    for (const [id, v] of [...byId.entries()]) {
      if (id === r.id) continue
      if (isUuid(id)) continue
      if (normPlaca(v.placa) !== placaR) continue
      if (
        r.transportador_id &&
        v.transportador_id &&
        r.transportador_id !== v.transportador_id
      ) {
        continue
      }
      byId.delete(id)
    }
    const prev = byId.get(r.id)
    byId.set(r.id, prev ? { ...prev, ...r, id: r.id } : r)
  }

  return Array.from(byId.values())
}

export async function upsertVeiculoRemote(
  v: Veiculo,
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  if (!isSupabaseConfigured || !supabase) return { ok: true, id: v.id }
  if (!isUuid(v.transportador_id)) {
    // Sem empresa UUID não cabe na FK do Supabase
    return { ok: true, id: v.id }
  }
  const id = isUuid(v.id) ? v.id : newVeiculoId()
  const row = {
    id,
    placa: v.placa,
    transportador_id: v.transportador_id,
    renavam: v.renavam ?? null,
    condutor: v.condutor ?? null,
    tipo: v.tipo,
    marca: v.marca ?? null,
    modelo: v.modelo ?? null,
    cor: v.cor ?? null,
    ano_fabricacao: v.ano_fabricacao ?? null,
    ano_modelo: v.ano_modelo ?? null,
    uf_licenciamento: v.uf_licenciamento ?? null,
    foto_url: v.foto_url ?? null,
    fotos: v.fotos ?? {},
    tipo_carroceria: v.tipo_carroceria ?? null,
    qtd_pallets: v.qtd_pallets ?? null,
    aclimatacao: v.aclimatacao ?? null,
    capacidade_kg: v.capacidade_kg ?? null,
    cubagem_m3: v.cubagem_m3 ?? null,
    eixos: v.eixos ?? null,
    frete_minimo: v.frete_minimo ?? 0,
    usa_manobrista: Boolean(v.usa_manobrista),
    padiado: Boolean(v.padiado),
    situacao: v.situacao,
    disponivel_mapa: v.disponivel_mapa !== false,
  }
  const { error } = await supabase.from('veiculos').upsert(row)
  if (error) return { ok: false, erro: error.message }
  return { ok: true, id }
}

export async function deleteVeiculoRemote(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !isUuid(id)) return
  await supabase.from('veiculos').delete().eq('id', id)
}
