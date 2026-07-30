import { isSupabaseConfigured, supabase } from './supabase'

function dataUrlFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Falha ao ler imagem'))
    reader.readAsDataURL(file)
  })
}

function validUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  )
}

function norm(v?: string | null) {
  return (v || '').trim().toLowerCase()
}

export type AvatarUserHints = {
  email?: string | null
  usuario?: string | null
}

/** Resolve o id real em `usuarios` (UUID do banco), mesmo se a sessão ainda tiver id local. */
async function resolveUsuarioDbId(
  userId: string,
  hints?: AvatarUserHints,
): Promise<string | null> {
  if (!supabase) return null

  if (validUuid(userId)) {
    const { data } = await supabase
      .from('usuarios')
      .select('id')
      .eq('id', userId)
      .maybeSingle()
    if (data?.id) return String(data.id)
  }

  const tries: Array<{ col: 'email' | 'usuario'; value: string }> = []
  const email = norm(hints?.email)
  const usuario = (hints?.usuario || '').trim()
  if (email.includes('@')) tries.push({ col: 'email', value: email })
  if (usuario) tries.push({ col: 'usuario', value: usuario })

  for (const t of tries) {
    const { data } = await supabase
      .from('usuarios')
      .select('id')
      .ilike(t.col, t.value)
      .limit(1)
      .maybeSingle()
    if (data?.id) return String(data.id)
  }

  return null
}

async function gravarAvatarNoBanco(
  userId: string,
  avatarUrl: string | null,
  hints?: AvatarUserHints,
): Promise<{ ok: true; dbId: string | null } | { ok: false; erro: string }> {
  if (!supabase) return { ok: true, dbId: null }

  const dbId = await resolveUsuarioDbId(userId, hints)
  let wroteUsuarios = false

  if (dbId) {
    const { error } = await supabase
      .from('usuarios')
      .update({ avatar_url: avatarUrl })
      .eq('id', dbId)
    if (error) {
      if (/avatar_url/i.test(error.message)) {
        return {
          ok: false,
          erro:
            'Coluna avatar_url ausente em usuarios. Rode supabase/usuario_avatar.sql no SQL Editor.',
        }
      }
      return { ok: false, erro: error.message }
    }
    wroteUsuarios = true
  }

  // Contas Auth / cadastro público (profiles.id = UUID)
  if (validUuid(userId) || (dbId && validUuid(dbId))) {
    const profileId = validUuid(userId) ? userId : dbId!
    const { error: pErr } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', profileId)
    if (pErr && !/avatar_url|Could not find|schema cache/i.test(pErr.message)) {
      console.warn('[avatar] update profiles:', pErr.message)
    }
  }

  if (!wroteUsuarios && !validUuid(userId)) {
    return {
      ok: false,
      erro:
        'Não encontrei sua conta em usuarios para gravar a foto. Faça login de novo ou rode o SQL do portal.',
    }
  }

  return { ok: true, dbId }
}

/** Busca avatar remoto (usuarios → profiles) para hidratar a sessão em outro aparelho. */
export async function buscarAvatarUsuarioRemoto(
  userId: string,
  hints?: AvatarUserHints,
): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null

  const dbId = await resolveUsuarioDbId(userId, hints)
  if (dbId) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('avatar_url')
      .eq('id', dbId)
      .maybeSingle()
    if (!error) {
      const url = typeof data?.avatar_url === 'string' ? data.avatar_url.trim() : ''
      if (url) return url
    } else if (!/avatar_url|Could not find|schema cache/i.test(error.message)) {
      console.warn('[avatar] select usuarios:', error.message)
    }
  }

  const profileId = validUuid(userId) ? userId : dbId
  if (profileId && validUuid(profileId)) {
    const { data } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', profileId)
      .maybeSingle()
    const url = typeof data?.avatar_url === 'string' ? data.avatar_url.trim() : ''
    if (url) return url
  }

  return null
}

/** Salva avatar do usuário (Storage + usuarios.avatar_url; profiles se UUID). */
export async function atualizarAvatarUsuarioRemoto(
  userId: string,
  file: File | null,
  hints?: AvatarUserHints,
): Promise<{ ok: true; avatar_url: string | null } | { ok: false; erro: string }> {
  const uid = (userId || '').trim()
  if (!uid) return { ok: false, erro: 'Usuário inválido.' }

  if (!file) {
    if (isSupabaseConfigured && supabase) {
      const dbId = (await resolveUsuarioDbId(uid, hints)) || uid
      const folder = validUuid(dbId) ? dbId : uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
      const exts = ['jpg', 'jpeg', 'png', 'webp']
      await supabase.storage
        .from('veiculos-fotos')
        .remove(exts.map((ext) => `avatars/${folder}/avatar.${ext}`))
      const gravou = await gravarAvatarNoBanco(uid, null, hints)
      if (!gravou.ok) return gravou
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

  const dbId = (await resolveUsuarioDbId(uid, hints)) || uid
  const folder = validUuid(dbId) ? dbId : uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
  const path = `avatars/${folder}/avatar.${ext}`

  const { error: upErr } = await supabase.storage
    .from('veiculos-fotos')
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })

  let avatarUrl: string | null = null
  if (!upErr) {
    const { data: pub } = supabase.storage.from('veiculos-fotos').getPublicUrl(path)
    avatarUrl = `${pub.publicUrl}${pub.publicUrl.includes('?') ? '&' : '?'}v=${Date.now()}`
  } else {
    // Fallback: data URL no banco ainda sincroniza entre aparelhos
    try {
      avatarUrl = await dataUrlFromFile(file)
      console.warn('[avatar] storage falhou, salvando data URL:', upErr.message)
    } catch {
      return {
        ok: false,
        erro: `Falha no upload da foto: ${upErr.message}`,
      }
    }
  }

  const gravou = await gravarAvatarNoBanco(uid, avatarUrl, hints)
  if (!gravou.ok) return gravou

  return { ok: true, avatar_url: avatarUrl }
}
