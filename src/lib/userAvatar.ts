import { isSupabaseConfigured, supabase } from './supabase'

function dataUrlFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Falha ao ler imagem'))
    reader.readAsDataURL(file)
  })
}

/** Salva avatar do usuário (Storage + profiles.avatar_url, com fallback data URL). */
export async function atualizarAvatarUsuarioRemoto(
  userId: string,
  file: File | null,
): Promise<{ ok: true; avatar_url: string | null } | { ok: false; erro: string }> {
  const uid = (userId || '').trim()
  if (!uid) return { ok: false, erro: 'Usuário inválido.' }

  if (!file) {
    if (isSupabaseConfigured && supabase) {
      const exts = ['jpg', 'jpeg', 'png', 'webp']
      await supabase.storage
        .from('veiculos-fotos')
        .remove(exts.map((ext) => `avatars/${uid}/avatar.${ext}`))
      await supabase.from('profiles').update({ avatar_url: null }).eq('id', uid)
    }
    return { ok: true, avatar_url: null }
  }

  if (file.size > 4 * 1024 * 1024) {
    return { ok: false, erro: 'A imagem deve ter no máximo 4 MB.' }
  }

  const ext =
    file.type?.split('/')[1]?.replace('jpeg', 'jpg') ||
    (file.name.match(/\.(jpe?g|png|webp)$/i)?.[1] ?? 'jpg')

  if (!isSupabaseConfigured || !supabase) {
    try {
      return { ok: true, avatar_url: await dataUrlFromFile(file) }
    } catch {
      return { ok: false, erro: 'Não foi possível ler a imagem.' }
    }
  }

  const path = `avatars/${uid}/avatar.${ext}`
  const { error: upErr } = await supabase.storage
    .from('veiculos-fotos')
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })

  let avatarUrl: string | null = null
  if (!upErr) {
    const { data: pub } = supabase.storage.from('veiculos-fotos').getPublicUrl(path)
    avatarUrl = `${pub.publicUrl}${pub.publicUrl.includes('?') ? '&' : '?'}v=${Date.now()}`
  } else {
    try {
      avatarUrl = await dataUrlFromFile(file)
    } catch {
      return {
        ok: false,
        erro: `Falha no upload da foto: ${upErr.message}`,
      }
    }
  }

  const { error: dbErr } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', uid)

  // Coluna pode não existir ainda — sessão local ainda guarda a foto
  if (dbErr && !/avatar_url/i.test(dbErr.message)) {
    console.warn('[avatar] update profiles:', dbErr.message)
  }

  return { ok: true, avatar_url: avatarUrl }
}
