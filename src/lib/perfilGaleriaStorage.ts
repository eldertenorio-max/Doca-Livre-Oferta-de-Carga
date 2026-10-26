/**
 * Galeria do perfil público no Storage — base64 na galeria deixava o
 * kanban_sync com MBs e atrasava cargas/notificações no celular.
 */

import type { Transportador } from '../types'
import { isSupabaseConfigured, supabase } from './supabase'
import { caminhoGaleria } from './arquivosSombra'
import { dataUrlToBlob, isDataUrl } from './veiculosSync'

const BUCKET = 'veiculos-fotos'

function hashConteudo(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `${(h >>> 0).toString(36)}${s.length.toString(36)}`
}

async function subirBlob(tid: string, blob: Blob, ext: string, chave: string): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const path = caminhoGaleria(tid, chave, ext)
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' })
  if (error) {
    console.warn('[perfil] falha ao subir imagem da galeria:', error.message)
    return null
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data?.publicUrl || null
}

/** Sobe a imagem recortada e devolve a URL pública (null = usar data URL). */
export async function subirImagemGaleriaPerfil(
  tid: string | null | undefined,
  file: File,
): Promise<string | null> {
  const ext = file.type?.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
  const chave = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return subirBlob(tid || '', file, ext, chave)
}

export function galeriaTemBase64(t: Pick<Transportador, 'perfil_publico'>): boolean {
  return (t.perfil_publico?.galeria ?? []).some((g) => isDataUrl(g))
}

/** Troca base64 da galeria por URL do Storage. Null = nada mudou ou upload falhou. */
export async function migrarGaleriaParaStorage(
  t: Transportador,
): Promise<NonNullable<Transportador['perfil_publico']> | null> {
  const perfil = t.perfil_publico
  if (!perfil || !galeriaTemBase64(t)) return null
  const galeria: string[] = []
  for (const g of perfil.galeria) {
    if (!isDataUrl(g)) {
      galeria.push(g)
      continue
    }
    const parsed = dataUrlToBlob(g)
    if (!parsed) return null
    const url = await subirBlob(t.id, parsed.blob, parsed.ext, hashConteudo(g))
    if (!url) return null
    galeria.push(url)
  }
  return { ...perfil, galeria }
}
