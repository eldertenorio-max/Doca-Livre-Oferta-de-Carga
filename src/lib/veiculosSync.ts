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

function mapGerenciamentoRisco(
  raw: unknown,
): Veiculo['gerenciamento_risco'] {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'rastreador' || v === 'localizador' || v === 'nenhum') return v
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
    origem_cep: (row.origem_cep as string) || undefined,
    origem_cidade: (row.origem_cidade as string) || undefined,
    origem_uf: (row.origem_uf as string) || undefined,
    origem_endereco: (row.origem_endereco as string) || undefined,
    origem_numero: (row.origem_numero as string) || undefined,
    origem_bairro: (row.origem_bairro as string) || undefined,
    origem_complemento: (row.origem_complemento as string) || undefined,
    origem_lat:
      row.origem_lat != null && Number.isFinite(Number(row.origem_lat))
        ? Number(row.origem_lat)
        : null,
    origem_lng:
      row.origem_lng != null && Number.isFinite(Number(row.origem_lng))
        ? Number(row.origem_lng)
        : null,
    raio_km: row.raio_km != null ? Number(row.raio_km) : undefined,
    usa_manobrista: Boolean(row.usa_manobrista),
    padiado: Boolean(row.padiado),
    gerenciamento_risco: mapGerenciamentoRisco(row.gerenciamento_risco),
    rastreador_dados: (row.rastreador_dados as string) || undefined,
    situacao: row.situacao === 'inativo' ? 'inativo' : 'ativo',
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: (row.updated_at as string) || undefined,
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
    if (!prev) {
      byId.set(r.id, r)
      continue
    }
    // Remoto sem coords não apaga localização local já salva
    const remotoTem =
      r.origem_lat != null &&
      r.origem_lng != null &&
      Number.isFinite(Number(r.origem_lat)) &&
      Number.isFinite(Number(r.origem_lng))
    const localTem =
      prev.origem_lat != null &&
      prev.origem_lng != null &&
      Number.isFinite(Number(prev.origem_lat)) &&
      Number.isFinite(Number(prev.origem_lng))
    if (!remotoTem && localTem) {
      byId.set(r.id, {
        ...prev,
        ...r,
        id: r.id,
        origem_cep: prev.origem_cep ?? r.origem_cep,
        origem_cidade: prev.origem_cidade ?? r.origem_cidade,
        origem_uf: prev.origem_uf ?? r.origem_uf,
        origem_endereco: prev.origem_endereco ?? r.origem_endereco,
        origem_numero: prev.origem_numero ?? r.origem_numero,
        origem_bairro: prev.origem_bairro ?? r.origem_bairro,
        origem_complemento: prev.origem_complemento ?? r.origem_complemento,
        origem_lat: prev.origem_lat,
        origem_lng: prev.origem_lng,
        raio_km: prev.raio_km ?? r.raio_km,
      })
    } else {
      byId.set(r.id, { ...prev, ...r, id: r.id })
    }
  }

  return Array.from(byId.values())
}

export async function upsertVeiculoRemote(
  v: Veiculo,
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  if (!isSupabaseConfigured || !supabase) return { ok: true, id: v.id }
  if (v.transportador_id && !isUuid(v.transportador_id)) {
    // Empresa de demonstração (t1/t2…) não cabe na FK; replica só via kanban_sync
    return { ok: true, id: v.id }
  }
  const id = isUuid(v.id) ? v.id : newVeiculoId()
  // Nunca grava base64 na tabela — só URL (Storage) ou vazio
  const limpo = veiculoParaSync({ ...v, id })
  const row = {
    id,
    placa: limpo.placa,
    transportador_id: limpo.transportador_id ?? null,
    renavam: limpo.renavam ?? null,
    condutor: limpo.condutor ?? null,
    tipo: limpo.tipo || 'Outros',
    marca: limpo.marca ?? null,
    modelo: limpo.modelo ?? null,
    cor: limpo.cor ?? null,
    ano_fabricacao: limpo.ano_fabricacao ?? null,
    ano_modelo: limpo.ano_modelo ?? null,
    uf_licenciamento: limpo.uf_licenciamento ?? null,
    foto_url: limpo.foto_url ?? null,
    fotos: limpo.fotos ?? {},
    tipo_carroceria: limpo.tipo_carroceria ?? null,
    qtd_pallets: limpo.qtd_pallets ?? null,
    aclimatacao: limpo.aclimatacao ?? null,
    capacidade_kg: limpo.capacidade_kg ?? null,
    cubagem_m3: limpo.cubagem_m3 ?? null,
    eixos: limpo.eixos ?? null,
    frete_minimo: limpo.frete_minimo ?? 0,
    usa_manobrista: Boolean(limpo.usa_manobrista),
    padiado: Boolean(limpo.padiado),
    gerenciamento_risco: limpo.gerenciamento_risco ?? 'nenhum',
    rastreador_dados:
      limpo.gerenciamento_risco === 'rastreador'
        ? (limpo.rastreador_dados ?? null)
        : null,
    situacao: limpo.situacao,
    disponivel_mapa: limpo.disponivel_mapa !== false,
    origem_cep: limpo.origem_cep ?? null,
    origem_cidade: limpo.origem_cidade ?? null,
    origem_uf: limpo.origem_uf ?? null,
    origem_endereco: limpo.origem_endereco ?? null,
    origem_numero: limpo.origem_numero ?? null,
    origem_bairro: limpo.origem_bairro ?? null,
    origem_complemento: limpo.origem_complemento ?? null,
    origem_lat: limpo.origem_lat ?? null,
    origem_lng: limpo.origem_lng ?? null,
    raio_km: limpo.raio_km ?? null,
    updated_at: limpo.updated_at ?? new Date().toISOString(),
  }
  const { error } = await supabase.from('veiculos').upsert(row)
  if (!error) return { ok: true, id }

  // Colunas novas / updated_at podem ainda não existir — remove e tenta de novo
  let retryRow: Record<string, unknown> = { ...row }
  let stripped = false
  if (/updated_at/i.test(error.message)) {
    const { updated_at: _u, ...rest } = retryRow
    retryRow = rest
    stripped = true
  }
  if (/gerenciamento_risco|rastreador_dados/i.test(error.message)) {
    const { gerenciamento_risco: _g, rastreador_dados: _r, ...rest } = retryRow
    retryRow = rest
    stripped = true
  }
  if (/origem_|raio_km/i.test(error.message)) {
    const {
      origem_cep: _c,
      origem_cidade: _ci,
      origem_uf: _u,
      origem_endereco: _e,
      origem_numero: _n,
      origem_bairro: _b,
      origem_complemento: _co,
      origem_lat: _la,
      origem_lng: _ln,
      raio_km: _r,
      ...rest
    } = retryRow
    retryRow = rest
    stripped = true
  }
  if (stripped) {
    const retry = await supabase.from('veiculos').upsert(retryRow)
    if (retry.error) return { ok: false, erro: retry.error.message }
    return { ok: true, id }
  }
  return { ok: false, erro: error.message }
}

export async function deleteVeiculoRemote(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !isUuid(id)) return
  await supabase.from('veiculos').delete().eq('id', id)
}

const BUCKET_FOTOS = 'veiculos-fotos'

function isDataUrl(value?: string | null): boolean {
  return typeof value === 'string' && value.startsWith('data:')
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } | null {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) return null
  const mime = match[1] || 'image/jpeg'
  const bytes = match[2]
    ? Uint8Array.from(atob(match[3]), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(match[3]))
  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
  return { blob: new Blob([bytes], { type: mime }), ext }
}

/**
 * Sobe as fotos em base64 para o Storage e devolve o veículo só com URLs.
 * Sem isso o cadastro não trafega entre usuários (payload gigante).
 */
export async function subirFotosVeiculo(v: Veiculo): Promise<Veiculo> {
  if (!isSupabaseConfigured || !supabase) return v
  const fotos = { ...(v.fotos ?? {}) } as Record<string, string | undefined>
  const slots = Object.keys(fotos).filter((s) => isDataUrl(fotos[s]))
  if (slots.length === 0) return v

  for (const slot of slots) {
    const parsed = dataUrlToBlob(fotos[slot] as string)
    if (!parsed) continue
    const path = `${v.id}/${slot}.${parsed.ext}`
    const { error } = await supabase.storage
      .from(BUCKET_FOTOS)
      .upload(path, parsed.blob, { upsert: true, contentType: parsed.blob.type })
    if (error) {
      console.warn('[veiculos] falha ao subir foto:', slot, error.message)
      continue
    }
    const { data } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(path)
    if (data?.publicUrl) fotos[slot] = data.publicUrl
  }

  const next = { ...v, fotos: fotos as Veiculo['fotos'] }
  if (isDataUrl(next.foto_url) && fotos.dianteira && !isDataUrl(fotos.dianteira)) {
    next.foto_url = fotos.dianteira
  }
  return next
}

/** Remove base64 do que vai no sync — só URL trafega entre usuários. */
export function veiculoParaSync(v: Veiculo): Veiculo {
  const fotos = v.fotos ?? {}
  const limpas = Object.fromEntries(
    Object.entries(fotos).filter(([, url]) => !isDataUrl(url)),
  ) as Veiculo['fotos']
  const foto_url = isDataUrl(v.foto_url) ? undefined : v.foto_url
  return { ...v, fotos: limpas, foto_url }
}
